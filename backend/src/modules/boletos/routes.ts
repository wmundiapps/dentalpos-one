import { NextFunction, Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireAuth, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { CONFERE, LEITURA, OPERA, httpError, nomesUsuarios, papelDe, soDigitos, tid, uid } from '../tesouraria/common'
import { validarDocumento } from '../tesouraria/fiscal'
import { autorizarBoleto, conferirBoleto, refutarBoleto } from './autorizacao'
import { lerLinhaDigitavel } from './linha'
import { AVISO_VERIFICACAO, criarLote, decidirLote, enviarLote, relatorioLote } from './lotes'
import { provedoresDda } from './provedorDda'
import { PERIODOS, aceitarSugestao, aprenderRecorrencias, planilhaDoDia, tratarEsperado, verificarRecorrencias } from './recorrencias'
import {
  DOMINIO_PADRAO, MAX_ANEXO_BYTES, analisarBoleto, auditar, criarBoleto, enderecoEmail, fimDoDia, getCfg, inicioDoDia, meioDia, novoToken, paraApi, processarEmail, sincronizarDda,
} from './servico'
import { registrarJobsBoletos } from './jobs'

// Caixa de boletos (DDA + e-mail dedicado). Montado em /api/edu/boletos (autenticado; tenant vem do token).
// Papéis: FINANCE lança/sincroniza/monta lotes; FINANCE e COORDINATOR conferem/autorizam/refutam/aprovam lotes; ADMIN/OWNER/RECTOR/BOARD tudo e as configurações.
const router = Router()
router.use(requireAuth)
registrarJobsBoletos()

const hoje = () => meioDia(new Date().toISOString().slice(0, 10))
const ABERTOS = ['RECEBIDO', 'A_CONFERIR', 'EM_APROVACAO']

/** Efeitos após entrar boleto novo: reavalia a memória de recorrências (melhor esforço; nunca derruba a operação). */
async function aposEntrada(tenantId: string, userId?: string) {
  try { await verificarRecorrencias(tenantId, new Date(), userId) } catch (e: any) { console.error('[boletos-recorrencias]', e?.message) }
}

// ---------------- painel ----------------
router.get('/painel', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const dia = hoje()
  const [recebidosHoje, aguardando, suspeitos, duplicados, recorrentesPendentes, autorizadosHoje, valorAg, cfg, ultimoEmail, lotes] = await Promise.all([
    prisma.bolBoleto.count({ where: { tenantId, recebidoEm: { gte: inicioDoDia(dia), lte: fimDoDia(dia) } } }),
    prisma.bolBoleto.count({ where: { tenantId, status: { in: ABERTOS } } }),
    prisma.bolBoleto.count({ where: { tenantId, status: { in: ABERTOS }, resultado: 'SUSPEITO' } }),
    prisma.bolBoleto.count({ where: { tenantId, status: { in: ABERTOS }, resultado: 'DUPLICADO' } }),
    prisma.bolEsperado.count({ where: { tenantId, status: 'NAO_LANCADO' } }),
    prisma.bolBoleto.count({ where: { tenantId, status: 'AUTORIZADO', decididoEm: { gte: inicioDoDia(dia), lte: fimDoDia(dia) } } }),
    prisma.bolBoleto.aggregate({ where: { tenantId, status: { in: ABERTOS } }, _sum: { valor: true } }),
    getCfg(tenantId),
    prisma.bolEmail.findFirst({ where: { tenantId }, orderBy: { recebidoEm: 'desc' }, select: { recebidoEm: true, status: true } }),
    prisma.bolLote.count({ where: { tenantId, status: 'ENVIADO_APROVACAO' } }),
  ])
  res.json({
    recebidosHoje, aguardando, suspeitos, duplicados, recorrentesPendentes, autorizadosHoje, lotesAguardandoAprovacao: lotes, valorAguardando: Math.round((valorAg._sum.valor ?? 0) * 100) / 100,
    dda: { ativo: cfg.ddaAtivo, provedor: cfg.ddaProvedor, simulado: provedoresDda().find((p) => p.nome === cfg.ddaProvedor)?.simulado ?? true, ultimaSincronizacao: cfg.ddaUltimaSincEm, resumo: cfg.ddaUltimaSincResumo },
    email: { ativo: cfg.emailAtivo, endereco: enderecoEmail(cfg), ultimoRecebimento: ultimoEmail?.recebidoEm ?? null },
    aviso: AVISO_VERIFICACAO,
  })
}))

