import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { aceitarAcordo, aprovarContraproposta, cancelarAcordo, criarAcordo, detalheAcordo, pagarParcela, quebrarAcordo, reabrirAcordo, renegociarAcordo, reproporAcordo, simularAcordo } from './acordos'
import { FORMAS } from './pagamentos'
import { registrarPromessa, resolverPromessa } from './promessas'
import { OPERA_COB } from './roles'
import { ehGestor, httpErr } from './util'

const router = Router()

const termos = {
  receivableIds: z.array(z.string()).max(200).optional(),
  descontoEncargosPct: z.number().min(0).max(100).optional(),
  descontoPrincipalPct: z.number().min(0).max(100).optional(),
  entrada: z.number().min(0).optional(),
  entradaPct: z.number().min(0).max(100).optional(),
  parcelas: z.number().int().min(0).max(60),
  primeiroVencimento: dateISO(),
  entradaVencimento: dateISO().optional(),
  jurosParcelamentoPct: z.number().min(0).max(12).optional(),
}
const { receivableIds: _ids, ...termosBase } = termos
const simSchema = z.object({ studentId: z.string(), ...termos })

router.post('/acordos/simular', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(simSchema, req.body)
  const s = await simularAcordo({ ...b, tenantId: getTenantId(req) })
  const { politica, ...resto } = s
  res.json({ ...resto, politica: { id: politica.id, nome: politica.nome, descontoMaxPct: politica.descontoMaxPct, entradaMinPct: politica.entradaMinPct, parcelasMax: politica.parcelasMax, parcelaMinima: politica.parcelaMinima, jurosParcelamentoPct: politica.jurosParcelamentoPct, validadePropostaDias: politica.validadePropostaDias } })
}))

router.get('/acordos', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId }
  if (qs(req.query.status)) where.status = qs(req.query.status)
  if (qs(req.query.studentId)) where.studentId = qs(req.query.studentId)
  const [rows, total] = await Promise.all([prisma.cobAcordo.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.cobAcordo.count({ where })])
  const alunos = await prisma.student.findMany({ where: { tenantId, id: { in: rows.map((r) => r.studentId) } }, select: { id: true, nomeCompleto: true, ra: true } })
  const am = new Map(alunos.map((a) => [a.id, a]))
  const pars = await prisma.cobParcela.groupBy({ by: ['acordoId', 'status'], where: { tenantId, acordoId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
  const pm = new Map<string, Record<string, number>>()
  for (const p of pars) pm.set(p.acordoId, { ...(pm.get(p.acordoId) ?? {}), [p.status]: p._count._all })
  res.json({ items: rows.map((r) => ({ ...r, termoTexto: undefined, aluno: am.get(r.studentId)?.nomeCompleto ?? '', ra: am.get(r.studentId)?.ra ?? '', parcelasPorStatus: pm.get(r.id) ?? {} })), total, page, pageSize })
}))

router.get('/acordos/:id', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await detalheAcordo(getTenantId(req), String(req.params.id)))
}))

router.post('/acordos', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(simSchema.extend({ autor: z.enum(['INSTITUICAO', 'ALUNO']).default('INSTITUICAO'), observacao: z.string().max(1000).optional() }), req.body)
  const r = await criarAcordo({ ...b, tenantId: getTenantId(req), usuarioId: getUserId(req), gestor: ehGestor(req) })
  res.status(201).json(r)
}))

const reproporSchema = z.object({ ...termosBase, autor: z.enum(['INSTITUICAO', 'ALUNO']).default('INSTITUICAO'), observacao: z.string().max(1000).optional() })
// contraproposta do ALUNO (registrada pelo atendente) ou ajuste da INSTITUICAO sobre os mesmos títulos
router.post('/acordos/:id/contraproposta', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(reproporSchema, { ...req.body, autor: 'ALUNO' })
  res.json(await reproporAcordo(getTenantId(req), String(req.params.id), { ...b, usuarioId: getUserId(req), gestor: ehGestor(req) }))
}))
router.post('/acordos/:id/ajustar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(reproporSchema, { ...req.body, autor: 'INSTITUICAO' })
  res.json(await reproporAcordo(getTenantId(req), String(req.params.id), { ...b, usuarioId: getUserId(req), gestor: ehGestor(req) }))
}))
router.post('/acordos/:id/aprovar-contraproposta', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await aprovarContraproposta(getTenantId(req), String(req.params.id), getUserId(req), ehGestor(req)))
}))

