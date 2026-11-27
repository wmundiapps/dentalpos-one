import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import {
  calcularBeneficiosCandidato, efetivarMatricula, garantirChecklistDocumentos, httpErr, iniciarMatricula, recalcularStatusDocumentos,
} from './services'

const router = Router()
const GESTAO = ['ADMISSIONS', 'SECRETARY', 'COORDINATOR'] as const
const LEITURA = [...GESTAO, 'FINANCE', 'MARKETING'] as const

// ---------- Tipos de documento (modelo de checklist) ----------

mountCrud(router, {
  model: 'admDocumentoTipo', path: '/documentos-tipos', read: [...LEITURA], write: [...GESTAO],
  create: z.object({ codigo: z.string().min(2).max(40), nome: z.string().min(2), obrigatorio: z.boolean().optional(), niveis: z.array(z.enum(['GRADUACAO', 'POS_LATO', 'POS_STRICTO'])).min(1), ativo: z.boolean().optional() }),
  search: ['nome', 'codigo'], orderBy: { nome: 'asc' }, modulo: 'admissoes',
})

// ---------- Documentos do candidato ----------

router.get('/candidatos/:id/documentos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const c = await prisma.admCandidato.findFirst({ where: { id: String(req.params.id), tenantId }, include: { processo: { select: { nivel: true } } } })
  if (!c) return res.status(404).json({ error: 'Candidato não encontrado.' })
  res.json(await garantirChecklistDocumentos(tenantId, c.id, c.processo?.nivel ?? 'GRADUACAO'))
}))

// Registro do envio do documento (url/dataUrl hospedado) — vai para análise.
router.post('/candidatos/:id/documentos/:codigo/enviar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ url: z.string().min(5) }), req.body)
  const d = await prisma.admDocumentoCandidato.findFirst({ where: { tenantId, candidatoId: String(req.params.id), codigo: String(req.params.codigo) } })
  if (!d) return res.status(404).json({ error: 'Documento não consta no checklist do candidato.' })
  const upd = await prisma.admDocumentoCandidato.update({ where: { id: d.id }, data: { url: b.url, status: 'ENVIADO', observacao: null } })
  await recalcularStatusDocumentos(tenantId, d.candidatoId)
  res.json(upd)
}))

router.post('/candidatos/:id/documentos/:codigo/revisar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ status: z.enum(['APROVADO', 'REJEITADO', 'PENDENTE']), observacao: z.string().optional() }), req.body)
  if (b.status === 'REJEITADO' && !b.observacao) throw httpErr(400, 'Informe o motivo da rejeição.')
  const d = await prisma.admDocumentoCandidato.findFirst({ where: { tenantId, candidatoId: String(req.params.id), codigo: String(req.params.codigo) } })
  if (!d) return res.status(404).json({ error: 'Documento não encontrado.' })
  if (b.status === 'APROVADO' && !d.url) throw httpErr(409, 'Documento sem arquivo anexado.')
  const upd = await prisma.admDocumentoCandidato.update({ where: { id: d.id }, data: { status: b.status, observacao: b.observacao, revisadoPorId: getUserId(req), revisadoEm: new Date() } })
  const completo = await recalcularStatusDocumentos(tenantId, d.candidatoId)
  if (b.status === 'REJEITADO') {
    const c = await prisma.admCandidato.findFirst({ where: { id: d.candidatoId, tenantId } })
    if (c) await notify({ tenantId, canal: c.telefone ? 'WHATSAPP' : 'EMAIL', destino: c.telefone ?? c.email ?? undefined, assunto: 'Documento rejeitado', mensagem: `Olá, ${c.nome}. O documento "${d.nome}" foi rejeitado: ${b.observacao}. Reenvie para concluir sua matrícula.`, templateKey: 'adm.documento.rejeitado', refType: 'AdmDocumentoCandidato', refId: d.id })
  }
  res.json({ documento: upd, checklistCompleto: completo })
}))

// ---------- Matrícula ----------