// ---------------- configuração ----------------
const cfgOut = (cfg: any, tenantId: string, extra: Record<string, unknown> = {}) => ({
  emailAtivo: cfg.emailAtivo, emailLocal: cfg.emailLocal, dominioEmail: cfg.dominioEmail, dominioPadrao: DOMINIO_PADRAO, endereco: enderecoEmail(cfg),
  webhookPath: `/api/public/edu/boletos/webhook/email/${tenantId}`, tokenPrefixo: cfg.webhookTokenPrefixo, tokenConfigurado: !!cfg.webhookTokenHash, maxAnexoBytes: MAX_ANEXO_BYTES,
  ddaAtivo: cfg.ddaAtivo, ddaProvedor: cfg.ddaProvedor, ddaDocumento: cfg.ddaDocumento, provedoresDda: provedoresDda(), ddaUltimaSincEm: cfg.ddaUltimaSincEm,
  diasVencidoSuspeito: cfg.diasVencidoSuspeito, fatorValorSuspeito: cfg.fatorValorSuspeito, toleranciaDiasDuplicidade: cfg.toleranciaDiasDuplicidade, prazoNotaDias: cfg.prazoNotaDias, recorrenciaAprendizado: cfg.recorrenciaAprendizado,
  ...extra,
})

router.get('/config', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  res.json(cfgOut(await getCfg(tenantId), tenantId))
}))

const cfgSchema = z.object({
  emailAtivo: z.boolean().optional(),
  emailLocal: z.string().regex(/^[a-z0-9._-]{2,40}$/, 'use letras minúsculas, números, ponto, hífen ou sublinhado (2 a 40)').optional(),
  dominioEmail: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, 'domínio inválido').max(120).nullable().optional(),
  ddaAtivo: z.boolean().optional(),
  ddaProvedor: z.string().max(40).optional(),
  ddaDocumento: z.string().max(20).nullable().optional(),
  diasVencidoSuspeito: z.number().int().min(1).max(365).optional(),
  fatorValorSuspeito: z.number().min(1.5).max(20).optional(),
  toleranciaDiasDuplicidade: z.number().int().min(0).max(30).optional(),
  prazoNotaDias: z.number().int().min(7).max(730).optional(),
  recorrenciaAprendizado: z.boolean().optional(),
})

router.put('/config', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const d = parseBody(cfgSchema, req.body)
  if (d.ddaProvedor && !provedoresDda().some((p) => p.nome === d.ddaProvedor!.toUpperCase())) throw httpError(400, `Provedor DDA desconhecido: ${d.ddaProvedor}.`)
  if (d.ddaDocumento && !validarDocumento(d.ddaDocumento)) throw httpError(400, 'CNPJ da instituição inválido.')
  const atual = await getCfg(tenantId)
  const data: any = { ...d, ...(d.ddaProvedor ? { ddaProvedor: d.ddaProvedor.toUpperCase() } : {}), ...(d.ddaDocumento ? { ddaDocumento: soDigitos(d.ddaDocumento) } : {}) }
  let tokenNovo: string | undefined
  if ((d.emailAtivo ?? atual.emailAtivo) && !atual.webhookTokenHash) {
    const t = novoToken()
    data.webhookTokenHash = t.hash; data.webhookTokenPrefixo = t.prefixo; tokenNovo = t.token
  }
  const cfg = await prisma.bolConfig.update({ where: { tenantId }, data })
  await auditar(tenantId, uid(req), 'CONFIG_ATUALIZADA', 'BolConfig', cfg.id, { campos: Object.keys(d), tokenGerado: !!tokenNovo })
  res.json(cfgOut(cfg, tenantId, tokenNovo ? { tokenNovo, tokenAviso: 'Guarde este segredo agora: ele não será mostrado de novo.' } : {}))
}))

