import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { SEGMENTOS, executarCampanha, metricasCampanha, previaCampanha } from './campanhas'
import { executarReguas } from './regua'
import { ATENDE, COBRANCA, MARKETING } from './roles'
import { CANAIS_ENVIO } from './pure'

const router = Router()
const ESCRITA_CAMP = [...MARKETING, ...COBRANCA, 'ADMISSIONS' as const, 'SUPPORT' as const]

const campSchema = z.object({
  nome: z.string().min(3),
  segmento: z.enum(SEGMENTOS),
  filtros: z.record(z.string(), z.any()).optional(),
  canal: z.enum(CANAIS_ENVIO),
  templateId: z.string(),
  finalidade: z.enum(['MARKETING', 'COBRANCA', 'ACADEMICO']).default('MARKETING'),
  agendadaPara: dateISO().optional(),
})

async function validarCamp(tenantId: string, b: { templateId: string; segmento: string; finalidade: string }) {
  const t = await prisma.comTemplate.findFirst({ where: { id: b.templateId, tenantId, ativo: true } })
  if (!t) throw Object.assign(new Error('Template inexistente ou inativo.'), { status: 400 })
  if (b.segmento === 'INADIMPLENTES' && b.finalidade === 'MARKETING') throw Object.assign(new Error('Campanha para inadimplentes deve ter finalidade COBRANCA (não é divulgação).'), { status: 400 })
}

router.get(
  '/campanhas',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    if (qs(req.query.status)) where.status = qs(req.query.status)
    const [items, total] = await Promise.all([prisma.comCampanha.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.comCampanha.count({ where })])
    res.json({ items, total, page, pageSize })
  }),
)

router.post(
  '/campanhas',
  requireRole(...ESCRITA_CAMP),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(campSchema, req.body)
    await validarCamp(tenantId, b)
    const c = await prisma.comCampanha.create({ data: { ...b, tenantId, filtros: (b.filtros ?? undefined) as any, status: b.agendadaPara ? 'AGENDADA' : 'RASCUNHO', criadoPorId: getUserId(req) } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'CAMPANHA_CRIADA', refType: 'ComCampanha', refId: c.id })
    res.status(201).json(c)
  }),
)

router.get(
  '/campanhas/:id',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.comCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Campanha não encontrada.' })
    res.json({ ...c, metricas: await metricasCampanha(tenantId, c) })
  }),
)

router.patch(
  '/campanhas/:id',
  requireRole(...ESCRITA_CAMP),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.comCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Campanha não encontrada.' })
    if (!['RASCUNHO', 'AGENDADA'].includes(c.status)) return res.status(409).json({ error: 'Só é possível editar campanhas em rascunho/agendadas.' })
    const b = parseBody(campSchema.partial(), req.body)
    await validarCamp(tenantId, { templateId: b.templateId ?? c.templateId, segmento: b.segmento ?? c.segmento, finalidade: b.finalidade ?? c.finalidade })
    res.json(await prisma.comCampanha.update({ where: { id: c.id }, data: { ...b, filtros: b.filtros as any } }))
  }),
)

router.post(
  '/campanhas/:id/previa',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.comCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Campanha não encontrada.' })
    res.json(await previaCampanha(tenantId, c))
  }),
)

router.post(
  '/campanhas/:id/agendar',
  requireRole(...ESCRITA_CAMP),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.comCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Campanha não encontrada.' })
    if (!['RASCUNHO', 'AGENDADA'].includes(c.status)) return res.status(409).json({ error: `Campanha ${c.status} não pode ser agendada.` })
    const { agendadaPara } = parseBody(z.object({ agendadaPara: dateISO() }), req.body)
    if (agendadaPara.getTime() < Date.now() - 60_000) return res.status(400).json({ error: 'Data de agendamento no passado.' })
    res.json(await prisma.comCampanha.update({ where: { id: c.id }, data: { agendadaPara, status: 'AGENDADA' } }))
  }),
)

router.post(
  '/campanhas/:id/disparar',
  requireRole(...ESCRITA_CAMP),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await executarCampanha(getTenantId(req), String(req.params.id), getUserId(req)))
  }),
)

router.post(
  '/campanhas/:id/cancelar',
  requireRole(...ESCRITA_CAMP),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.comCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Campanha não encontrada.' })
    // cancela o que ainda não saiu da caixa de saída
    const canc = await prisma.eduNotification.updateMany({ where: { tenantId, refType: 'ComCampanha', refId: c.id, status: 'PENDENTE' }, data: { status: 'CANCELADA', erro: 'Campanha cancelada.' } })
    const r = await prisma.comCampanha.update({ where: { id: c.id }, data: { status: 'CANCELADA' } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'CAMPANHA_CANCELADA', refType: 'ComCampanha', refId: c.id, detalhes: { notificacoesCanceladas: canc.count } })
    res.json({ ...r, notificacoesCanceladas: canc.count })
  }),
)

