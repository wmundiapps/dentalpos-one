import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { montarCarteira, sincronizarCasos } from './carteira'
import { TIPOS_ENCAMINHAMENTO, cancelarEncaminhamento, enviarEncaminhamento, escalonar, retornoJuridico } from './escalonamento'
import { JURIDICO, OPERA_COB } from './roles'
import { httpErr } from './util'

const router = Router()

router.get('/encaminhamentos', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId }
  for (const k of ['tipo', 'status', 'studentId'] as const) if (qs(req.query[k])) where[k] = qs(req.query[k])
  const [rows, total] = await Promise.all([prisma.cobEncaminhamento.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, numero: true, casoId: true, studentId: true, tipo: true, status: true, simulado: true, automatico: true, valorDebito: true, protocoloExterno: true, retornoMotivo: true, enviadoEm: true, retornoEm: true, createdAt: true } }), prisma.cobEncaminhamento.count({ where })])
  const alunos = await prisma.student.findMany({ where: { tenantId, id: { in: rows.map((r) => r.studentId) } }, select: { id: true, nomeCompleto: true, ra: true } })
  const am = new Map(alunos.map((a) => [a.id, a]))
  res.json({ items: rows.map((r) => ({ ...r, aluno: am.get(r.studentId)?.nomeCompleto ?? '', ra: am.get(r.studentId)?.ra ?? '' })), total, page, pageSize })
}))

router.get('/encaminhamentos/:id', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const e = await prisma.cobEncaminhamento.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
  if (!e) throw httpErr(404, 'Encaminhamento não encontrado.')
  res.json(e)
}))
router.get('/encaminhamentos/:id/documento', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const e = await prisma.cobEncaminhamento.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
  if (!e) throw httpErr(404, 'Encaminhamento não encontrado.')
  if (!e.documentoHtml) throw httpErr(404, 'Este encaminhamento não tem documento (use o payload).')
  res.type('html').send(e.documentoHtml)
}))

// Encaminhamento manual (fora da régua)
router.post('/encaminhamentos', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ studentId: z.string(), tipo: z.enum(TIPOS_ENCAMINHAMENTO), exigeAprovacao: z.boolean().optional() }), req.body)
  await sincronizarCasos(tenantId, await montarCarteira(tenantId, new Date(), { studentId: b.studentId }))
  const caso = await prisma.cobCaso.findFirst({ where: { tenantId, studentId: b.studentId } })
  if (!caso) throw httpErr(422, 'O aluno não está em cobrança.')
  const r = await escalonar({ tenantId, caso, tipo: b.tipo, automatico: false, exigeAprovacao: b.exigeAprovacao, usuarioId: getUserId(req) })
  if (!r.criado) return res.status(409).json({ error: r.bloqueado ?? 'Não foi possível encaminhar.', encaminhamentoId: r.encaminhamentoId })
  res.status(201).json({ ...r, encaminhamento: await prisma.cobEncaminhamento.findFirst({ where: { id: r.encaminhamentoId, tenantId } }) })
}))
router.post('/encaminhamentos/:id/aprovar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await enviarEncaminhamento(getTenantId(req), String(req.params.id), getUserId(req)))
}))
router.post('/encaminhamentos/:id/cancelar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ motivo: z.string().min(3).max(500) }), req.body)
  res.json(await cancelarEncaminhamento(getTenantId(req), String(req.params.id), b.motivo, getUserId(req)))
}))

// ---------------------------------------------------------------- contrato com o módulo Jurídico
router.get('/juridico/contrato', requireRole(...JURIDICO), (_req, res) => {
  res.json({
    versao: 'cobranca.solicitacao-execucao.v1',
    descricao: 'Solicitação de execução gerada pela Cobrança. Consuma por GET /juridico/solicitacoes e responda por POST /juridico/solicitacoes/:id/retorno.',
    fluxo: ['AGUARDANDO_APROVACAO -> ENVIADO (aprovado pelo financeiro)', 'ENVIADO -> ACEITO | DEVOLVIDO', 'ACEITO -> CONCLUIDO | DEVOLVIDO'],
    retorno: { status: 'ACEITO | DEVOLVIDO | CONCLUIDO', protocolo: 'nº do processo (opcional)', motivo: 'obrigatório na devolução' },
    hookEmProcesso: "import { registrarHandlerJuridico } from '../cobranca/escalonamento'",
  })
})
router.get('/juridico/solicitacoes', requireRole(...JURIDICO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId, tipo: 'JURIDICO', status: { not: 'AGUARDANDO_APROVACAO' } }
  if (qs(req.query.status)) where.status = qs(req.query.status)
  const [items, total] = await Promise.all([prisma.cobEncaminhamento.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.cobEncaminhamento.count({ where })])
  res.json({ items, total, page, pageSize })
}))
router.post('/juridico/solicitacoes/:id/retorno', requireRole(...JURIDICO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ status: z.enum(['ACEITO', 'DEVOLVIDO', 'CONCLUIDO']), protocolo: z.string().max(80).optional(), motivo: z.string().max(500).optional() }), req.body)
  res.json(await retornoJuridico(getTenantId(req), String(req.params.id), b, getUserId(req)))
}))

export default router