router.post('/config/token', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  await getCfg(tenantId)
  const t = novoToken()
  const cfg = await prisma.bolConfig.update({ where: { tenantId }, data: { webhookTokenHash: t.hash, webhookTokenPrefixo: t.prefixo } })
  await auditar(tenantId, uid(req), 'TOKEN_WEBHOOK_ROTACIONADO', 'BolConfig', cfg.id)
  res.json(cfgOut(cfg, tenantId, { tokenNovo: t.token, tokenAviso: 'Guarde este segredo agora: ele não será mostrado de novo. O segredo anterior deixou de valer.' }))
}))

// ---------------- DDA ----------------
router.post('/dda/sincronizar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const r = await sincronizarDda(tenantId, uid(req))
  await aposEntrada(tenantId, uid(req))
  res.json(r)
}))

// ---------------- e-mail ----------------
const anexoSchema = z.object({ filename: z.string().min(1).max(200), mime: z.string().max(120).optional(), contentBase64: z.string().max(4_000_000) })
const emailSchema = z.object({
  de: z.string().max(200).optional(), para: z.string().max(200).optional(), assunto: z.string().max(300).optional(), texto: z.string().max(50_000).optional(),
  anexos: z.array(anexoSchema).max(10).default([]), messageId: z.string().max(200).optional(),
})

router.post('/email/simular', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const d = parseBody(emailSchema, req.body)
  if (!(d.texto || '').trim() && !d.anexos.length) throw httpError(400, 'Informe o texto do e-mail e/ou ao menos um anexo.')
  const cfg = await getCfg(tenantId)
  const r = await processarEmail(tenantId, {
    messageId: d.messageId, remetente: d.de || 'fornecedor@exemplo.com.br', destinatario: d.para || enderecoEmail(cfg), assunto: d.assunto, texto: d.texto,
    anexos: d.anexos.map((a) => ({ nome: a.filename, mime: a.mime, conteudo: Buffer.from(a.contentBase64.replace(/^data:[^,]*,/, ''), 'base64') })),
  }, { origem: 'SIMULADO', userId: uid(req), papel: papelDe(req) })
  await aposEntrada(tenantId, uid(req))
  res.status(r.duplicadoEmail ? 200 : 201).json({
    email: r.email, boletos: r.boletos.map((b) => paraApi(b)), anexos: r.anexos, duplicadoEmail: r.duplicadoEmail,
    aviso: r.email.status === 'ILEGIVEL' || r.email.status === 'SEM_DADOS' ? r.email.observacao : undefined,
  })
}))

router.get('/emails', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const [total, items] = await Promise.all([
    prisma.bolEmail.count({ where: { tenantId } }),
    prisma.bolEmail.findMany({ where: { tenantId }, orderBy: { recebidoEm: 'desc' }, skip, take }),
  ])
  const ids = items.map((e) => e.id)
  const anexos = await prisma.bolAnexo.findMany({ where: { tenantId, emailId: { in: ids } }, select: { id: true, emailId: true, boletoId: true, nome: true, mime: true, tamanho: true, leitura: true, leituraNota: true } })
  res.json({ total, page, pageSize, items: items.map((e) => ({ ...e, corpo: (e.corpo || '').slice(0, 400), anexosLidos: anexos.filter((a) => a.emailId === e.id) })) })
}))

// ---------------- lotes ----------------
router.get('/lotes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId }
  const st = qs(req.query.status)
  if (st) where.status = st
  const [total, items] = await Promise.all([prisma.bolLote.count({ where }), prisma.bolLote.findMany({ where, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }], skip, take })])
  const cont = await prisma.bolBoleto.groupBy({ by: ['loteId'], where: { tenantId, loteId: { in: items.map((l) => l.id) } }, _count: true, _sum: { valor: true } })
  const m = new Map(cont.map((c) => [c.loteId, c]))
  res.json({ total, page, pageSize, items: items.map((l) => ({ ...l, itens: m.get(l.id)?._count ?? 0, valorTotal: m.get(l.id)?._sum.valor ?? 0 })) })
}))

