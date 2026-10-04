import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import { CATALOGO, calcularTodos, limparCachePainel } from './indicators'
import {
  addDias, checkinDesatualizado, confiancaDoStatus, fracaoTempo, progressoKR, progressoObjetivo, round1, statusKR,
} from './logic'

// Metas/OKRs institucionais: objetivo -> resultados-chave -> check-ins.
// KRs podem ser alimentados manualmente (check-ins) ou automaticamente por um
// indicador do painel executivo (fonte=INDICADOR, sincronizado pelo job).

const SUPER_ONLY: any[] = []
const LEITURA: any[] = ['COORDINATOR', 'SECRETARY', 'FINANCE', 'LIBRARIAN', 'FACILITIES', 'SUPPLIES', 'MARKETING', 'ADMISSIONS', 'SUPPORT', 'STAFF', 'TEACHER']
const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }) }

const objetivoSchema = z.object({
  codigo: z.string().trim().min(2).max(40).optional(),
  titulo: z.string().trim().min(3).max(200),
  descricao: z.string().max(4000).optional().nullable(),
  ciclo: z.string().trim().min(2).max(20),
  nivel: z.enum(['INSTITUCIONAL', 'CURSO', 'AREA']).default('INSTITUCIONAL'),
  programId: z.string().optional().nullable(),
  area: z.string().max(60).optional().nullable(),
  responsavelUserId: z.string().optional().nullable(),
  responsavelNome: z.string().max(120).optional().nullable(),
  inicio: dateISO(),
  fim: dateISO(),
})

const krBase = z.object({
  titulo: z.string().trim().min(3).max(200),
  unidade: z.string().max(20).optional().nullable(),
  sentido: z.enum(['MAIOR_MELHOR', 'MENOR_MELHOR']).default('MAIOR_MELHOR'),
  valorInicial: z.number(),
  valorMeta: z.number(),
  valorAtual: z.number().optional(),
  fonte: z.enum(['MANUAL', 'INDICADOR']).default('MANUAL'),
  indicadorChave: z.string().optional().nullable(),
  responsavelUserId: z.string().optional().nullable(),
  peso: z.number().positive().max(100).default(1),
  checkinFrequenciaDias: z.number().int().min(1).max(90).default(14),
})

function validarKR(d: { valorInicial: number; valorMeta: number; sentido: string; fonte: string; indicadorChave?: string | null }) {
  if (d.valorInicial === d.valorMeta) fail(422, 'A meta deve ser diferente do valor inicial.')
  if (d.sentido === 'MAIOR_MELHOR' && d.valorMeta < d.valorInicial) fail(422, 'Para "maior é melhor" a meta deve ser maior que o valor inicial.')
  if (d.sentido === 'MENOR_MELHOR' && d.valorMeta > d.valorInicial) fail(422, 'Para "menor é melhor" a meta deve ser menor que o valor inicial.')
  if (d.fonte === 'INDICADOR') {
    if (!d.indicadorChave) fail(422, 'Informe indicadorChave para KR alimentado por indicador.')
    if (!CATALOGO.some((c) => c.chave === d.indicadorChave)) fail(422, `Indicador "${d.indicadorChave}" não existe no catálogo (GET /reitoria/indicadores/catalogo).`)
  }
}

// ---------------- cálculo e lembretes ----------------

export async function recalcularObjetivo(tenantId: string, objetivoId: string) {
  const krs = await prisma.reiResultadoChave.findMany({ where: { tenantId, objetivoId }, select: { progresso: true, peso: true } })
  const progresso = progressoObjetivo(krs)
  return prisma.reiObjetivo.update({ where: { id: objetivoId }, data: { progresso } })
}

async function agendarCheckin(kr: { id: string; tenantId: string; titulo: string; proximoCheckinEm: Date | null; responsavelUserId: string | null; checkinFrequenciaDias: number }, obj: { responsavelUserId: string | null; titulo: string }) {
  if (!kr.proximoCheckinEm) return
  const dia = kr.proximoCheckinEm.toISOString().slice(0, 10)
  // se já existe lembrete com a mesma chave (mesmo dia) encerrado por um check-in anterior, reabre-o
  const r = await scheduleReminder({
    tenantId: kr.tenantId, modulo: 'reitoria', titulo: `Check-in do resultado-chave: ${kr.titulo}`, descricao: `Objetivo: ${obj.titulo}`,
    dueAt: kr.proximoCheckinEm, antecedenciaDias: 1, refType: 'ReiResultadoChave', refId: kr.id, severity: 'ATENCAO',
    assigneeUserId: kr.responsavelUserId ?? obj.responsavelUserId ?? undefined, assigneeRole: kr.responsavelUserId || obj.responsavelUserId ? undefined : 'RECTOR',
    dedupeKey: `rei-kr:${kr.id}:${dia}`,
  })
  if (r.status === 'CONCLUIDO' || r.status === 'CANCELADO') await prisma.eduReminder.update({ where: { id: r.id }, data: { status: 'PENDENTE', concluidoEm: null, concluidoPorId: null } })
}

