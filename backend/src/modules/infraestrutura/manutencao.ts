import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireAuth, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, pageParams, qs, dateISO } from '../core/crud'
import { audit, notify } from '../core/notify'
import { scheduleReminder, completeReminders, cancelReminders } from '../core/reminders'
import { avaliarPlano, prazoSla, situacaoSla, mttrHoras, Prioridade } from './calc'
import { GESTAO, LEITURA, MODULO, ensureBem, ensureSpace, fail, money, nextSeq } from './util'

const PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const
const OS_ABERTAS = ['ABERTA', 'AGENDADA', 'EM_EXECUCAO', 'AGUARDANDO_PECA'] as const
const sev = (p: string) => (p === 'URGENTE' ? 'CRITICO' : p === 'ALTA' ? 'ATENCAO' : 'INFO') as 'CRITICO' | 'ATENCAO' | 'INFO'

// Transições válidas da máquina de estados da OS.
export const TRANSICOES_OS: Record<string, string[]> = {
  ABERTA: ['AGENDADA', 'EM_EXECUCAO', 'CANCELADA'],
  AGENDADA: ['ABERTA', 'EM_EXECUCAO', 'CANCELADA'],
  EM_EXECUCAO: ['AGUARDANDO_PECA', 'CONCLUIDA', 'CANCELADA'],
  AGUARDANDO_PECA: ['EM_EXECUCAO', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
}

export interface NovaOsInput {
  tenantId: string
  userId?: string
  tipo?: 'CORRETIVA' | 'PREVENTIVA' | 'PREDITIVA' | 'MELHORIA'
  prioridade?: Prioridade
  titulo: string
  descricao?: string | null
  bemId?: string | null
  spaceId?: string | null
  chamadoId?: string | null
  planoId?: string | null
  fornecedorId?: string | null
  responsavelUserId?: string | null
  agendadaPara?: Date | null
  prazo?: Date
  checklist?: any
  bemParado?: boolean
}

// Cria OS com numeração, SLA, lembrete de prazo e (se o bem ficar parado) marca o bem EM_MANUTENCAO.
export async function criarOrdemServico(i: NovaOsInput) {
  const agora = new Date()
  const prioridade = i.prioridade ?? 'MEDIA'
  const numero = `OS-${agora.getFullYear()}-${String(await nextSeq(i.tenantId, `OS-${agora.getFullYear()}`)).padStart(5, '0')}`
  const prazo = i.prazo ?? prazoSla(agora, prioridade)
  const os = await prisma.infOrdemServico.create({
    data: {
      tenantId: i.tenantId, numero, tipo: i.tipo ?? 'CORRETIVA', prioridade, titulo: i.titulo, descricao: i.descricao,
      bemId: i.bemId, spaceId: i.spaceId, chamadoId: i.chamadoId, planoId: i.planoId, fornecedorId: i.fornecedorId,
      responsavelUserId: i.responsavelUserId, agendadaPara: i.agendadaPara, abertaEm: agora, prazoSla: prazo,
      status: i.agendadaPara ? 'AGENDADA' : 'ABERTA', checklist: i.checklist ?? undefined,
      bemParado: i.bemParado ?? (!!i.bemId && (i.tipo ?? 'CORRETIVA') === 'CORRETIVA'),
    },
  })
  if (os.bemParado && os.bemId) await prisma.infBem.updateMany({ where: { id: os.bemId, tenantId: i.tenantId, status: 'ATIVO' }, data: { status: 'EM_MANUTENCAO' } })
  await scheduleReminder({
    tenantId: i.tenantId, modulo: MODULO, titulo: `OS ${numero}: ${os.titulo}`, descricao: `Prioridade ${prioridade}`, dueAt: prazo,
    remindAt: new Date(Math.min(prazo.getTime(), Math.max(agora.getTime(), prazo.getTime() - (prioridade === 'URGENTE' ? 1 : prioridade === 'ALTA' ? 6 : 24) * 3_600_000))),
    severity: sev(prioridade), refType: 'InfOrdemServico', refId: os.id, assigneeUserId: i.responsavelUserId ?? undefined,
    assigneeRole: i.responsavelUserId ? undefined : 'FACILITIES', dedupeKey: `inf-os-${os.id}`,
  })
  await audit({ tenantId: i.tenantId, userId: i.userId, modulo: MODULO, acao: 'OS_ABERTA', refType: 'InfOrdemServico', refId: os.id, detalhes: { numero, tipo: os.tipo } })
  return os
}

export interface NovoChamadoInput {
  tenantId: string
  solicitanteUserId: string
  categoria?: string
  prioridade?: Prioridade
  titulo: string
  descricao?: string | null
  spaceId?: string | null
  bemId?: string | null
  origem?: string
  fotoUrl?: string | null
}

// Abre chamado (helpdesk predial/TI). Exportado para outros módulos/ rotinas internas.
export async function abrirChamado(i: NovoChamadoInput) {
  const ano = new Date().getFullYear()
  const numero = `CH-${ano}-${String(await nextSeq(i.tenantId, `CH-${ano}`)).padStart(5, '0')}`
  const prioridade = i.prioridade ?? 'MEDIA'
  const ch = await prisma.infChamado.create({
    data: { tenantId: i.tenantId, numero, categoria: (i.categoria as any) ?? 'PREDIAL', prioridade, titulo: i.titulo, descricao: i.descricao, spaceId: i.spaceId, bemId: i.bemId, solicitanteUserId: i.solicitanteUserId, origem: i.origem ?? 'USUARIO', fotoUrl: i.fotoUrl },
  })
  await scheduleReminder({
    tenantId: i.tenantId, modulo: MODULO, titulo: `Chamado ${numero}: ${ch.titulo}`, dueAt: prazoSla(new Date(), prioridade), antecedenciaDias: 0,
    severity: sev(prioridade), refType: 'InfChamado', refId: ch.id, assigneeRole: 'FACILITIES', dedupeKey: `inf-ch-${ch.id}`,
  })
  return ch
}

// ---------- Plano preventivo: geração de OS ----------
export async function gerarOsDoPlano(plano: any, forcar = false, agora = new Date()) {
  const av = avaliarPlano(plano.proximaExecucao, plano.periodicidadeDias, plano.antecedenciaDias, agora)
  if (!av.deveGerar && !forcar) return { geradas: 0 }
  let alvos: Array<{ bemId?: string; spaceId?: string | null }> = []
  if (plano.bemId) alvos = [{ bemId: plano.bemId }]
  else if (plano.categoriaId) {
    const bens = await prisma.infBem.findMany({ where: { tenantId: plano.tenantId, categoriaId: plano.categoriaId, status: { not: 'BAIXADO' }, ...(plano.spaceId ? { spaceId: plano.spaceId } : {}) }, select: { id: true, spaceId: true }, take: 300 })
    alvos = bens.map((b) => ({ bemId: b.id, spaceId: b.spaceId }))
  } else alvos = [{ spaceId: plano.spaceId }]
  let geradas = 0
  for (const a of alvos) {
    const jaAberta = await prisma.infOrdemServico.count({ where: { tenantId: plano.tenantId, planoId: plano.id, bemId: a.bemId ?? null, status: { in: [...OS_ABERTAS] } } })
    if (jaAberta > 0) continue
    const prazo = plano.proximaExecucao > agora ? plano.proximaExecucao : prazoSla(agora, plano.prioridade)
    await criarOrdemServico({
      tenantId: plano.tenantId, tipo: 'PREVENTIVA', prioridade: plano.prioridade, titulo: `[Preventiva] ${plano.titulo}`, descricao: plano.descricao,
      bemId: a.bemId, spaceId: a.spaceId ?? plano.spaceId, planoId: plano.id, fornecedorId: plano.fornecedorId, responsavelUserId: plano.responsavelUserId,
      prazo, checklist: Array.isArray(plano.checklist) ? (plano.checklist as any[]).map((c) => ({ ...c, feito: false })) : undefined, bemParado: false,
    })
    geradas++
  }
  await prisma.infPlanoPreventivo.update({ where: { id: plano.id }, data: { ultimaGeracao: agora, proximaExecucao: av.deveGerar ? av.proximaExecucao : addPeriodo(plano.proximaExecucao, plano.periodicidadeDias) } })
  return { geradas }
}
const addPeriodo = (d: Date, dias: number) => new Date(d.getTime() + dias * 86_400_000)

export async function jobPlanosPreventivos(agora = new Date()) {
  const planos = await prisma.infPlanoPreventivo.findMany({ where: { ativo: true, proximaExecucao: { lte: new Date(agora.getTime() + 90 * 86_400_000) } }, take: 2000 })
  let geradas = 0
  for (const p of planos) {
    try { geradas += (await gerarOsDoPlano(p, false, agora)).geradas } catch (e) { console.error('[inf-plano]', p.id, e) }
  }
  return { planosAvaliados: planos.length, osGeradas: geradas }
}

// Marca OS atrasadas como alerta (notificação) — sem mudar status.
export async function jobOsVencidas(agora = new Date()) {
  const vencidas = await prisma.infOrdemServico.findMany({ where: { status: { in: [...OS_ABERTAS] }, prazoSla: { lt: agora } }, take: 1000 })
  let escaladas = 0
  for (const os of vencidas) {
    const key = `inf-os-venc-${os.id}`
    const ja = await prisma.eduReminder.findFirst({ where: { tenantId: os.tenantId, dedupeKey: key } })
    if (ja) continue
    await scheduleReminder({ tenantId: os.tenantId, modulo: MODULO, titulo: `SLA vencido: OS ${os.numero} — ${os.titulo}`, dueAt: agora, remindAt: agora, severity: 'CRITICO', refType: 'InfOrdemServico', refId: os.id, assigneeRole: 'FACILITIES', recorrenciaDias: 2, dedupeKey: key })
    escaladas++
  }
  return { vencidas: vencidas.length, escaladas }
}

function osView(o: any, agora = new Date()) {
  return { ...o, custoTotal: money((o.custoMaoObra ?? 0) + (o.custoPecas ?? 0)), sla: situacaoSla(o.abertaEm, o.prazoSla, o.concluidaEm, agora) }
}

const osCreate = z.object({
  tipo: z.enum(['CORRETIVA', 'PREVENTIVA', 'PREDITIVA', 'MELHORIA']).default('CORRETIVA'),
  prioridade: z.enum(PRIORIDADES).default('MEDIA'),
  titulo: z.string().min(3),
  descricao: z.string().optional().nullable(),
  bemId: z.string().optional().nullable(),
  spaceId: z.string().optional().nullable(),
  chamadoId: z.string().optional().nullable(),
  fornecedorId: z.string().optional().nullable(),
  responsavelUserId: z.string().optional().nullable(),
  agendadaPara: dateISO().optional().nullable(),
  checklist: z.array(z.object({ item: z.string().min(1), obrigatorio: z.boolean().default(false), feito: z.boolean().default(false), obs: z.string().optional() })).optional(),
  bemParado: z.boolean().optional(),
})

export function mountManutencao(router: Router) {
  // ----- Planos preventivos -----
  const planoSchema = z.object({
    titulo: z.string().min(3),
    descricao: z.string().optional().nullable(),
    bemId: z.string().optional().nullable(),
    spaceId: z.string().optional().nullable(),
    categoriaId: z.string().optional().nullable(),
    periodicidadeDias: z.number().int().min(1).max(3650),
    antecedenciaDias: z.number().int().min(0).max(180).default(7),
    proximaExecucao: dateISO(),
    prioridade: z.enum(PRIORIDADES).default('MEDIA'),
    checklist: z.array(z.object({ item: z.string().min(1), obrigatorio: z.boolean().default(false) })).optional().nullable(),
    fornecedorId: z.string().optional().nullable(),
    responsavelUserId: z.string().optional().nullable(),
    ativo: z.boolean().optional(),
  })
  mountCrud(router, {
    model: 'infPlanoPreventivo', path: '/planos-preventivos', read: LEITURA, write: GESTAO, modulo: MODULO,
    create: planoSchema, search: ['titulo'], filters: ['ativo', 'bemId', 'spaceId', 'categoriaId'], orderBy: { proximaExecucao: 'asc' },
    beforeCreate: async (d: any, req) => {
      const tenantId = getTenantId(req)
      if (!d.bemId && !d.spaceId && !d.categoriaId) fail(400, 'Informe bemId, spaceId ou categoriaId para o plano.')
      await ensureBem(tenantId, d.bemId)
      await ensureSpace(tenantId, d.spaceId)
      if (d.categoriaId && !(await prisma.infCategoriaBem.findFirst({ where: { id: d.categoriaId, tenantId } }))) fail(400, 'Categoria não encontrada.')
    },
    afterCreate: async (row: any) => {
      await scheduleReminder({ tenantId: row.tenantId, modulo: MODULO, titulo: `Manutenção preventiva: ${row.titulo}`, dueAt: row.proximaExecucao, antecedenciaDias: row.antecedenciaDias, refType: 'InfPlanoPreventivo', refId: row.id, assigneeUserId: row.responsavelUserId ?? undefined, assigneeRole: row.responsavelUserId ? undefined : 'FACILITIES', dedupeKey: `inf-plano-${row.id}-${row.proximaExecucao.toISOString().slice(0, 10)}` })
    },
  })

  router.post(
    '/planos-preventivos/:id/gerar-agora',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const p = await prisma.infPlanoPreventivo.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Plano não encontrado.' })
      if (!p.ativo) fail(409, 'Plano inativo.')
      res.json(await gerarOsDoPlano(p, true))
    }),
  )

  // ----- Ordens de serviço -----
  router.post(
    '/ordens-servico',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(osCreate, req.body)
      const bem = await ensureBem(tenantId, d.bemId)
      if (bem?.status === 'BAIXADO') fail(409, 'Bem baixado não pode receber OS.')
      const spaceId = d.spaceId ?? bem?.spaceId ?? null
      await ensureSpace(tenantId, spaceId)
      if (d.chamadoId && !(await prisma.infChamado.findFirst({ where: { id: d.chamadoId, tenantId } }))) fail(400, 'Chamado não encontrado.')
      const os = await criarOrdemServico({ tenantId, userId: getUserId(req), ...d, spaceId })
      res.status(201).json(osView(os))
    }),
  )

  router.get(
    '/ordens-servico',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['status', 'tipo', 'prioridade', 'bemId', 'spaceId', 'planoId', 'responsavelUserId', 'fornecedorId']) {
        const v = qs((req.query as any)[f]); if (v) where[f] = v
      }
      if (qs(req.query.abertas) === 'true') where.status = { in: [...OS_ABERTAS] }
      if (qs(req.query.vencidas) === 'true') { where.status = { in: [...OS_ABERTAS] }; where.prazoSla = { lt: new Date() } }
      const q = qs(req.query.q)
      if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }]
      const [rows, total] = await Promise.all([
        prisma.infOrdemServico.findMany({ where, orderBy: [{ prazoSla: 'asc' }], skip, take }),
        prisma.infOrdemServico.count({ where }),
      ])
      res.json({ items: rows.map((o) => osView(o)), total, page, pageSize })
    }),
  )

  router.get(
    '/ordens-servico/:id',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const os = await prisma.infOrdemServico.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { pecas: true } })
      if (!os) return res.status(404).json({ error: 'OS não encontrada.' })
      res.json(osView(os))
    }),
  )

  const osPatch = osCreate.pick({ titulo: true, descricao: true, prioridade: true, fornecedorId: true, responsavelUserId: true, agendadaPara: true, bemParado: true }).partial().extend({ custoMaoObra: z.number().min(0).optional(), solucao: z.string().optional() })
  router.patch(
    '/ordens-servico/:id',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const id = String(req.params.id)
      const cur = await prisma.infOrdemServico.findFirst({ where: { id, tenantId } })
      if (!cur) return res.status(404).json({ error: 'OS não encontrada.' })
      if (['CONCLUIDA', 'CANCELADA'].includes(cur.status)) fail(409, 'OS encerrada não pode ser alterada.')
      const d = parseBody(osPatch, req.body)
      const data: any = { ...d }
      if (d.prioridade && d.prioridade !== cur.prioridade) data.prazoSla = prazoSla(cur.abertaEm, d.prioridade)
      const os = await prisma.infOrdemServico.update({ where: { id }, data })
      if (data.prazoSla) await scheduleReminder({ tenantId, modulo: MODULO, titulo: `OS ${os.numero}: ${os.titulo}`, dueAt: os.prazoSla, severity: sev(os.prioridade), refType: 'InfOrdemServico', refId: id, assigneeUserId: os.responsavelUserId ?? undefined, assigneeRole: os.responsavelUserId ? undefined : 'FACILITIES', dedupeKey: `inf-os-${id}` })
      res.json(osView(os))
    }),
  )

  router.patch(
    '/ordens-servico/:id/checklist',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ itens: z.array(z.object({ item: z.string().min(1), obrigatorio: z.boolean().optional(), feito: z.boolean(), obs: z.string().optional() })).min(1) }), req.body)
      const cur = await prisma.infOrdemServico.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!cur) return res.status(404).json({ error: 'OS não encontrada.' })
      if (['CONCLUIDA', 'CANCELADA'].includes(cur.status)) fail(409, 'OS encerrada.')
      const atual = (Array.isArray(cur.checklist) ? (cur.checklist as any[]) : []).map((c) => ({ ...c }))
      for (const n of d.itens) {
        const x = atual.find((c) => c.item === n.item)
        if (x) { x.feito = n.feito; if (n.obs !== undefined) x.obs = n.obs } else atual.push({ item: n.item, obrigatorio: n.obrigatorio ?? false, feito: n.feito, obs: n.obs })
      }
      res.json(osView(await prisma.infOrdemServico.update({ where: { id: cur.id }, data: { checklist: atual } })))
    }),
  )

  const recalcPecas = async (osId: string) => {
    const pecas = await prisma.infOsPeca.findMany({ where: { osId } })
    const total = money(pecas.reduce((s, p) => s + p.quantidade * p.valorUnitario, 0))
    await prisma.infOrdemServico.update({ where: { id: osId }, data: { custoPecas: total } })
    return total
  }
  router.post(
    '/ordens-servico/:id/pecas',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ descricao: z.string().min(2), quantidade: z.number().positive().default(1), valorUnitario: z.number().min(0).default(0) }), req.body)
      const os = await prisma.infOrdemServico.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!os) return res.status(404).json({ error: 'OS não encontrada.' })
      if (['CONCLUIDA', 'CANCELADA'].includes(os.status)) fail(409, 'OS encerrada.')
      const peca = await prisma.infOsPeca.create({ data: { ...d, tenantId, osId: os.id } })
      res.status(201).json({ peca, custoPecas: await recalcPecas(os.id) })
    }),
  )
  router.delete(
    '/ordens-servico/:id/pecas/:pecaId',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const os = await prisma.infOrdemServico.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!os) return res.status(404).json({ error: 'OS não encontrada.' })
      if (['CONCLUIDA', 'CANCELADA'].includes(os.status)) fail(409, 'OS encerrada.')
      await prisma.infOsPeca.deleteMany({ where: { id: String(req.params.pecaId), tenantId, osId: os.id } })
      res.json({ custoPecas: await recalcPecas(os.id) })
    }),
  )

  router.post(
    '/ordens-servico/:id/status',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const d = parseBody(z.object({ status: z.enum(['ABERTA', 'AGENDADA', 'EM_EXECUCAO', 'AGUARDANDO_PECA', 'CONCLUIDA', 'CANCELADA']), solucao: z.string().optional(), custoMaoObra: z.number().min(0).optional(), agendadaPara: dateISO().optional() }), req.body)
      const cur = await prisma.infOrdemServico.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!cur) return res.status(404).json({ error: 'OS não encontrada.' })
      if (!TRANSICOES_OS[cur.status].includes(d.status)) fail(409, `Transição inválida: ${cur.status} -> ${d.status}.`)
      const data: any = { status: d.status }
      if (d.custoMaoObra !== undefined) data.custoMaoObra = d.custoMaoObra
      if (d.status === 'AGENDADA') { if (!d.agendadaPara) fail(400, 'Informe agendadaPara.'); data.agendadaPara = d.agendadaPara }
      if (d.status === 'EM_EXECUCAO' && !cur.iniciadaEm) data.iniciadaEm = new Date()
      if (d.status === 'CONCLUIDA') {
        const solucao = d.solucao ?? cur.solucao
        if (!solucao || solucao.trim().length < 3) fail(400, 'Informe a solução aplicada para concluir.')
        const pend = (Array.isArray(cur.checklist) ? (cur.checklist as any[]) : []).filter((c) => c.obrigatorio && !c.feito)
        if (pend.length) fail(409, `Checklist com ${pend.length} item(ns) obrigatório(s) pendente(s): ${pend.map((p) => p.item).join(', ')}.`)
        data.solucao = solucao
        data.concluidaEm = new Date()
        if (!cur.iniciadaEm) data.iniciadaEm = data.concluidaEm
      }
      const os = await prisma.infOrdemServico.update({ where: { id: cur.id }, data })
      if (['CONCLUIDA', 'CANCELADA'].includes(d.status)) {
        await completeReminders({ tenantId, refType: 'InfOrdemServico', refId: os.id, userId })
        if (os.bemId) {
          const outras = await prisma.infOrdemServico.count({ where: { tenantId, bemId: os.bemId, bemParado: true, status: { in: [...OS_ABERTAS] } } })
          if (outras === 0) await prisma.infBem.updateMany({ where: { id: os.bemId, tenantId, status: 'EM_MANUTENCAO' }, data: { status: 'ATIVO' } })
        }
        if (os.chamadoId) {
          const ch = await prisma.infChamado.findFirst({ where: { id: os.chamadoId, tenantId } })
          if (ch && d.status === 'CONCLUIDA' && ['ABERTO', 'EM_ATENDIMENTO'].includes(ch.status)) {
            await prisma.infChamado.update({ where: { id: ch.id }, data: { status: 'RESOLVIDO', resolvidoEm: new Date() } })
            await completeReminders({ tenantId, refType: 'InfChamado', refId: ch.id, userId })
            await notify({ tenantId, userId: ch.solicitanteUserId, assunto: `Chamado ${ch.numero} resolvido`, mensagem: `Seu chamado "${ch.titulo}" foi resolvido (OS ${os.numero}). Confirme o encerramento e avalie o atendimento.`, refType: 'InfChamado', refId: ch.id })
          }
        }
        // OS preventiva concluída: agenda lembrete da próxima
        if (os.planoId && d.status === 'CONCLUIDA') {
          const pl = await prisma.infPlanoPreventivo.findFirst({ where: { id: os.planoId, tenantId, ativo: true } })
          if (pl) await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Próxima preventiva: ${pl.titulo}`, dueAt: pl.proximaExecucao, antecedenciaDias: pl.antecedenciaDias, refType: 'InfPlanoPreventivo', refId: pl.id, assigneeRole: 'FACILITIES', dedupeKey: `inf-plano-${pl.id}-${pl.proximaExecucao.toISOString().slice(0, 10)}` })
        }
      }
      await audit({ tenantId, userId, modulo: MODULO, acao: `OS_${d.status}`, refType: 'InfOrdemServico', refId: os.id })
      res.json(osView(os))
    }),
  )

  // Histórico de manutenção por bem / por espaço
  router.get(
    '/historico-manutencao',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const bemId = qs(req.query.bemId), spaceId = qs(req.query.spaceId)
      if (!bemId && !spaceId) fail(400, 'Informe bemId ou spaceId.')
      const where: any = { tenantId, ...(bemId ? { bemId } : {}), ...(spaceId ? { spaceId } : {}) }
      const [ordens, chamados] = await Promise.all([
        prisma.infOrdemServico.findMany({ where, orderBy: { abertaEm: 'desc' }, take: 200, include: { pecas: true } }),
        prisma.infChamado.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
      ])
      const custo = ordens.reduce((s, o) => s + o.custoMaoObra + o.custoPecas, 0)
      res.json({ ordens: ordens.map((o) => osView(o)), chamados, resumo: { totalOs: ordens.length, custoTotal: money(custo), mttrHoras: mttrHoras(ordens), corretivas: ordens.filter((o) => o.tipo === 'CORRETIVA').length, preventivas: ordens.filter((o) => o.tipo === 'PREVENTIVA').length } })
    }),
  )

  // ----- Chamados (helpdesk predial/TI) -----
  const chamadoCreate = z.object({
    categoria: z.enum(['PREDIAL', 'ELETRICA', 'HIDRAULICA', 'TI', 'AR_CONDICIONADO', 'LIMPEZA', 'SEGURANCA', 'ILUMINACAO', 'MOBILIARIO', 'OUTRO']).default('PREDIAL'),
    prioridade: z.enum(PRIORIDADES).default('MEDIA'),
    titulo: z.string().min(3),
    descricao: z.string().optional().nullable(),
    spaceId: z.string().optional().nullable(),
    bemId: z.string().optional().nullable(),
    fotoUrl: z.string().url().optional().nullable(),
  })
  const isGestao = (req: AuthenticatedRequest) => ['ADMIN', 'OWNER', 'RECTOR', 'BOARD', 'FACILITIES'].includes(String(req.user?.role))

  // Qualquer usuário autenticado abre chamado.
  router.post(
    '/chamados',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(chamadoCreate, req.body)
      await ensureSpace(tenantId, d.spaceId)
      await ensureBem(tenantId, d.bemId)
      // não gestor só sugere prioridade até ALTA
      const prioridade = !isGestao(req) && d.prioridade === 'URGENTE' ? 'ALTA' : d.prioridade
      const ch = await abrirChamado({ tenantId, solicitanteUserId: getUserId(req), ...d, prioridade })
      await notify({ tenantId, userId: ch.solicitanteUserId, assunto: `Chamado ${ch.numero} registrado`, mensagem: `Recebemos seu chamado "${ch.titulo}". Acompanhe pelo número ${ch.numero}.`, refType: 'InfChamado', refId: ch.id })
      await audit({ tenantId, userId: ch.solicitanteUserId, modulo: MODULO, acao: 'CHAMADO_ABERTO', refType: 'InfChamado', refId: ch.id })
      res.status(201).json(ch)
    }),
  )

  router.get(
    '/chamados/meus',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId, solicitanteUserId: getUserId(req), ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}) }
      const [items, total] = await Promise.all([prisma.infChamado.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.infChamado.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/chamados',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['status', 'categoria', 'prioridade', 'spaceId', 'atendenteUserId', 'origem']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
      const q = qs(req.query.q)
      if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }]
      const [items, total] = await Promise.all([prisma.infChamado.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.infChamado.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )

  async function carregarChamado(req: AuthenticatedRequest) {
    const tenantId = getTenantId(req)
    const ch = await prisma.infChamado.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!ch) fail(404, 'Chamado não encontrado.')
    const gestor = isGestao(req) || ['COORDINATOR'].includes(String(req.user?.role))
    if (!gestor && ch.solicitanteUserId !== getUserId(req)) fail(403, 'Sem permissão para este chamado.')
    return { ch, tenantId, gestor }
  }

  router.get(
    '/chamados/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { ch, tenantId, gestor } = await carregarChamado(req)
      const comentarios = await prisma.infChamadoComentario.findMany({ where: { tenantId, chamadoId: ch.id, ...(gestor ? {} : { interno: false }) }, orderBy: { createdAt: 'asc' } })
      const os = ch.osId ? await prisma.infOrdemServico.findFirst({ where: { id: ch.osId, tenantId }, select: { numero: true, status: true, prazoSla: true } }) : null
      res.json({ ...ch, comentarios, os })
    }),
  )

  router.post(
    '/chamados/:id/comentarios',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { ch, tenantId, gestor } = await carregarChamado(req)
      const d = parseBody(z.object({ texto: z.string().min(1), interno: z.boolean().default(false) }), req.body)
      if (['FECHADO', 'CANCELADO'].includes(ch.status)) fail(409, 'Chamado encerrado.')
      const c = await prisma.infChamadoComentario.create({ data: { tenantId, chamadoId: ch.id, userId: getUserId(req), texto: d.texto, interno: gestor ? d.interno : false } })
      if (gestor && !d.interno && ch.solicitanteUserId !== getUserId(req)) await notify({ tenantId, userId: ch.solicitanteUserId, assunto: `Atualização no chamado ${ch.numero}`, mensagem: d.texto, refType: 'InfChamado', refId: ch.id })
      res.status(201).json(c)
    }),
  )

  router.post(
    '/chamados/:id/atender',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { ch, tenantId } = await carregarChamado(req)
      if (ch.status !== 'ABERTO') fail(409, 'Somente chamados ABERTOS podem ser assumidos.')
      const d = parseBody(z.object({ atendenteUserId: z.string().optional() }), req.body ?? {})
      const novo = await prisma.infChamado.update({ where: { id: ch.id }, data: { status: 'EM_ATENDIMENTO', atendenteUserId: d.atendenteUserId ?? getUserId(req) } })
      await notify({ tenantId, userId: ch.solicitanteUserId, assunto: `Chamado ${ch.numero} em atendimento`, mensagem: `Seu chamado "${ch.titulo}" foi assumido pela equipe.`, refType: 'InfChamado', refId: ch.id })
      res.json(novo)
    }),
  )

  router.post(
    '/chamados/:id/gerar-os',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { ch, tenantId } = await carregarChamado(req)
      if (ch.osId) fail(409, 'Chamado já possui OS.')
      if (!['ABERTO', 'EM_ATENDIMENTO'].includes(ch.status)) fail(409, 'Chamado não está em andamento.')
      const d = parseBody(z.object({ fornecedorId: z.string().optional().nullable(), responsavelUserId: z.string().optional().nullable(), prioridade: z.enum(PRIORIDADES).optional(), bemParado: z.boolean().optional() }), req.body ?? {})
      const os = await criarOrdemServico({ tenantId, userId: getUserId(req), tipo: 'CORRETIVA', prioridade: d.prioridade ?? (ch.prioridade as Prioridade), titulo: `[${ch.numero}] ${ch.titulo}`, descricao: ch.descricao, bemId: ch.bemId, spaceId: ch.spaceId, chamadoId: ch.id, fornecedorId: d.fornecedorId, responsavelUserId: d.responsavelUserId, bemParado: d.bemParado })
      await prisma.infChamado.update({ where: { id: ch.id }, data: { osId: os.id, status: 'EM_ATENDIMENTO', atendenteUserId: ch.atendenteUserId ?? getUserId(req) } })
      res.status(201).json(osView(os))
    }),
  )

  router.post(
    '/chamados/:id/resolver',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { ch, tenantId } = await carregarChamado(req)
      if (!['ABERTO', 'EM_ATENDIMENTO'].includes(ch.status)) fail(409, 'Chamado não está em andamento.')
      const d = parseBody(z.object({ texto: z.string().min(3) }), req.body)
      await prisma.infChamadoComentario.create({ data: { tenantId, chamadoId: ch.id, userId: getUserId(req), texto: d.texto } })
      const novo = await prisma.infChamado.update({ where: { id: ch.id }, data: { status: 'RESOLVIDO', resolvidoEm: new Date(), atendenteUserId: ch.atendenteUserId ?? getUserId(req) } })
      await completeReminders({ tenantId, refType: 'InfChamado', refId: ch.id, userId: getUserId(req) })
      await notify({ tenantId, userId: ch.solicitanteUserId, assunto: `Chamado ${ch.numero} resolvido`, mensagem: `${d.texto} — confirme o encerramento e avalie o atendimento.`, refType: 'InfChamado', refId: ch.id })
      res.json(novo)
    }),
  )

  // Solicitante confirma/encerra e avalia.
  router.post(
    '/chamados/:id/fechar',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { ch, tenantId } = await carregarChamado(req)
      if (ch.status !== 'RESOLVIDO') fail(409, 'Somente chamados RESOLVIDOS podem ser fechados.')
      const d = parseBody(z.object({ nota: z.number().int().min(1).max(5).optional(), comentario: z.string().optional() }), req.body ?? {})
      const novo = await prisma.infChamado.update({ where: { id: ch.id }, data: { status: 'FECHADO', fechadoEm: new Date(), avaliacaoNota: d.nota, avaliacaoComentario: d.comentario } })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'CHAMADO_FECHADO', refType: 'InfChamado', refId: ch.id, detalhes: { nota: d.nota } })
      res.json(novo)
    }),
  )

  router.post(
    '/chamados/:id/reabrir',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { ch, tenantId } = await carregarChamado(req)
      if (ch.status !== 'RESOLVIDO') fail(409, 'Somente chamados RESOLVIDOS podem ser reabertos.')
      const d = parseBody(z.object({ motivo: z.string().min(3) }), req.body)
      await prisma.infChamadoComentario.create({ data: { tenantId, chamadoId: ch.id, userId: getUserId(req), texto: `Reaberto: ${d.motivo}` } })
      const novo = await prisma.infChamado.update({ where: { id: ch.id }, data: { status: 'ABERTO', resolvidoEm: null, osId: null } })
      await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Chamado reaberto ${ch.numero}: ${ch.titulo}`, dueAt: prazoSla(new Date(), ch.prioridade as Prioridade), antecedenciaDias: 0, severity: 'ATENCAO', refType: 'InfChamado', refId: ch.id, assigneeRole: 'FACILITIES', dedupeKey: `inf-ch-reab-${ch.id}-${Date.now()}` })
      res.json(novo)
    }),
  )

  router.post(
    '/chamados/:id/cancelar',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { ch, tenantId, gestor } = await carregarChamado(req)
      if (!gestor && ch.status !== 'ABERTO') fail(409, 'Você só pode cancelar chamados ainda não atendidos.')
      if (['FECHADO', 'CANCELADO'].includes(ch.status)) fail(409, 'Chamado já encerrado.')
      await cancelReminders({ tenantId, refType: 'InfChamado', refId: ch.id })
      res.json(await prisma.infChamado.update({ where: { id: ch.id }, data: { status: 'CANCELADO' } }))
    }),
  )
}
