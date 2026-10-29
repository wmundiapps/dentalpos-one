import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { renderTemplate } from '../comunicacao/pure'
import { validarMensagemCobranca } from './calculo'
import { carregarPoliticas, montarCarteira, politicaPara, POLITICA_DEFAULT } from './carteira'
import { CANAIS_COB } from './contato'
import { executarMotor, jobCobranca } from './motor'
import { OPERA_COB } from './roles'
import { httpErr } from './util'
import { ACOES } from './padroes'
import { bootstrapCobranca } from './padroes'

const router = Router()
const hhmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'use HH:MM')

const politicaSchema = z.object({
  nome: z.string().min(2).max(120),
  segmento: z.enum(['TODOS', 'GRADUACAO', 'POS', 'EAD']).default('TODOS'),
  ativa: z.boolean().default(true),
  multaPct: z.number().min(0).max(2, 'A multa moratória não pode passar de 2% (CDC art. 52, §1º).').default(2),
  jurosTipo: z.enum(['MENSAL', 'DIARIO']).default('MENSAL'),
  jurosPct: z.number().min(0).max(12).default(1),
  jurosComposto: z.boolean().default(false),
  correcaoPctAnual: z.number().min(0).max(100).default(0),
  correcaoIndice: z.enum(['NENHUM', 'IPCA', 'IGPM', 'INPC', 'FIXO']).default('NENHUM'),
  toleranciaDias: z.number().int().min(0).max(60).default(0),
  descontoQuitacaoEncargosPct: z.number().min(0).max(100).default(0),
  descontoQuitacaoPrincipalPct: z.number().min(0).max(100).default(0),
  descontoMaxPct: z.number().min(0).max(100).default(30),
  bloqueiaDescontoComBolsa: z.boolean().default(true),
  entradaMinPct: z.number().min(0).max(100).default(10),
  parcelasMax: z.number().int().min(1).max(60).default(12),
  parcelaMinima: z.number().min(0).default(50),
  jurosParcelamentoPct: z.number().min(0).max(12).default(0),
  validadePropostaDias: z.number().int().min(1).max(60).default(7),
  toleranciaQuebraDias: z.number().int().min(0).max(60).default(5),
  aplicarEncargosAcordo: z.boolean().default(true),
  pausaComPromessa: z.boolean().default(true),
  baseLegal: z.enum(['EXECUCAO_CONTRATO', 'EXERCICIO_REGULAR_DIREITOS', 'PROTECAO_CREDITO']).default('EXECUCAO_CONTRATO'),
  janelaInicio: hhmm.default('08:00'),
  janelaFim: hhmm.default('20:00'),
  diasContato: z.array(z.number().int().min(0).max(6)).min(1).default([1, 2, 3, 4, 5]),
  bloqueiaFeriados: z.boolean().default(true),
  limiteContatosDia: z.number().int().min(1).max(5).default(1),
  limiteContatosSemana: z.number().int().min(1).max(20).default(4),
  diasAvisoPrevio: z.number().int().min(5).max(90).default(10),
  valorMinimoExecucao: z.number().min(0).default(200),
})
function validarPolitica(p: z.infer<typeof politicaSchema>) {
  if (p.janelaFim.padStart(5, '0') <= p.janelaInicio.padStart(5, '0')) throw httpErr(400, 'A janela de contato deve terminar depois de começar.')
  if (p.limiteContatosSemana < p.limiteContatosDia) throw httpErr(400, 'O limite semanal não pode ser menor que o diário.')
  if (p.descontoQuitacaoEncargosPct > 100 || p.descontoQuitacaoPrincipalPct > p.descontoMaxPct) throw httpErr(400, 'O desconto de quitação sobre o principal não pode passar da alçada máxima (descontoMaxPct).')
  // CDC art. 42 / boa-fé: sem contato na madrugada; janela entre 07:00 e 21:00
  if (p.janelaInicio.padStart(5, '0') < '07:00' || p.janelaFim.padStart(5, '0') > '21:00') throw httpErr(400, 'A janela de contato deve ficar entre 07:00 e 21:00 (sem constrangimento ou incômodo, CDC art. 42).')
}

router.post('/bootstrap', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await bootstrapCobranca(tenantId)
  await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'BOOTSTRAP', detalhes: r })
  res.json(r)
}))