async function agendarFimCiclo(o: { id: string; tenantId: string; titulo: string; fim: Date; responsavelUserId: string | null }) {
  await scheduleReminder({
    tenantId: o.tenantId, modulo: 'reitoria', titulo: `Encerramento do ciclo do objetivo: ${o.titulo}`, descricao: 'Revise os resultados-chave e conclua o objetivo.',
    dueAt: o.fim, antecedenciaDias: 7, refType: 'ReiObjetivo', refId: o.id, severity: 'ATENCAO',
    assigneeUserId: o.responsavelUserId ?? undefined, assigneeRole: o.responsavelUserId ? undefined : 'RECTOR', dedupeKey: `rei-obj-fim:${o.id}`,
  })
}

function enriquecerKR(k: any, o: { inicio: Date; fim: Date }, now = new Date()) {
  const status = statusKR(k.progresso, o.inicio, o.fim, now)
  return {
    ...k,
    status,
    esperadoPct: round1(fracaoTempo(o.inicio, o.fim, now) * 100),
    desatualizado: k.fonte === 'MANUAL' && !k.concluidoEm && checkinDesatualizado(k.ultimoCheckinEm, k.createdAt, k.checkinFrequenciaDias, now),
  }
}

function podeAtualizarKR(req: AuthenticatedRequest, kr: { responsavelUserId: string | null }, obj: { responsavelUserId: string | null }) {
  const role = String(req.user?.role).toUpperCase()
  const uid = req.user?.id
  return SUPER.includes(role) || role === 'COORDINATOR' || (!!uid && (kr.responsavelUserId === uid || obj.responsavelUserId === uid))
}

// ---------------- rotinas de manutenção (job) ----------------

export async function okrManutencao(now = new Date()) {
  const tenants = await prisma.reiObjetivo.findMany({ where: { status: 'ATIVO' }, distinct: ['tenantId'], select: { tenantId: true } })
  let sincronizados = 0, atualizados = 0, escalonados = 0
  for (const { tenantId } of tenants) {
    try {
      const objetivos = await prisma.reiObjetivo.findMany({ where: { tenantId, status: 'ATIVO' }, include: { resultados: true } })
      const precisaIndicador = objetivos.some((o) => o.resultados.some((k) => k.fonte === 'INDICADOR'))
      const valores = new Map<string, number>()
      if (precisaIndicador) {
        for (const i of await calcularTodos(tenantId)) if (i.valor != null) valores.set(i.chave, i.valor)
      }
      for (const o of objetivos) {
        for (const k of o.resultados) {
          let atual = k.valorAtual
          if (k.fonte === 'INDICADOR' && k.indicadorChave && valores.has(k.indicadorChave)) {
            const v = valores.get(k.indicadorChave)!
            if (v !== k.valorAtual) {
              await prisma.reiCheckin.create({ data: { tenantId, resultadoId: k.id, valor: v, valorAnterior: k.valorAtual, origem: 'AUTO', comentario: `Sincronizado do indicador ${k.indicadorChave}` } })
              atual = v; sincronizados++
            }
          }
          const progresso = progressoKR({ valorInicial: k.valorInicial, valorMeta: k.valorMeta, valorAtual: atual, sentido: k.sentido })
          const confianca = confiancaDoStatus(statusKR(progresso, o.inicio, o.fim, now))
          const concl = progresso >= 100 ? k.concluidoEm ?? now : null
          if (atual !== k.valorAtual || progresso !== k.progresso || confianca !== k.confianca || (concl?.getTime() ?? 0) !== (k.concluidoEm?.getTime() ?? 0)) {
            await prisma.reiResultadoChave.update({ where: { id: k.id }, data: { valorAtual: atual, progresso, confianca, concluidoEm: concl, ...(k.fonte === 'INDICADOR' ? { ultimoCheckinEm: now } : {}) } })
            atualizados++
          }
          // check-in manual atrasado: escala à reitoria uma vez por semana
          if (k.fonte === 'MANUAL' && !concl && checkinDesatualizado(k.ultimoCheckinEm, k.createdAt, k.checkinFrequenciaDias, now)) {
            const semana = `${now.getFullYear()}-W${Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000 + 1) / 7)}`
            await scheduleReminder({
              tenantId, modulo: 'reitoria', titulo: `Resultado-chave sem check-in: ${k.titulo}`, descricao: `Objetivo "${o.titulo}" — frequência combinada: ${k.checkinFrequenciaDias} dias.`,
              dueAt: now, remindAt: now, severity: 'CRITICO', refType: 'ReiResultadoChave', refId: k.id, assigneeRole: 'RECTOR', dedupeKey: `rei-kr-atraso:${k.id}:${semana}`,
            })
            escalonados++
          }
        }
        await recalcularObjetivo(tenantId, o.id)
      }
    } catch (e: any) {
      console.error('[reitoria:okr-manutencao]', tenantId, e?.message || e)
    }
  }
  return { tenants: tenants.length, sincronizados, atualizados, escalonados }
}