router.get('/lotes/relatorio', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const loteId = qs(req.query.loteId) ?? null
  res.json(await relatorioLote(tenantId, loteId, qs(req.query.data)))
}))

router.post('/lotes', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const d = parseBody(z.object({ data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), boletoIds: z.array(z.string()).max(500).optional(), observacao: z.string().max(400).optional() }), req.body)
  res.status(201).json(await criarLote(req, d))
}))

router.get('/lotes/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const lote = await prisma.bolLote.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!lote) throw httpError(404, 'Lote não encontrado.')
  const eventos = await prisma.bolEvento.findMany({ where: { tenantId, loteId: lote.id }, orderBy: { createdAt: 'asc' } })
  const nomes = await nomesUsuarios(tenantId, eventos.map((e) => e.userId))
  res.json({ lote, relatorio: await relatorioLote(tenantId, lote.id), eventos: eventos.map((e) => ({ ...e, userNome: e.userId ? nomes[e.userId] : null })) })
}))

router.post('/lotes/:id/enviar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await enviarLote(req, String(req.params.id)))
}))

const decisaoSchema = z.object({
  decisao: z.enum(['TOTAL', 'PARCIAL', 'REPROVAR']), itens: z.array(z.string()).max(500).optional(), motivo: z.string().max(400).optional(), observacao: z.string().max(400).optional(),
  confirmarRisco: z.boolean().optional(), refutarRestantes: z.boolean().optional(), contaId: z.string().optional(), codigo2fa: z.string().max(20).optional(),
})
router.post('/lotes/:id/decidir', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await decidirLote(req, String(req.params.id), parseBody(decisaoSchema, req.body)))
}))

// ---------------- recorrências ----------------
const recSchema = z.object({
  fornecedorNome: z.string().min(2).max(150), fornecedorDocumento: z.string().max(20).optional().nullable(), fornecedorId: z.string().optional().nullable(),
  descricao: z.string().max(200).optional().nullable(), valorEstimado: z.number().positive().max(100_000_000), toleranciaPercentual: z.number().min(0).max(100).default(20),
  periodicidade: z.enum(Object.keys(PERIODOS) as [string, ...string[]]).default('MENSAL'), mesBase: z.number().int().min(1).max(12).default(1),
  diaMes: z.number().int().min(1).max(31), antecedenciaDias: z.number().int().min(0).max(30).default(5), ativa: z.boolean().default(true),
})

router.get('/recorrencias', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const [items, sugestoes] = await Promise.all([
    prisma.bolRecorrencia.findMany({ where: { tenantId }, orderBy: [{ ativa: 'desc' }, { diaMes: 'asc' }] }),
    prisma.bolRecorrenciaSugestao.findMany({ where: { tenantId, status: 'PENDENTE' }, orderBy: { createdAt: 'desc' } }),
  ])
  res.json({ items, sugestoes })
}))

router.post('/recorrencias', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const d = parseBody(recSchema, req.body)
  const doc = soDigitos(d.fornecedorDocumento)
  if (doc && !validarDocumento(doc)) throw httpError(400, 'CPF/CNPJ do fornecedor inválido.')
  if (d.fornecedorId && !(await prisma.supFornecedor.findFirst({ where: { id: d.fornecedorId, tenantId }, select: { id: true } }))) throw httpError(404, 'Fornecedor não encontrado.')
  const r = await prisma.bolRecorrencia.create({ data: { tenantId, ...d, fornecedorDocumento: doc || null, fornecedorId: d.fornecedorId || null, criadoPorId: uid(req) } })
  await auditar(tenantId, uid(req), 'RECORRENCIA_CRIADA', 'BolRecorrencia', r.id, { fornecedor: r.fornecedorNome, valor: r.valorEstimado })
  res.status(201).json(r)
}))