router.get('/matriculas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId }
  const st = qs(req.query.status); if (st) where.status = st
  const [items, total] = await Promise.all([
    prisma.admMatricula.findMany({ where, include: { candidato: { select: { id: true, nome: true, protocolo: true, cpf: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.admMatricula.count({ where }),
  ])
  res.json({ items: items.map(({ contratoHtml, ...m }) => m), total, page, pageSize })
}))

router.get('/matriculas/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const m = await prisma.admMatricula.findFirst({ where: { id: String(req.params.id), tenantId }, include: { candidato: { include: { documentos: true } } } })
  if (!m) return res.status(404).json({ error: 'Matrícula não encontrada.' })
  const { contratoHtml, ...resto } = m
  res.json({ ...resto, temContrato: !!contratoHtml })
}))

router.get('/matriculas/:id/contrato', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const m = await prisma.admMatricula.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, select: { contratoHtml: true } })
  if (!m?.contratoHtml) return res.status(404).json({ error: 'Contrato não gerado.' })
  res.type('html').send(m.contratoHtml)
}))

router.post('/matriculas/iniciar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ candidatoId: z.string(), ofertaId: z.string().optional(), bolsaIds: z.array(z.string()).optional() }), req.body)
  const r = await iniciarMatricula({ tenantId: getTenantId(req), userId: getUserId(req), ...b })
  const { contratoHtml, ...m } = r.matricula
  res.status(201).json({ ...r, matricula: m })
}))

router.post('/matriculas/:id/aceitar-contrato', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const m = await prisma.admMatricula.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!m) return res.status(404).json({ error: 'Matrícula não encontrada.' })
  if (['CONCLUIDA', 'CANCELADA'].includes(m.status)) return res.status(409).json({ error: `Matrícula ${m.status}.` })
  await prisma.admMatricula.update({ where: { id: m.id }, data: { contratoAceitoEm: new Date() } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'ACEITE_CONTRATO', refType: 'AdmMatricula', refId: m.id })
  res.json({ ok: true })
}))

router.post('/matriculas/:id/efetivar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ primeiroVencimento: dateISO().optional(), diaVencimento: z.number().int().min(1).max(28).optional(), termId: z.string().optional() }), req.body ?? {})
  const r = await efetivarMatricula({ tenantId: getTenantId(req), matriculaId: String(req.params.id), userId: getUserId(req), ...b })
  const { contratoHtml, ...m } = r.matricula
  res.json({ ...r, matricula: m })
}))

router.post('/matriculas/:id/cancelar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ motivo: z.string().min(3) }), req.body)
  const m = await prisma.admMatricula.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!m) return res.status(404).json({ error: 'Matrícula não encontrada.' })
  if (m.status === 'CONCLUIDA') return res.status(409).json({ error: 'Matrícula concluída: o cancelamento é feito pela secretaria acadêmica (cancelamento de aluno).' })
  if (m.status === 'CANCELADA') return res.status(409).json({ error: 'Já cancelada.' })
  await prisma.admMatricula.update({ where: { id: m.id }, data: { status: 'CANCELADA' } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'CANCELAR_MATRICULA', refType: 'AdmMatricula', refId: m.id, detalhes: b })
  res.json({ ok: true })
}))

// Matrículas iniciadas e paradas (documentos pendentes) viram lembrete de cobrança de documentos.
router.post('/matriculas/:id/lembrar-documentos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const m = await prisma.admMatricula.findFirst({ where: { id: String(req.params.id), tenantId }, include: { candidato: true } })
  if (!m) return res.status(404).json({ error: 'Matrícula não encontrada.' })
  const docs = await prisma.admDocumentoCandidato.findMany({ where: { tenantId, candidatoId: m.candidatoId, obrigatorio: true, status: { not: 'APROVADO' } } })
  if (!docs.length) return res.json({ ok: true, pendentes: 0 })
  await notify({ tenantId, canal: m.candidato.telefone ? 'WHATSAPP' : 'EMAIL', destino: m.candidato.telefone ?? m.candidato.email ?? undefined, assunto: 'Documentos pendentes para sua matrícula', mensagem: `Olá, ${m.candidato.nome}. Faltam: ${docs.map((d) => d.nome).join(', ')}.`, templateKey: 'adm.documentos.pendentes', refType: 'AdmMatricula', refId: m.id })
  await scheduleReminder({ tenantId, modulo: 'admissoes', titulo: `Documentos pendentes — ${m.candidato.nome}`, dueAt: new Date(Date.now() + 3 * 86_400_000), refType: 'AdmMatricula', refId: m.id, assigneeRole: 'ADMISSIONS', dedupeKey: `adm-docs-${m.id}` })
  res.json({ ok: true, pendentes: docs.length })
}))

// ---------- Bolsas, descontos e convênios ----------