router.get(
  '/campanhas/:id/destinatarios',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId, campanhaId: String(req.params.id) }
    if (qs(req.query.resultado)) where.resultado = qs(req.query.resultado)
    const [items, total] = await Promise.all([prisma.comCampanhaDestinatario.findMany({ where, skip, take, orderBy: { createdAt: 'asc' } }), prisma.comCampanhaDestinatario.count({ where })])
    res.json({ items, total, page, pageSize })
  }),
)

// ---------------------------------------------------------------- régua de cobrança
const etapaSchema = z.object({
  nome: z.string().min(2),
  offsetDias: z.number().int().min(-60).max(365),
  canal: z.enum(CANAIS_ENVIO).default('WHATSAPP'),
  canalFallback: z.enum(CANAIS_ENVIO).nullable().optional(),
  templateId: z.string(),
  ativa: z.boolean().optional(),
})
const reguaSchema = z.object({ nome: z.string().min(3), ativa: z.boolean().optional(), toleranciaDias: z.number().int().min(0).max(30).optional(), descricao: z.string().optional(), etapas: z.array(etapaSchema).optional() })

async function validarTemplates(tenantId: string, ids: string[]) {
  const n = await prisma.comTemplate.count({ where: { tenantId, id: { in: [...new Set(ids)] } } })
  if (n !== new Set(ids).size) throw Object.assign(new Error('Template de etapa inexistente.'), { status: 400 })
}

router.get(
  '/reguas',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await prisma.comRegua.findMany({ where: { tenantId: getTenantId(req) }, include: { etapas: { orderBy: { offsetDias: 'asc' } } }, orderBy: { createdAt: 'asc' } }))
  }),
)

router.post(
  '/reguas',
  requireRole(...COBRANCA),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { etapas, ...b } = parseBody(reguaSchema, req.body)
    await validarTemplates(tenantId, (etapas ?? []).map((e) => e.templateId))
    const r = await prisma.comRegua.create({ data: { ...b, tenantId, etapas: { create: (etapas ?? []).map((e) => ({ ...e, tenantId })) } }, include: { etapas: true } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'REGUA_CRIADA', refType: 'ComRegua', refId: r.id })
    res.status(201).json(r)
  }),
)

// Rotas fixas antes de /reguas/:id
router.post(
  '/reguas/simular',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await executarReguas({ tenantId: getTenantId(req), dryRun: true }))
  }),
)
router.post(
  '/reguas/executar',
  requireRole(...COBRANCA),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await executarReguas({ tenantId: getTenantId(req) }))
  }),
)

router.patch(
  '/reguas/etapas/:etapaId',
  requireRole(...COBRANCA),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await prisma.comReguaEtapa.findFirst({ where: { id: String(req.params.etapaId), tenantId } })
    if (!e) return res.status(404).json({ error: 'Etapa não encontrada.' })
    const b = parseBody(etapaSchema.partial(), req.body)
    if (b.templateId) await validarTemplates(tenantId, [b.templateId])
    res.json(await prisma.comReguaEtapa.update({ where: { id: e.id }, data: b }))
  }),
)
router.delete(
  '/reguas/etapas/:etapaId',
  requireRole(...COBRANCA),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.comReguaEtapa.deleteMany({ where: { id: String(req.params.etapaId), tenantId: getTenantId(req) } })
    if (!r.count) return res.status(404).json({ error: 'Etapa não encontrada.' })
    res.status(204).end()
  }),
)

router.get(
  '/reguas/:id',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.comRegua.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { etapas: { orderBy: { offsetDias: 'asc' } } } })
    if (!r) return res.status(404).json({ error: 'Régua não encontrada.' })
    res.json(r)
  }),
)
router.patch(
  '/reguas/:id',
  requireRole(...COBRANCA),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.comRegua.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!r) return res.status(404).json({ error: 'Régua não encontrada.' })
    const { etapas: _e, ...b } = parseBody(reguaSchema.partial(), req.body)
    res.json(await prisma.comRegua.update({ where: { id: r.id }, data: b, include: { etapas: true } }))
  }),
)
router.post(
  '/reguas/:id/etapas',
  requireRole(...COBRANCA),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.comRegua.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!r) return res.status(404).json({ error: 'Régua não encontrada.' })
    const b = parseBody(etapaSchema, req.body)
    await validarTemplates(tenantId, [b.templateId])
    res.status(201).json(await prisma.comReguaEtapa.create({ data: { ...b, tenantId, reguaId: r.id } }))
  }),
)
router.delete(
  '/reguas/:id',
  requireRole(...COBRANCA),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.comRegua.deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!r.count) return res.status(404).json({ error: 'Régua não encontrada.' })
    res.status(204).end()
  }),
)
router.get(
  '/reguas/:id/execucoes',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where = { tenantId, reguaId: String(req.params.id) }
    const [items, total] = await Promise.all([prisma.comReguaExecucao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.comReguaExecucao.count({ where })])
    res.json({ items, total, page, pageSize })
  }),
)

export default router