router.put('/recorrencias/:id', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const atual = await prisma.bolRecorrencia.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!atual) throw httpError(404, 'Recorrência não encontrada.')
  const d = parseBody(recSchema.partial(), req.body)
  const doc = d.fornecedorDocumento !== undefined ? soDigitos(d.fornecedorDocumento) : undefined
  if (doc && !validarDocumento(doc)) throw httpError(400, 'CPF/CNPJ do fornecedor inválido.')
  const r = await prisma.bolRecorrencia.update({ where: { id: atual.id }, data: { ...d, ...(doc !== undefined ? { fornecedorDocumento: doc || null } : {}) } })
  await auditar(tenantId, uid(req), 'RECORRENCIA_ATUALIZADA', 'BolRecorrencia', r.id, { campos: Object.keys(d) })
  res.json(r)
}))

router.delete('/recorrencias/:id', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const atual = await prisma.bolRecorrencia.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!atual) throw httpError(404, 'Recorrência não encontrada.')
  await prisma.bolRecorrencia.update({ where: { id: atual.id }, data: { ativa: false } })
  await auditar(tenantId, uid(req), 'RECORRENCIA_DESATIVADA', 'BolRecorrencia', atual.id)
  res.json({ ok: true })
}))

router.post('/recorrencias/verificar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const verif = await verificarRecorrencias(tenantId, new Date(), uid(req))
  const aprend = await aprenderRecorrencias(tenantId)
  res.json({ ...verif, sugestoesNovas: aprend.novas })
}))

router.post('/recorrencias/sugestoes/:id/aceitar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const d = parseBody(z.object({ diaMes: z.number().int().min(1).max(31).optional(), antecedenciaDias: z.number().int().min(0).max(30).optional(), periodicidade: z.enum(Object.keys(PERIODOS) as [string, ...string[]]).optional(), valorEstimado: z.number().positive().optional() }), req.body ?? {})
  res.status(201).json(await aceitarSugestao(tid(req), String(req.params.id), uid(req), d))
}))

router.post('/recorrencias/sugestoes/:id/ignorar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const s = await prisma.bolRecorrenciaSugestao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!s) throw httpError(404, 'Sugestão não encontrada.')
  if (s.status !== 'PENDENTE') throw httpError(409, 'Esta sugestão já foi tratada.')
  await prisma.bolRecorrenciaSugestao.update({ where: { id: s.id }, data: { status: 'IGNORADA' } })
  await auditar(tenantId, uid(req), 'RECORRENCIA_SUGESTAO_IGNORADA', 'BolRecorrenciaSugestao', s.id)
  res.json({ ok: true })
}))

router.get('/planilha-do-dia', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const d = qs(req.query.data)
  res.json(await planilhaDoDia(tid(req), d ? meioDia(d) : hoje()))
}))

router.post('/esperados/:id/justificar', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const d = parseBody(z.object({ justificativa: z.string().min(5).max(400) }), req.body)
  res.json(await tratarEsperado(tid(req), String(req.params.id), uid(req), 'JUSTIFICADO', d.justificativa))
}))
router.post('/esperados/:id/dispensar', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const d = parseBody(z.object({ justificativa: z.string().min(5).max(400) }), req.body)
  res.json(await tratarEsperado(tid(req), String(req.params.id), uid(req), 'DISPENSADO', d.justificativa))
}))