// ---------------- rotas ----------------

export function registerOkr(router: Router) {
  router.get('/okr/ciclos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rows = await prisma.reiObjetivo.groupBy({ by: ['ciclo'], where: { tenantId: getTenantId(req) }, _count: { _all: true }, orderBy: { ciclo: 'desc' } })
    res.json(rows.map((r) => ({ ciclo: r.ciclo, objetivos: r._count._all })))
  }))

  router.get('/objetivos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['ciclo', 'status', 'nivel', 'programId', 'responsavelUserId', 'area']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const q = qs(req.query.q)
    if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { codigo: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([
      prisma.reiObjetivo.findMany({ where, orderBy: [{ ciclo: 'desc' }, { codigo: 'asc' }], skip, take, include: { resultados: { select: { id: true, titulo: true, progresso: true, confianca: true, fonte: true } } } }),
      prisma.reiObjetivo.count({ where }),
    ])
    res.json({ items, total, page, pageSize })
  }))

  router.post('/objetivos', requireRole(...SUPER_ONLY), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(objetivoSchema, req.body)
    if (d.fim <= d.inicio) fail(422, 'A data final deve ser posterior à inicial.')
    if (d.nivel === 'CURSO') {
      if (!d.programId) fail(422, 'Objetivos de nível CURSO exigem programId.')
      if (!(await prisma.academicProgram.findFirst({ where: { id: d.programId!, tenantId } }))) fail(404, 'Curso não encontrado.')
    }
    const codigo = d.codigo ?? `OBJ-${d.ciclo}-${String((await prisma.reiObjetivo.count({ where: { tenantId, ciclo: d.ciclo } })) + 1).padStart(3, '0')}`
    const row = await prisma.reiObjetivo.create({ data: { ...d, codigo, tenantId } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'CRIAR_OBJETIVO', refType: 'ReiObjetivo', refId: row.id })
    res.status(201).json(row)
  }))

  router.get('/objetivos/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const o = await prisma.reiObjetivo.findFirst({ where: { id: String(req.params.id), tenantId }, include: { resultados: { orderBy: { createdAt: 'asc' }, include: { checkins: { orderBy: { createdAt: 'desc' }, take: 5 } } } } })
    if (!o) return res.status(404).json({ error: 'Objetivo não encontrado.' })
    res.json({ ...o, resultados: o.resultados.map((k) => enriquecerKR(k, o)) })
  }))

  router.patch('/objetivos/:id', requireRole(...SUPER_ONLY), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.reiObjetivo.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Objetivo não encontrado.' })
    if (cur.status === 'CANCELADO' || cur.status === 'CONCLUIDO') fail(409, 'Objetivo encerrado: reabra-o para editar.')
    const d = parseBody(objetivoSchema.partial(), req.body)
    const inicio = d.inicio ?? cur.inicio, fim = d.fim ?? cur.fim
    if (fim <= inicio) fail(422, 'A data final deve ser posterior à inicial.')
    const row = await prisma.reiObjetivo.update({ where: { id: cur.id }, data: d })
    if (cur.status === 'ATIVO' && d.fim) await agendarFimCiclo(row)
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'ATUALIZAR_OBJETIVO', refType: 'ReiObjetivo', refId: cur.id })
    res.json(row)
  }))

  router.delete('/objetivos/:id', requireRole(...SUPER_ONLY), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.reiObjetivo.findFirst({ where: { id: String(req.params.id), tenantId }, include: { resultados: { select: { id: true } } } })
    if (!cur) return res.status(404).json({ error: 'Objetivo não encontrado.' })
    if (cur.status !== 'RASCUNHO') fail(409, 'Só objetivos em rascunho podem ser excluídos; use "cancelar" para preservar o histórico.')
    await prisma.reiObjetivo.delete({ where: { id: cur.id } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'REMOVER_OBJETIVO', refType: 'ReiObjetivo', refId: cur.id })
    res.status(204).end()
  }))

  // Máquina de estados: RASCUNHO -> ATIVO -> CONCLUIDO ; qualquer -> CANCELADO ; CONCLUIDO/CANCELADO -> ATIVO (reabrir)
  const transicao = (acao: 'ativar' | 'concluir' | 'cancelar' | 'reabrir') =>
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const cur = await prisma.reiObjetivo.findFirst({ where: { id: String(req.params.id), tenantId }, include: { resultados: true } })
      if (!cur) return res.status(404).json({ error: 'Objetivo não encontrado.' })
      const now = new Date()
      let data: any
      if (acao === 'ativar') {
        if (cur.status !== 'RASCUNHO') fail(409, 'Só objetivos em rascunho podem ser ativados.')
        if (!cur.resultados.length) fail(422, 'Cadastre ao menos um resultado-chave antes de ativar.')
        data = { status: 'ATIVO', ativadoEm: now }
      } else if (acao === 'reabrir') {
        if (cur.status !== 'CONCLUIDO' && cur.status !== 'CANCELADO') fail(409, 'Só objetivos concluídos ou cancelados podem ser reabertos.')
        data = { status: 'ATIVO', concluidoEm: null }
      } else if (acao === 'concluir') {
        if (cur.status !== 'ATIVO') fail(409, 'Só objetivos ativos podem ser concluídos.')
        data = { status: 'CONCLUIDO', concluidoEm: now }
      } else {
        if (cur.status === 'CANCELADO') fail(409, 'Objetivo já cancelado.')
        data = { status: 'CANCELADO' }
      }
      const row = await prisma.reiObjetivo.update({ where: { id: cur.id }, data })
      if (row.status === 'ATIVO') {
        for (const k of cur.resultados) {
          const prox = k.proximoCheckinEm && k.proximoCheckinEm > now ? k.proximoCheckinEm : addDias(now, k.checkinFrequenciaDias)
          const kr = await prisma.reiResultadoChave.update({ where: { id: k.id }, data: { proximoCheckinEm: prox } })
          if (kr.fonte === 'MANUAL' && !kr.concluidoEm) await agendarCheckin(kr, row)
        }
        await agendarFimCiclo(row)
      } else {
        for (const k of cur.resultados) await cancelReminders({ tenantId, refType: 'ReiResultadoChave', refId: k.id })
        await cancelReminders({ tenantId, refType: 'ReiObjetivo', refId: cur.id })
        if (row.responsavelUserId && row.status === 'CONCLUIDO') await notify({ tenantId, userId: row.responsavelUserId, assunto: 'Objetivo concluído', mensagem: `O objetivo "${row.titulo}" foi concluído com ${row.progresso}% de progresso.`, refType: 'ReiObjetivo', refId: row.id })
      }
      limparCachePainel(tenantId)
      await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: acao.toUpperCase() + '_OBJETIVO', refType: 'ReiObjetivo', refId: cur.id })
      res.json(row)
    })
  for (const a of ['ativar', 'concluir', 'cancelar', 'reabrir'] as const) router.post(`/objetivos/:id/${a}`, requireRole(...SUPER_ONLY), transicao(a))

  // ---- resultados-chave ----
  router.post('/objetivos/:id/resultados-chave', requireRole(...SUPER_ONLY), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const obj = await prisma.reiObjetivo.findFirst({ where: { id: String(req.params.id), tenantId }, include: { _count: { select: { resultados: true } } } })
    if (!obj) return res.status(404).json({ error: 'Objetivo não encontrado.' })
    if (obj.status === 'CANCELADO' || obj.status === 'CONCLUIDO') fail(409, 'Objetivo encerrado.')
    if (obj._count.resultados >= 10) fail(422, 'Limite de 10 resultados-chave por objetivo (recomenda-se de 3 a 5).')
    const d = parseBody(krBase, req.body)
    validarKR(d)
    const valorAtual = d.valorAtual ?? d.valorInicial
    const now = new Date()
    const progresso = progressoKR({ valorInicial: d.valorInicial, valorMeta: d.valorMeta, valorAtual, sentido: d.sentido })
    const row = await prisma.reiResultadoChave.create({
      data: { ...d, valorAtual, tenantId, objetivoId: obj.id, progresso, confianca: confiancaDoStatus(statusKR(progresso, obj.inicio, obj.fim, now)), proximoCheckinEm: addDias(now, d.checkinFrequenciaDias), concluidoEm: progresso >= 100 ? now : null },
    })
    if (obj.status === 'ATIVO' && row.fonte === 'MANUAL') await agendarCheckin(row, obj)
    await recalcularObjetivo(tenantId, obj.id)
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'CRIAR_KR', refType: 'ReiResultadoChave', refId: row.id })
    res.status(201).json(row)
  }))

  router.patch('/resultados-chave/:id', requireRole(...SUPER_ONLY), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const kr = await prisma.reiResultadoChave.findFirst({ where: { id: String(req.params.id), tenantId }, include: { objetivo: true } })
    if (!kr) return res.status(404).json({ error: 'Resultado-chave não encontrado.' })
    if (kr.objetivo.status === 'CANCELADO' || kr.objetivo.status === 'CONCLUIDO') fail(409, 'Objetivo encerrado.')
    const d = parseBody(krBase.partial(), req.body)
    const m = { ...kr, ...d }
    validarKR(m)
    const valorAtual = d.valorAtual ?? kr.valorAtual
    const progresso = progressoKR({ valorInicial: m.valorInicial, valorMeta: m.valorMeta, valorAtual, sentido: m.sentido })
    const row = await prisma.reiResultadoChave.update({ where: { id: kr.id }, data: { ...d, valorAtual, progresso, confianca: confiancaDoStatus(statusKR(progresso, kr.objetivo.inicio, kr.objetivo.fim)), concluidoEm: progresso >= 100 ? kr.concluidoEm ?? new Date() : null } })
    await recalcularObjetivo(tenantId, kr.objetivoId)
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'ATUALIZAR_KR', refType: 'ReiResultadoChave', refId: kr.id })
    res.json(row)
  }))

  router.delete('/resultados-chave/:id', requireRole(...SUPER_ONLY), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const kr = await prisma.reiResultadoChave.findFirst({ where: { id: String(req.params.id), tenantId }, include: { objetivo: true, _count: { select: { checkins: true } } } })
    if (!kr) return res.status(404).json({ error: 'Resultado-chave não encontrado.' })
    if (kr.objetivo.status !== 'RASCUNHO' && kr._count.checkins > 0) fail(409, 'Resultado-chave com check-ins não pode ser removido; cancele o objetivo para preservar o histórico.')
    await cancelReminders({ tenantId, refType: 'ReiResultadoChave', refId: kr.id })
    await prisma.reiResultadoChave.delete({ where: { id: kr.id } })
    await recalcularObjetivo(tenantId, kr.objetivoId)
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'REMOVER_KR', refType: 'ReiResultadoChave', refId: kr.id })
    res.status(204).end()
  }))

  // ---- check-ins ----
  const checkinSchema = z.object({ valor: z.number(), confianca: z.enum(['VERDE', 'AMARELO', 'VERMELHO']).optional(), comentario: z.string().max(2000).optional().nullable() })
  router.post('/resultados-chave/:id/checkins', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const kr = await prisma.reiResultadoChave.findFirst({ where: { id: String(req.params.id), tenantId }, include: { objetivo: true } })
    if (!kr) return res.status(404).json({ error: 'Resultado-chave não encontrado.' })
    if (!podeAtualizarKR(req, kr, kr.objetivo)) fail(403, 'Apenas o responsável pelo resultado-chave, a coordenação ou a reitoria podem registrar check-ins.')
    if (kr.objetivo.status !== 'ATIVO') fail(409, 'Check-ins só podem ser registrados em objetivos ativos.')
    if (kr.fonte === 'INDICADOR') fail(409, `Este resultado-chave é alimentado automaticamente pelo indicador "${kr.indicadorChave}".`)
    const d = parseBody(checkinSchema, req.body)
    const now = new Date()
    const progresso = progressoKR({ valorInicial: kr.valorInicial, valorMeta: kr.valorMeta, valorAtual: d.valor, sentido: kr.sentido })
    const status = statusKR(progresso, kr.objetivo.inicio, kr.objetivo.fim, now)
    const confianca = d.confianca ?? confiancaDoStatus(status)
    const proximo = progresso >= 100 ? null : addDias(now, kr.checkinFrequenciaDias)
    const [checkin, row] = await prisma.$transaction([
      prisma.reiCheckin.create({ data: { tenantId, resultadoId: kr.id, valor: d.valor, valorAnterior: kr.valorAtual, confianca, comentario: d.comentario, autorId: getUserId(req) } }),
      prisma.reiResultadoChave.update({ where: { id: kr.id }, data: { valorAtual: d.valor, progresso, confianca, ultimoCheckinEm: now, proximoCheckinEm: proximo, concluidoEm: progresso >= 100 ? kr.concluidoEm ?? now : null } }),
    ])
    await completeReminders({ tenantId, refType: 'ReiResultadoChave', refId: kr.id, userId: getUserId(req) })
    if (proximo) await agendarCheckin(row, kr.objetivo)
    const obj = await recalcularObjetivo(tenantId, kr.objetivoId)
    if (confianca === 'VERMELHO') {
      await scheduleReminder({ tenantId, modulo: 'reitoria', titulo: `Resultado-chave em risco: ${kr.titulo}`, descricao: d.comentario ?? `Progresso ${progresso}% (check-in em vermelho).`, dueAt: addDias(now, 3), severity: 'CRITICO', refType: 'ReiResultadoChave', refId: kr.id, assigneeRole: 'RECTOR', dedupeKey: `rei-kr-risco:${kr.id}:${now.toISOString().slice(0, 10)}` })
    }
    limparCachePainel(tenantId)
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'CHECKIN', refType: 'ReiResultadoChave', refId: kr.id, detalhes: { valor: d.valor, progresso } })
    res.status(201).json({ checkin, resultado: enriquecerKR(row, kr.objetivo), objetivoProgresso: obj.progresso })
  }))

  router.get('/resultados-chave/:id/checkins', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const kr = await prisma.reiResultadoChave.findFirst({ where: { id: String(req.params.id), tenantId }, select: { id: true } })
    if (!kr) return res.status(404).json({ error: 'Resultado-chave não encontrado.' })
    res.json(await prisma.reiCheckin.findMany({ where: { tenantId, resultadoId: kr.id }, orderBy: { createdAt: 'desc' }, take: 200 }))
  }))

  // ---- painel de OKRs ----
  router.get('/okr/painel', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await resumoOkr(getTenantId(req), qs(req.query.ciclo)))
  }))

  router.post('/okr/sincronizar', requireRole(...SUPER_ONLY), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    limparCachePainel(getTenantId(req))
    res.json(await okrManutencao())
  }))
}