// ---------------------------------------------------------------- políticas
router.get('/politicas', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const items = await prisma.cobPolitica.findMany({ where: { tenantId: getTenantId(req) }, orderBy: [{ segmento: 'asc' }, { updatedAt: 'desc' }] })
  res.json({ items, padrao: POLITICA_DEFAULT })
}))
router.post('/politicas', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(politicaSchema, req.body)
  validarPolitica(b)
  if (b.ativa && (await prisma.cobPolitica.count({ where: { tenantId, segmento: b.segmento, ativa: true } }))) throw httpErr(409, `Já existe política ativa para o segmento ${b.segmento}. Edite-a ou desative-a antes.`)
  const p = await prisma.cobPolitica.create({ data: { ...b, tenantId } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'POLITICA_CRIADA', refType: 'CobPolitica', refId: p.id })
  res.status(201).json(p)
}))
router.put('/politicas/:id', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const atual = await prisma.cobPolitica.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!atual) throw httpErr(404, 'Política não encontrada.')
  const { tenantId: _t, id: _i, createdAt: _c, updatedAt: _u, ...resto } = atual
  const b = parseBody(politicaSchema, { ...resto, ...req.body })
  validarPolitica(b)
  if (b.ativa && (await prisma.cobPolitica.count({ where: { tenantId, segmento: b.segmento, ativa: true, id: { not: atual.id } } }))) throw httpErr(409, `Já existe política ativa para o segmento ${b.segmento}.`)
  const p = await prisma.cobPolitica.update({ where: { id: atual.id }, data: b })
  await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'POLITICA_ALTERADA', refType: 'CobPolitica', refId: p.id, detalhes: req.body })
  res.json(p)
}))
router.delete('/politicas/:id', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.cobPolitica.updateMany({ where: { id: String(req.params.id), tenantId }, data: { ativa: false } })
  if (!r.count) throw httpErr(404, 'Política não encontrada.')
  await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'POLITICA_DESATIVADA', refType: 'CobPolitica', refId: String(req.params.id) })
  res.json({ ok: true })
}))
router.get('/politicas/efetiva', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(politicaPara(await carregarPoliticas(getTenantId(req)), qs(req.query.segmento) ?? 'GRADUACAO'))
}))

// ---------------------------------------------------------------- réguas
const etapaSchema = z.object({
  ordem: z.number().int().min(0).max(100).default(0),
  nome: z.string().min(2).max(120),
  diaAtraso: z.number().int().min(0).max(1500),
  acao: z.enum(ACOES).default('MENSAGEM'),
  canal: z.enum(CANAIS_COB).default('WHATSAPP'),
  canalFallback: z.enum(CANAIS_COB).nullable().optional(),
  assunto: z.string().max(200).nullable().optional(),
  mensagem: z.string().max(1500).nullable().optional(),
  repetirACadaDias: z.number().int().min(1).max(90).nullable().optional(),
  maxRepeticoes: z.number().int().min(1).max(200).nullable().optional(),
  continuaAposProxima: z.boolean().default(false),
  exigeAprovacao: z.boolean().default(false),
  ativa: z.boolean().default(true),
})
function validarEtapa(e: z.infer<typeof etapaSchema>) {
  if (e.acao === 'MENSAGEM') {
    if (!e.mensagem) throw httpErr(400, `Etapa "${e.nome}": informe a mensagem.`)
    const erros = validarMensagemCobranca(e.mensagem)
    if (erros.length) throw httpErr(422, `Etapa "${e.nome}": mensagem reprovada na conformidade — ${erros.join('; ')}.`, { erros })
    if (e.canalFallback && e.canalFallback === e.canal) throw httpErr(400, 'O canal alternativo deve ser diferente do principal.')
  } else if (e.repetirACadaDias || e.maxRepeticoes) throw httpErr(400, `Etapa "${e.nome}": ações de escalonamento ocorrem uma única vez por ciclo (sem recorrência).`)
}
const reguaSchema = z.object({ nome: z.string().min(2).max(120), segmento: z.enum(['TODOS', 'GRADUACAO', 'POS', 'EAD']).default('TODOS'), ativa: z.boolean().default(true), prioridade: z.number().int().min(0).max(100).default(0), toleranciaDias: z.number().int().min(0).max(30).default(3), descricao: z.string().max(500).nullable().optional() })

