import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, pageParams, qs, dateISO } from '../core/crud'
import { audit, notify } from '../core/notify'
import { scheduleReminder, completeReminders, cancelReminders } from '../core/reminders'
import { percentualProjeto } from './calc'
import { GESTAO, LEITURA, MODULO, ensureSpace, fail, money } from './util'

export const TRANSICOES_PROJETO: Record<string, string[]> = {
  PROPOSTO: ['APROVADO', 'CANCELADO'],
  APROVADO: ['EM_EXECUCAO', 'SUSPENSO', 'CANCELADO'],
  EM_EXECUCAO: ['CONCLUIDO', 'SUSPENSO', 'CANCELADO'],
  SUSPENSO: ['EM_EXECUCAO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
}

async function recalcular(tenantId: string, projetoId: string) {
  const etapas = await prisma.infProjetoEtapa.findMany({ where: { tenantId, projetoId } })
  const percentual = percentualProjeto(etapas)
  const gastoReal = money(etapas.reduce((s, e) => s + e.custoReal, 0))
  await prisma.infProjeto.update({ where: { id: projetoId }, data: { percentual, gastoReal } })
  return { percentual, gastoReal, etapas }
}

function projetoView(p: any, etapas: any[] = p.etapas ?? [], agora = new Date()) {
  const atrasadas = etapas.filter((e) => e.status !== 'CONCLUIDA' && e.fim < agora)
  return {
    ...p,
    saldoOrcamento: money((p.quantoCusta ?? 0) - (p.gastoReal ?? 0)),
    estouroOrcamento: p.quantoCusta > 0 && p.gastoReal > p.quantoCusta,
    etapasAtrasadas: atrasadas.length,
    atrasado: (p.fimPrevisto && !['CONCLUIDO', 'CANCELADO'].includes(p.status) && p.fimPrevisto < agora) || atrasadas.length > 0,
  }
}

async function agendarEtapa(tenantId: string, projeto: any, e: any) {
  if (e.status === 'CONCLUIDA') return
  await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Etapa "${e.titulo}" — ${projeto.titulo}`, dueAt: e.fim, antecedenciaDias: 5, refType: 'InfProjetoEtapa', refId: e.id, assigneeUserId: e.responsavelUserId ?? projeto.responsavelUserId ?? undefined, assigneeRole: e.responsavelUserId || projeto.responsavelUserId ? undefined : 'FACILITIES', dedupeKey: `inf-etapa-${e.id}` })
}

const projetoCreate = z.object({
  titulo: z.string().min(3),
  oQue: z.string().min(3),
  porQue: z.string().min(3),
  onde: z.string().optional().nullable(),
  spaceId: z.string().optional().nullable(),
  quando: z.string().optional().nullable(),
  quem: z.string().optional().nullable(),
  como: z.string().optional().nullable(),
  quantoCusta: z.number().min(0).default(0),
  justificativa: z.string().optional().nullable(),
  inicioPrevisto: dateISO().optional().nullable(),
  fimPrevisto: dateISO().optional().nullable(),
  responsavelUserId: z.string().optional().nullable(),
  pdiMetaId: z.string().optional().nullable(),
  recomendacaoMec: z.string().optional().nullable(),
})
const etapaSchema = z.object({
  titulo: z.string().min(2),
  descricao: z.string().optional().nullable(),
  ordem: z.number().int().min(1).optional(),
  inicio: dateISO().optional().nullable(),
  fim: dateISO(),
  responsavelUserId: z.string().optional().nullable(),
  peso: z.number().positive().default(1),
  custoPrevisto: z.number().min(0).default(0),
})

export function mountMelhorias(router: Router) {
  router.post(
    '/projetos',
    requireRole(...GESTAO, 'COORDINATOR'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(projetoCreate, req.body)
      await ensureSpace(tenantId, d.spaceId)
      if (d.inicioPrevisto && d.fimPrevisto && d.fimPrevisto < d.inicioPrevisto) fail(400, 'fimPrevisto anterior ao inicioPrevisto.')
      const p = await prisma.infProjeto.create({ data: { ...d, tenantId, responsavelUserId: d.responsavelUserId ?? getUserId(req) } })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'PROJETO_CRIADO', refType: 'InfProjeto', refId: p.id })
      res.status(201).json(projetoView(p, []))
    }),
  )

  router.get(
    '/projetos',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['status', 'spaceId', 'pdiMetaId', 'responsavelUserId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
      if (qs(req.query.comRecomendacaoMec) === 'true') where.recomendacaoMec = { not: null }
      const q = qs(req.query.q)
      if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { oQue: { contains: q, mode: 'insensitive' } }]
      const [rows, total] = await Promise.all([prisma.infProjeto.findMany({ where, include: { etapas: true }, orderBy: { createdAt: 'desc' }, skip, take }), prisma.infProjeto.count({ where })])
      res.json({ items: rows.map((p) => projetoView(p)), total, page, pageSize })
    }),
  )

  router.get(
    '/projetos/painel',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const projs = await prisma.infProjeto.findMany({ where: { tenantId }, include: { etapas: true } })
      const vistas = projs.map((p) => projetoView(p))
      const porStatus: Record<string, number> = {}
      for (const p of projs) porStatus[p.status] = (porStatus[p.status] ?? 0) + 1
      const ativos = vistas.filter((p) => !['CANCELADO'].includes(p.status))
      res.json({
        total: projs.length, porStatus,
        orcamentoTotal: money(ativos.reduce((s, p) => s + p.quantoCusta, 0)),
        gastoTotal: money(ativos.reduce((s, p) => s + p.gastoReal, 0)),
        execucaoMediaPct: ativos.length ? money(ativos.reduce((s, p) => s + p.percentual, 0) / ativos.length) : 0,
        atrasados: vistas.filter((p) => p.atrasado).map((p) => ({ id: p.id, titulo: p.titulo, etapasAtrasadas: p.etapasAtrasadas })),
        estouroOrcamento: vistas.filter((p) => p.estouroOrcamento).map((p) => ({ id: p.id, titulo: p.titulo, orcamento: p.quantoCusta, gasto: p.gastoReal })),
        vinculadosPdi: projs.filter((p) => p.pdiMetaId).length,
        vinculadosMec: projs.filter((p) => p.recomendacaoMec).length,
      })
    }),
  )

  router.get(
    '/projetos/:id',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const p = await prisma.infProjeto.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { etapas: { orderBy: [{ ordem: 'asc' }, { fim: 'asc' }] } } })
      if (!p) return res.status(404).json({ error: 'Projeto não encontrado.' })
      res.json(projetoView(p))
    }),
  )

  router.patch(
    '/projetos/:id',
    requireRole(...GESTAO, 'COORDINATOR'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const id = String(req.params.id)
      const cur = await prisma.infProjeto.findFirst({ where: { id, tenantId } })
      if (!cur) return res.status(404).json({ error: 'Projeto não encontrado.' })
      if (['CONCLUIDO', 'CANCELADO'].includes(cur.status)) fail(409, 'Projeto encerrado não pode ser alterado.')
      const d = parseBody(projetoCreate.partial(), req.body)
      if (d.spaceId) await ensureSpace(tenantId, d.spaceId)
      // orçamento aprovado só muda via nova aprovação
      if (d.quantoCusta !== undefined && d.quantoCusta !== cur.quantoCusta && !['PROPOSTO'].includes(cur.status)) fail(409, 'Orçamento de projeto aprovado não pode ser alterado diretamente; suspenda e reaprove.')
      res.json(projetoView(await prisma.infProjeto.update({ where: { id }, data: d }), []))
    }),
  )

  router.post(
    '/projetos/:id/status',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const d = parseBody(z.object({ status: z.enum(['APROVADO', 'EM_EXECUCAO', 'CONCLUIDO', 'SUSPENSO', 'CANCELADO']), motivo: z.string().optional() }), req.body)
      const cur = await prisma.infProjeto.findFirst({ where: { id: String(req.params.id), tenantId }, include: { etapas: true } })
      if (!cur) return res.status(404).json({ error: 'Projeto não encontrado.' })
      if (!TRANSICOES_PROJETO[cur.status].includes(d.status)) fail(409, `Transição inválida: ${cur.status} -> ${d.status}.`)
      const data: any = { status: d.status }
      if (d.status === 'APROVADO') {
        if (cur.etapas.length === 0) fail(409, 'Cadastre ao menos uma etapa antes de aprovar.')
        if (!cur.fimPrevisto) data.fimPrevisto = new Date(Math.max(...cur.etapas.map((e) => e.fim.getTime())))
        data.aprovadoPorId = userId; data.aprovadoEm = new Date()
      }
      if (d.status === 'CONCLUIDO') {
        const pend = cur.etapas.filter((e) => e.status !== 'CONCLUIDA')
        if (pend.length) fail(409, `${pend.length} etapa(s) não concluída(s).`)
        data.concluidoEm = new Date(); data.percentual = 100
      }
      const p = await prisma.infProjeto.update({ where: { id: cur.id }, data })
      if (d.status === 'APROVADO' || d.status === 'EM_EXECUCAO') for (const e of cur.etapas) await agendarEtapa(tenantId, p, e)
      if (['CONCLUIDO', 'CANCELADO', 'SUSPENSO'].includes(d.status)) {
        for (const e of cur.etapas) await (d.status === 'CONCLUIDO' ? completeReminders : cancelReminders)({ tenantId, refType: 'InfProjetoEtapa', refId: e.id, userId })
      }
      if (p.responsavelUserId && p.responsavelUserId !== userId) await notify({ tenantId, userId: p.responsavelUserId, assunto: `Projeto ${d.status}`, mensagem: `O projeto "${p.titulo}" mudou para ${d.status}.${d.motivo ? ' Motivo: ' + d.motivo : ''}`, refType: 'InfProjeto', refId: p.id })
      await audit({ tenantId, userId, modulo: MODULO, acao: `PROJETO_${d.status}`, refType: 'InfProjeto', refId: p.id, detalhes: { motivo: d.motivo } })
      res.json(projetoView(p, cur.etapas))
    }),
  )

  router.post(
    '/projetos/:id/evidencias',
    requireRole(...GESTAO, 'COORDINATOR'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ url: z.string().url(), legenda: z.string().optional(), tipo: z.enum(['FOTO', 'DOCUMENTO', 'VIDEO', 'NOTA_FISCAL']).default('FOTO') }), req.body)
      const cur = await prisma.infProjeto.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!cur) return res.status(404).json({ error: 'Projeto não encontrado.' })
      const lista = Array.isArray(cur.evidencias) ? (cur.evidencias as any[]) : []
      lista.push({ ...d, data: new Date().toISOString(), por: getUserId(req) })
      res.status(201).json((await prisma.infProjeto.update({ where: { id: cur.id }, data: { evidencias: lista } })).evidencias)
    }),
  )

  // ----- Etapas -----
  router.post(
    '/projetos/:id/etapas',
    requireRole(...GESTAO, 'COORDINATOR'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(etapaSchema, req.body)
      const p = await prisma.infProjeto.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Projeto não encontrado.' })
      if (['CONCLUIDO', 'CANCELADO'].includes(p.status)) fail(409, 'Projeto encerrado.')
      if (d.inicio && d.fim < d.inicio) fail(400, 'Fim anterior ao início da etapa.')
      const ordem = d.ordem ?? (await prisma.infProjetoEtapa.count({ where: { tenantId, projetoId: p.id } })) + 1
      const e = await prisma.infProjetoEtapa.create({ data: { ...d, ordem, tenantId, projetoId: p.id } })
      await recalcular(tenantId, p.id)
      if (['APROVADO', 'EM_EXECUCAO'].includes(p.status)) await agendarEtapa(tenantId, p, e)
      res.status(201).json(e)
    }),
  )

  router.patch(
    '/etapas/:id',
    requireRole(...GESTAO, 'COORDINATOR'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const cur = await prisma.infProjetoEtapa.findFirst({ where: { id: String(req.params.id), tenantId }, include: { projeto: true } })
      if (!cur) return res.status(404).json({ error: 'Etapa não encontrada.' })
      if (['CONCLUIDO', 'CANCELADO', 'SUSPENSO'].includes(cur.projeto.status)) fail(409, `Projeto ${cur.projeto.status}: etapas bloqueadas.`)
      const d = parseBody(etapaSchema.partial().extend({ percentual: z.number().min(0).max(100).optional(), status: z.enum(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'BLOQUEADA']).optional(), custoReal: z.number().min(0).optional() }), req.body)
      const data: any = { ...d }
      if (cur.projeto.status === 'PROPOSTO' && (d.status || d.percentual)) fail(409, 'Projeto ainda não aprovado.')
      if (d.status === 'CONCLUIDA') { data.percentual = 100; data.concluidaEm = new Date() }
      else if (d.percentual !== undefined) {
        if (d.percentual >= 100) { data.status = 'CONCLUIDA'; data.concluidaEm = new Date(); data.percentual = 100 }
        else if (d.percentual > 0 && !d.status && cur.status === 'PENDENTE') data.status = 'EM_ANDAMENTO'
      }
      if (d.status && d.status !== 'CONCLUIDA' && cur.status === 'CONCLUIDA') data.concluidaEm = null
      const e = await prisma.infProjetoEtapa.update({ where: { id: cur.id }, data })
      if (e.status === 'CONCLUIDA') await completeReminders({ tenantId, refType: 'InfProjetoEtapa', refId: e.id, userId })
      else if (d.fim || d.responsavelUserId) await agendarEtapa(tenantId, cur.projeto, e)
      // primeira etapa iniciada leva o projeto a EM_EXECUCAO
      if (cur.projeto.status === 'APROVADO' && ['EM_ANDAMENTO', 'CONCLUIDA'].includes(e.status)) await prisma.infProjeto.update({ where: { id: cur.projetoId }, data: { status: 'EM_EXECUCAO' } })
      const r = await recalcular(tenantId, cur.projetoId)
      res.json({ etapa: e, projetoPercentual: r.percentual, gastoReal: r.gastoReal })
    }),
  )

  router.delete(
    '/etapas/:id',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const cur = await prisma.infProjetoEtapa.findFirst({ where: { id: String(req.params.id), tenantId }, include: { projeto: true } })
      if (!cur) return res.status(404).json({ error: 'Etapa não encontrada.' })
      if (!['PROPOSTO', 'APROVADO'].includes(cur.projeto.status)) fail(409, 'Etapas só podem ser removidas antes da execução.')
      await prisma.infProjetoEtapa.delete({ where: { id: cur.id } })
      await cancelReminders({ tenantId, refType: 'InfProjetoEtapa', refId: cur.id })
      await recalcular(tenantId, cur.projetoId)
      res.status(204).end()
    }),
  )
}

// Job: projetos com fim previsto vencido e não concluídos geram alerta crítico recorrente.
export async function jobProjetosAtrasados(agora = new Date()) {
  const ps = await prisma.infProjeto.findMany({ where: { status: { in: ['APROVADO', 'EM_EXECUCAO'] }, fimPrevisto: { lt: agora } }, take: 500 })
  for (const p of ps) {
    await scheduleReminder({ tenantId: p.tenantId, modulo: MODULO, titulo: `Projeto em atraso: ${p.titulo} (${Math.round(p.percentual)}% executado)`, dueAt: agora, remindAt: agora, severity: 'CRITICO', refType: 'InfProjeto', refId: p.id, assigneeUserId: p.responsavelUserId ?? undefined, assigneeRole: p.responsavelUserId ? undefined : 'FACILITIES', recorrenciaDias: 7, dedupeKey: `inf-proj-atraso-${p.id}` })
  }
  return { projetosAtrasados: ps.length }
}