router.post('/acordos/:id/aceitar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ canal: z.enum(['PRESENCIAL', 'PORTAL', 'WHATSAPP', 'EMAIL', 'TELEFONE', 'ASSINATURA_DIGITAL']), aceitoPor: z.string().min(3).max(120), documento: z.string().max(20).optional(), ip: z.string().max(60).optional() }), req.body)
  res.json(await aceitarAcordo(getTenantId(req), String(req.params.id), { ...b, usuarioId: getUserId(req) }))
}))

router.post('/acordos/:id/parcelas/:pid/pagar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ valor: z.number().positive().optional(), forma: z.enum(FORMAS as [string, ...string[]]), dataPagamento: dateISO().optional() }), req.body)
  res.status(201).json(await pagarParcela(getTenantId(req), String(req.params.id), String(req.params.pid), { ...b, forma: b.forma as any, usuarioId: getUserId(req) }))
}))

router.post('/acordos/:id/quebrar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ motivo: z.string().min(5).max(500) }), req.body)
  res.json(await quebrarAcordo(getTenantId(req), String(req.params.id), { motivo: b.motivo, usuarioId: getUserId(req) }))
}))
router.post('/acordos/:id/reabrir', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ novoPrimeiroVencimento: dateISO().optional() }), req.body ?? {})
  res.json(await reabrirAcordo(getTenantId(req), String(req.params.id), { ...b, usuarioId: getUserId(req) }))
}))
router.post('/acordos/:id/renegociar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ ...termosBase, motivo: z.string().min(5).max(500) }), req.body)
  res.status(201).json(await renegociarAcordo(getTenantId(req), String(req.params.id), { ...b, usuarioId: getUserId(req), gestor: ehGestor(req) }))
}))
router.post('/acordos/:id/cancelar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ motivo: z.string().min(3).max(500) }), req.body)
  res.json(await cancelarAcordo(getTenantId(req), String(req.params.id), { motivo: b.motivo, usuarioId: getUserId(req) }))
}))

// Termo para impressão/assinatura (HTML) — só existe depois do aceite.
router.get('/acordos/:id/termo', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const a = await prisma.cobAcordo.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
  if (!a) throw httpErr(404, 'Acordo não encontrado.')
  if (!a.termoTexto) throw httpErr(409, 'O termo é gerado no aceite do acordo.')
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  res.type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Termo ${esc(a.numero)}</title><body style="font-family:Arial,sans-serif;max-width:780px;margin:24px auto;line-height:1.5"><pre style="white-space:pre-wrap;font-family:inherit">${esc(a.termoTexto)}</pre><p style="font-size:12px;color:#555">Código de verificação (SHA-256): ${esc(a.aceiteHash ?? '')}</p></body></html>`)
}))

// ---------------------------------------------------------------- promessas de pagamento
router.get('/promessas', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId }
  if (qs(req.query.status)) where.status = qs(req.query.status)
  if (qs(req.query.studentId)) where.studentId = qs(req.query.studentId)
  const [rows, total] = await Promise.all([prisma.cobPromessa.findMany({ where, orderBy: { dataPrometida: 'asc' }, skip, take }), prisma.cobPromessa.count({ where })])
  const alunos = await prisma.student.findMany({ where: { tenantId, id: { in: rows.map((r) => r.studentId) } }, select: { id: true, nomeCompleto: true, ra: true } })
  const am = new Map(alunos.map((a) => [a.id, a]))
  res.json({ items: rows.map((r) => ({ ...r, aluno: am.get(r.studentId)?.nomeCompleto ?? '', ra: am.get(r.studentId)?.ra ?? '' })), total, page, pageSize })
}))
router.post('/promessas', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ studentId: z.string(), valor: z.number().positive(), dataPrometida: dateISO(), receivableId: z.string().optional(), canal: z.string().max(30).optional(), observacao: z.string().max(500).optional() }), req.body)
  res.status(201).json(await registrarPromessa(getTenantId(req), { ...b, usuarioId: getUserId(req) }))
}))
for (const [rota, status] of [['cumprir', 'CUMPRIDA'], ['quebrar', 'QUEBRADA'], ['cancelar', 'CANCELADA']] as const) {
  router.post(`/promessas/:id/${rota}`, requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await resolverPromessa(getTenantId(req), String(req.params.id), status, getUserId(req)))
  }))
}

export default router