const bolsaSchema = z.object({
  nome: z.string().min(2),
  tipo: z.enum(['BOLSA', 'DESCONTO', 'CONVENIO']).optional(),
  percentual: z.number().min(0).max(100).optional(),
  valorFixo: z.number().positive().optional().nullable(),
  regras: z.object({
    notaMinima: z.number().min(0).max(100).optional(), cotas: z.array(z.string()).optional(), niveis: z.array(z.string()).optional(),
    programIds: z.array(z.string()).optional(), tiposProcesso: z.array(z.string()).optional(), convenioEmpresa: z.string().optional(),
  }).optional().nullable(),
  convenioEmpresa: z.string().optional().nullable(),
  vigenciaInicio: dateISO().optional().nullable(),
  vigenciaFim: dateISO().optional().nullable(),
  limiteConcessoes: z.number().int().min(1).optional().nullable(),
  cumulativa: z.boolean().optional(),
  ativo: z.boolean().optional(),
})

mountCrud(router, {
  model: 'admBolsa', path: '/bolsas', read: [...LEITURA], write: ['ADMISSIONS', 'FINANCE', 'COORDINATOR'], create: bolsaSchema, update: bolsaSchema.partial(),
  search: ['nome', 'convenioEmpresa'], filters: ['tipo', 'ativo'], orderBy: { nome: 'asc' }, modulo: 'admissoes',
  beforeCreate: (d) => {
    if (!d.percentual && !d.valorFixo) throw httpErr(400, 'Informe percentual ou valor fixo.')
    if (d.vigenciaInicio && d.vigenciaFim && d.vigenciaFim < d.vigenciaInicio) throw httpErr(400, 'Vigência inválida.')
    if (d.tipo === 'CONVENIO' && !d.convenioEmpresa && !d.regras?.convenioEmpresa) throw httpErr(400, 'Convênio exige a empresa/entidade conveniada.')
    if (d.convenioEmpresa && !d.regras?.convenioEmpresa) d.regras = { ...(d.regras ?? {}), convenioEmpresa: d.convenioEmpresa }
    return d
  },
})

// Simula benefícios para um candidato e valor (mostra elegibilidade e motivos de recusa)
router.post('/bolsas/simular', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ candidatoId: z.string(), valorBase: z.number().positive().optional(), ofertaId: z.string().optional(), bolsaIds: z.array(z.string()).optional() }), req.body)
  const tenantId = getTenantId(req)
  let valor = b.valorBase
  if (!valor) {
    const c = await prisma.admCandidato.findFirst({ where: { id: b.candidatoId, tenantId } })
    const oid = b.ofertaId ?? c?.ofertaAlocadaId ?? c?.ofertaId
    const o = oid ? await prisma.admOferta.findFirst({ where: { id: oid, tenantId } }) : null
    valor = o?.valorMensalidade
  }
  if (!valor) throw httpErr(400, 'Informe valorBase ou uma oferta com mensalidade.')
  res.json({ valorBase: valor, ...(await calcularBeneficiosCandidato(tenantId, b.candidatoId, valor, b.bolsaIds ?? [])) })
}))

// Atribui bolsa ao candidato (será aplicada ao iniciar a matrícula, se elegível)
router.post('/candidatos/:id/bolsa', requireRole('ADMISSIONS', 'FINANCE', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ bolsaId: z.string().nullable() }), req.body)
  const c = await prisma.admCandidato.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!c) return res.status(404).json({ error: 'Candidato não encontrado.' })
  if (b.bolsaId) {
    const bolsa = await prisma.admBolsa.findFirst({ where: { id: b.bolsaId, tenantId, ativo: true } })
    if (!bolsa) return res.status(404).json({ error: 'Bolsa não encontrada ou inativa.' })
    const sim = await calcularBeneficiosCandidato(tenantId, c.id, 1000, [b.bolsaId])
    if (!sim.aplicados.includes(b.bolsaId)) return res.status(422).json({ error: 'Candidato não elegível a esta bolsa.', motivos: sim.rejeitadas.find((r) => r.id === b.bolsaId)?.motivos ?? [] })
  }
  await prisma.admCandidato.update({ where: { id: c.id }, data: { bolsaId: b.bolsaId } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'ATRIBUIR_BOLSA', refType: 'AdmCandidato', refId: c.id, detalhes: b })
  res.json({ ok: true })
}))

router.get('/bolsas/:id/concessoes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await prisma.admBolsaConcessao.findMany({ where: { tenantId: getTenantId(req), bolsaId: String(req.params.id) }, orderBy: { createdAt: 'desc' } }))
}))

export default router