router.get('/reguas', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const items = await prisma.cobRegua.findMany({ where: { tenantId: getTenantId(req) }, include: { etapas: { orderBy: [{ diaAtraso: 'asc' }, { ordem: 'asc' }] } }, orderBy: { createdAt: 'asc' } })
  res.json({ items, canais: CANAIS_COB, acoes: ACOES })
}))
router.post('/reguas', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(reguaSchema.extend({ etapas: z.array(etapaSchema).max(40).default([]) }), req.body)
  b.etapas.forEach(validarEtapa)
  const { etapas, ...cab } = b
  const r = await prisma.cobRegua.create({ data: { ...cab, tenantId, etapas: { create: etapas.map((e) => ({ ...e, tenantId })) } }, include: { etapas: true } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'REGUA_CRIADA', refType: 'CobRegua', refId: r.id })
  res.status(201).json(r)
}))
router.put('/reguas/:id', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const atual = await prisma.cobRegua.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!atual) throw httpErr(404, 'Régua não encontrada.')
  const b = parseBody(reguaSchema, { nome: atual.nome, segmento: atual.segmento, ativa: atual.ativa, prioridade: atual.prioridade, toleranciaDias: atual.toleranciaDias, descricao: atual.descricao, ...req.body })
  res.json(await prisma.cobRegua.update({ where: { id: atual.id }, data: b }))
}))
router.delete('/reguas/:id', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.cobRegua.updateMany({ where: { id: String(req.params.id), tenantId }, data: { ativa: false } })
  if (!r.count) throw httpErr(404, 'Régua não encontrada.')
  res.json({ ok: true })
}))
router.post('/reguas/:id/etapas', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.cobRegua.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!r) throw httpErr(404, 'Régua não encontrada.')
  const b = parseBody(etapaSchema, req.body)
  validarEtapa(b)
  const e = await prisma.cobReguaEtapa.create({ data: { ...b, tenantId, reguaId: r.id } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'ETAPA_CRIADA', refType: 'CobReguaEtapa', refId: e.id })
  res.status(201).json(e)
}))
router.put('/etapas/:id', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const atual = await prisma.cobReguaEtapa.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!atual) throw httpErr(404, 'Etapa não encontrada.')
  const { id: _i, tenantId: _t, reguaId: _r, createdAt: _c, updatedAt: _u, ...resto } = atual
  const b = parseBody(etapaSchema, { ...resto, ...req.body })
  validarEtapa(b)
  res.json(await prisma.cobReguaEtapa.update({ where: { id: atual.id }, data: b }))
}))
router.delete('/etapas/:id', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.cobReguaEtapa.deleteMany({ where: { id: String(req.params.id), tenantId } })
  if (!r.count) throw httpErr(404, 'Etapa não encontrada.')
  res.json({ ok: true })
}))
router.post('/reguas/validar-mensagem', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ mensagem: z.string(), extrajudicial: z.boolean().optional(), variaveis: z.record(z.string()).optional() }), req.body)
  const erros = validarMensagemCobranca(b.mensagem, { extrajudicial: b.extrajudicial })
  const r = renderTemplate(b.mensagem, b.variaveis ?? { nome: 'Maria', valor: 'R$ 500,00', saldo: 'R$ 500,00', vencimento: '10/10/2026', dias_atraso: '12', titulos: '1', curso: 'Odontologia' })
  res.json({ ok: erros.length === 0, erros, previa: r.texto, variaveisFaltantes: r.faltantes })
}))

// ---------------------------------------------------------------- motor
router.post('/motor/simular', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const now = req.body?.agora ? new Date(req.body.agora) : new Date()
  res.json(await executarMotor({ tenantId: getTenantId(req), dryRun: true, now }))
}))
router.post('/motor/executar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await jobCobranca({ tenantId, despachar: req.body?.despachar !== false })
  await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'MOTOR_MANUAL' })
  res.json(r)
}))
router.get('/execucoes', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = qs(req.query.studentId)
  let casoId = qs(req.query.casoId)
  if (studentId) casoId = (await prisma.cobCaso.findFirst({ where: { tenantId, studentId }, select: { id: true } }))?.id ?? 'nenhum'
  const items = await prisma.cobExecucao.findMany({ where: { tenantId, ...(casoId ? { casoId } : {}) }, orderBy: { updatedAt: 'desc' }, take: 200 })
  const etapas = await prisma.cobReguaEtapa.findMany({ where: { tenantId, id: { in: items.map((i) => i.etapaId) } }, select: { id: true, nome: true, diaAtraso: true, acao: true, canal: true, repetirACadaDias: true } })
  const em = new Map(etapas.map((e) => [e.id, e]))
  res.json({ items: items.map((i) => ({ ...i, etapa: em.get(i.etapaId) ?? null })) })
}))
router.get('/politicas/resumo-carteira', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const c = await montarCarteira(getTenantId(req))
  const seg: Record<string, number> = {}
  for (const l of c.linhas) seg[l.segmento] = (seg[l.segmento] ?? 0) + 1
  res.json({ devedoresPorSegmento: seg })
}))

export default router