// ---------------- boletos ----------------
router.get('/boletos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId }
  const st = qs(req.query.status)
  if (st === 'ABERTOS') where.status = { in: ABERTOS }
  else if (st) where.status = { in: st.split(',') }
  const rs = qs(req.query.resultado); if (rs) where.resultado = { in: rs.split(',') }
  const og = qs(req.query.origem); if (og) where.origem = og
  const lote = qs(req.query.lote); if (lote === 'sem') where.loteId = null; else if (lote) where.loteId = lote
  const q = qs(req.query.q)
  if (q) where.OR = [{ numero: { contains: q, mode: 'insensitive' } }, { beneficiarioNome: { contains: q, mode: 'insensitive' } }, { numeroDocumento: { contains: q, mode: 'insensitive' } }, { beneficiarioDocumento: { contains: soDigitos(q) || '§§' } }]
  const de = qs(req.query.de), ate = qs(req.query.ate)
  if (de || ate) where.recebidoEm = { ...(de ? { gte: inicioDoDia(meioDia(de)) } : {}), ...(ate ? { lte: fimDoDia(meioDia(ate)) } : {}) }
  const [total, items, porResultado] = await Promise.all([
    prisma.bolBoleto.count({ where }),
    prisma.bolBoleto.findMany({ where, orderBy: [{ recebidoEm: 'desc' }, { numero: 'desc' }], skip, take }),
    prisma.bolBoleto.groupBy({ by: ['resultado'], where, _count: true }),
  ])
  res.json({ total, page, pageSize, items: items.map((b) => paraApi(b)), porResultado: Object.fromEntries(porResultado.map((r) => [r.resultado, r._count])) })
}))

const manualSchema = z.object({
  linhaDigitavel: z.string().max(80).optional(), valor: z.number().positive().max(100_000_000).optional(), vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  beneficiarioNome: z.string().min(2).max(150), beneficiarioDocumento: z.string().max(20).optional(), numeroDocumento: z.string().max(40).optional(),
  nfChave: z.string().max(60).optional(), descricao: z.string().max(300).optional(), anexoId: z.string().optional(),
})
router.post('/boletos', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const d = parseBody(manualSchema, req.body)
  if (!d.linhaDigitavel && !d.valor) throw httpError(400, 'Informe a linha digitável ou o valor do boleto.')
  if (d.linhaDigitavel) {
    const l = lerLinhaDigitavel(d.linhaDigitavel)
    if (l.formato === 'INVALIDO') throw httpError(400, `Linha digitável inválida: ${l.erros[0]}.`)
  }
  const r = await criarBoleto(tenantId, d, { origem: 'MANUAL', userId: uid(req), papel: papelDe(req) })
  if (d.anexoId) await prisma.bolAnexo.updateMany({ where: { id: d.anexoId, tenantId, boletoId: null }, data: { boletoId: r.boleto.id } })
  await aposEntrada(tenantId, uid(req))
  res.status(201).json(paraApi(r.boleto))
}))

async function detalhe(tenantId: string, id: string) {
  const b = await prisma.bolBoleto.findFirst({ where: { id, tenantId } })
  if (!b) throw httpError(404, 'Boleto não encontrado.')
  const [anexos, eventos, titulo, nota, original, tituloOriginal, email, forn, lote] = await Promise.all([
    prisma.bolAnexo.findMany({ where: { tenantId, OR: [{ boletoId: b.id }, ...(b.emailId ? [{ emailId: b.emailId, boletoId: null }] : [])] }, select: { id: true, nome: true, mime: true, tamanho: true, leitura: true, leituraNota: true, sha256: true, createdAt: true } }),
    prisma.bolEvento.findMany({ where: { tenantId, boletoId: b.id }, orderBy: { createdAt: 'asc' } }),
    b.tituloId ? prisma.tesTitulo.findFirst({ where: { id: b.tituloId, tenantId }, select: { id: true, numero: true, status: true, valorBruto: true, aprovacoesFeitas: true, aprovacoesNecessarias: true, vencimento: true } }) : null,
    b.notaFiscalId ? prisma.tesNotaFiscal.findFirst({ where: { id: b.notaFiscalId, tenantId }, select: { id: true, numero: true, modelo: true, emissao: true, valorTotal: true, participanteNome: true } }) : null,
    b.duplicadoDeId ? prisma.bolBoleto.findFirst({ where: { id: b.duplicadoDeId, tenantId }, select: { id: true, numero: true, status: true, origem: true, valor: true, vencimento: true } }) : null,
    b.duplicadoTituloId ? prisma.tesTitulo.findFirst({ where: { id: b.duplicadoTituloId, tenantId }, select: { id: true, numero: true, status: true, valorBruto: true, vencimento: true } }) : null,
    b.emailId ? prisma.bolEmail.findFirst({ where: { id: b.emailId, tenantId }, select: { id: true, remetente: true, assunto: true, recebidoEm: true, origem: true } }) : null,
    b.fornecedorId ? prisma.supFornecedor.findFirst({ where: { id: b.fornecedorId, tenantId }, select: { id: true, razaoSocial: true, banco: true } }) : null,
    b.loteId ? prisma.bolLote.findFirst({ where: { id: b.loteId, tenantId }, select: { id: true, numero: true, status: true } }) : null,
  ])
  const nomes = await nomesUsuarios(tenantId, [...eventos.map((e) => e.userId), b.lancadoPorId, b.decididoPorId])
  return {
    ...paraApi(b), anexos, titulo, notaFiscal: nota, duplicadoDe: original, duplicadoTitulo: tituloOriginal, email, fornecedor: forn, lote,
    lancadoPorNome: b.lancadoPorId ? nomes[b.lancadoPorId] ?? null : null, decididoPorNome: b.decididoPorId ? nomes[b.decididoPorId] ?? null : null,
    eventos: eventos.map((e) => ({ ...e, userNome: e.userId ? nomes[e.userId] ?? null : null })), aviso: AVISO_VERIFICACAO,
  }
}