export async function resumoOkr(tenantId: string, ciclo?: string, now = new Date()) {
  const objetivos = await prisma.reiObjetivo.findMany({ where: { tenantId, status: 'ATIVO', ...(ciclo ? { ciclo } : {}) }, include: { resultados: true }, orderBy: { createdAt: 'asc' }, take: 200 })
  const krs = objetivos.flatMap((o) => o.resultados.map((k) => ({ ...enriquecerKR(k, o, now), objetivoTitulo: o.titulo, objetivoId: o.id })))
  const porStatus: Record<string, number> = {}
  for (const k of krs) porStatus[k.status] = (porStatus[k.status] ?? 0) + 1
  const progressoMedio = objetivos.length ? round1(objetivos.reduce((s, o) => s + o.progresso, 0) / objetivos.length) : null
  return {
    ciclo: ciclo ?? null,
    objetivosAtivos: objetivos.length,
    resultadosChave: krs.length,
    progressoMedio,
    porStatus,
    desatualizados: krs.filter((k) => k.desatualizado).map((k) => ({ id: k.id, titulo: k.titulo, objetivoTitulo: k.objetivoTitulo, ultimoCheckinEm: k.ultimoCheckinEm })),
    emRisco: krs.filter((k) => k.status === 'ATRASADO' || k.status === 'EM_RISCO').map((k) => ({ id: k.id, titulo: k.titulo, objetivoId: k.objetivoId, objetivoTitulo: k.objetivoTitulo, progresso: k.progresso, esperadoPct: k.esperadoPct, status: k.status })),
    objetivos: objetivos.map((o) => ({ id: o.id, codigo: o.codigo, titulo: o.titulo, nivel: o.nivel, progresso: o.progresso, fim: o.fim, responsavelNome: o.responsavelNome })),
  }
}