router.get('/boletos/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await detalhe(tid(req), String(req.params.id)))
}))

router.post('/boletos/:id/reanalisar', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const b = await prisma.bolBoleto.findFirst({ where: { id: String(req.params.id), tenantId }, select: { id: true } })
  if (!b) throw httpError(404, 'Boleto não encontrado.')
  await analisarBoleto(tenantId, b.id, uid(req))
  res.json(await detalhe(tenantId, b.id))
}))

router.post('/boletos/:id/autorizar', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const d = parseBody(z.object({ contaId: z.string().optional(), observacao: z.string().max(400).optional(), confirmarRisco: z.boolean().optional(), codigo2fa: z.string().max(20).optional() }), req.body ?? {})
  const r = await autorizarBoleto(req, String(req.params.id), d)
  res.json({ ...r, boleto: paraApi(r.boleto) })
}))

router.post('/boletos/:id/conferir', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const d = parseBody(z.object({ observacao: z.string().min(5).max(400) }), req.body)
  res.json(paraApi(await conferirBoleto(req, String(req.params.id), d.observacao)))
}))

router.post('/boletos/:id/refutar', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const d = parseBody(z.object({ motivo: z.string().min(5).max(400) }), req.body)
  res.json(paraApi(await refutarBoleto(req, String(req.params.id), d.motivo)))
}))

router.get('/anexos/:id/download', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const a = await prisma.bolAnexo.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
  if (!a || !a.conteudo) throw httpError(404, 'Anexo não encontrado (ou grande demais para ter sido guardado).')
  await auditar(tid(req), uid(req), 'ANEXO_BAIXADO', 'BolAnexo', a.id, { nome: a.nome })
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', `attachment; filename="${a.nome.replace(/[^\w.\- ]/g, '_')}"`)
  res.send(Buffer.from(a.conteudo, 'base64'))
}))

router.get('/boletos-eventos/auditoria', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const items = await prisma.eduAuditEvent.findMany({ where: { tenantId, modulo: 'boletos' }, orderBy: { createdAt: 'desc' }, take: 200 })
  res.json({ items })
}))

// Erros de regra de negócio (4xx) com código e detalhes estruturados.
router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent || !err || typeof err.status !== 'number' || err.status >= 500) return next(err)
  const extra: Record<string, unknown> = {}
  for (const k of ['code', 'pendencias', 'ids', 'duplicadoDeId', 'duplicadoTituloId', 'aviso']) if (err[k] !== undefined) extra[k] = err[k]
  res.status(err.status).json({ error: err.message || 'Erro.', ...extra })
})

export default router
