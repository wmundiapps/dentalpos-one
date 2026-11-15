import { createHash } from 'crypto'
import { Router } from 'express'
import { z } from 'zod'
import { AuthenticatedRequest, asyncHandler, auditar, httpError, notificarContadores, nomeEmpresa, pageParams, papelDe, parseBody, prisma, qs, requireAuth, soEscrita, soLeitura, tid, uid } from '../host2'
import { registerEduJob } from '../../core/jobs'
import { FAIXA_AVISO, redigirPii } from '../util'
import { BASE_CONHECIMENTO } from './conhecimento'
import { consultarLlm, llmConfigurado } from './llm'
import { AVISO_ASSISTENTE, avisoLgpd, baseCompleta, buscar, contextoEmpresa, detectarSensivel, finalizar, responderLocal } from './motor'

// Assistente Contábil (IA com conhecimento local + extensão opcional para LLM externo). Montado em /api/edu/contabil/assistente.
// Todo usuário com acesso ao bloco (contador, financeiro, gestor) conversa e pode solicitar revisão; só o contador decide o parecer.
const router = Router()
router.use(requireAuth)
router.use(soLeitura)
const MOD = 'assistente'
const SUPERS = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
const ehEscrita = (req: AuthenticatedRequest) => SUPERS.includes(papelDe(req)) || ['FINANCE', 'ACCOUNTANT'].includes(papelDe(req))

export async function getCfg(tenantId: string) {
  return prisma.ctbAsConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} })
}
async function artigosDoTenant(tenantId: string) {
  const rows = await prisma.ctbAsArtigo.findMany({ where: { tenantId, ativo: true } })
  return baseCompleta(rows.map((r) => ({ slug: r.slug, titulo: r.titulo, categoria: r.categoria, palavrasChave: r.palavrasChave, conteudo: r.conteudo })))
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

router.get('/meta', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const cfg = await getCfg(tid(req))
  res.json({
    avisoAssistente: AVISO_ASSISTENTE, avisoLgpd: avisoLgpd(cfg.retencaoDias), faixa: FAIXA_AVISO, retencaoDias: cfg.retencaoDias,
    llm: { configuradoNoServidor: llmConfigurado(), ativoNoTenant: cfg.usarLlmExterno && llmConfigurado(), enviarContexto: cfg.enviarContexto },
    sugestoes: ['Qual a diferença entre Simples Nacional e Lucro Presumido?', 'Quais são os prazos da DCTF, ECD e ECF?', 'Como é calculada a rescisão sem justa causa?', 'Quando vencem os alvarás da empresa?', 'Devo fazer declaração completa ou simplificada?', 'Quais são os passos para abrir uma empresa?'],
    totalArtigos: BASE_CONHECIMENTO.length, pode: { configurar: ehEscrita(req), decidirRevisao: ehEscrita(req) },
  })
}))

router.get('/config', asyncHandler(async (req: AuthenticatedRequest, res) => res.json(await getCfg(tid(req)))))
router.put('/config', soEscrita, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(z.object({ ativo: z.boolean().optional(), retencaoDias: z.number().int().min(7).max(3650).optional(), usarLlmExterno: z.boolean().optional(), enviarContexto: z.boolean().optional() }), req.body)
  await getCfg(tenantId)
  const cfg = await prisma.ctbAsConfig.update({ where: { tenantId }, data: d })
  await auditar(req, MOD, 'CONFIG_ATUALIZADA', { tipo: 'CtbAsConfig', id: cfg.id }, d)
  res.json(cfg)
}))

// ---------------- artigos do tenant (extensão da base) ----------------
router.get('/artigos', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const proprios = await prisma.ctbAsArtigo.findMany({ where: { tenantId }, orderBy: { titulo: 'asc' } })
  res.json({ padrao: BASE_CONHECIMENTO.map(({ slug, titulo, categoria }) => ({ slug, titulo, categoria })), proprios })
}))
router.post('/artigos', soEscrita, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(z.object({ slug: z.string().regex(/^[a-z0-9-]{3,60}$/), titulo: z.string().min(3).max(160), categoria: z.string().max(40).default('GERAL'), palavrasChave: z.string().max(400).default(''), conteudo: z.string().min(20).max(6000) }), req.body)
  const a = await prisma.ctbAsArtigo.upsert({ where: { tenantId_slug: { tenantId, slug: d.slug } }, create: { tenantId, ...d, criadoPorId: uid(req) }, update: { ...d, ativo: true } })
  await auditar(req, MOD, 'ARTIGO_SALVO', { tipo: 'CtbAsArtigo', id: a.id })
  res.status(201).json(a)
}))
router.delete('/artigos/:id', soEscrita, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const r = await prisma.ctbAsArtigo.updateMany({ where: { id: String(req.params.id), tenantId: tid(req) }, data: { ativo: false } })
  if (!r.count) throw httpError(404, 'Artigo não encontrado.')
  res.json({ ok: true })
}))

// ---------------- conversas ----------------
async function minhaConversa(req: AuthenticatedRequest, id: string) {
  const c = await prisma.ctbAsConversa.findFirst({ where: { id, tenantId: tid(req) } })
  if (!c || (c.userId !== uid(req) && !ehEscrita(req))) throw httpError(404, 'Conversa não encontrada.')
  return c
}
router.get('/conversas', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const todas = qs(req.query.todas) === 'true' && ehEscrita(req)
  const where: any = { tenantId, ...(todas ? {} : { userId: uid(req) }) }
  const [total, items] = await Promise.all([prisma.ctbAsConversa.count({ where }), prisma.ctbAsConversa.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take })])
  res.json({ total, page, pageSize, items })
}))
router.post('/conversas', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(z.object({ empresaId: z.string().max(80).optional().nullable(), empresaNome: z.string().max(160).optional().nullable(), titulo: z.string().max(120).optional() }), req.body)
  const cfg = await getCfg(tenantId)
  if (!cfg.ativo) throw httpError(403, 'O Assistente Contábil está desativado para esta instituição.')
  const c = await prisma.ctbAsConversa.create({ data: { tenantId, userId: uid(req), empresaId: d.empresaId, empresaNome: await nomeEmpresa(tenantId, d.empresaId, d.empresaNome), titulo: d.titulo || 'Nova conversa' } })
  await auditar(req, MOD, 'CONVERSA_INICIADA', { tipo: 'CtbAsConversa', id: c.id })
  res.status(201).json({ ...c, avisoAssistente: AVISO_ASSISTENTE, avisoLgpd: avisoLgpd(cfg.retencaoDias) })
}))
router.get('/conversas/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const c = await minhaConversa(req, String(req.params.id))
  const cfg = await getCfg(c.tenantId)
  const mensagens = await prisma.ctbAsMensagem.findMany({ where: { tenantId: c.tenantId, conversaId: c.id }, orderBy: { createdAt: 'asc' } })
  const revisoes = await prisma.ctbAsRevisao.findMany({ where: { tenantId: c.tenantId, conversaId: c.id }, orderBy: { createdAt: 'desc' } })
  res.json({ ...c, mensagens, revisoes, avisoAssistente: AVISO_ASSISTENTE, avisoLgpd: avisoLgpd(cfg.retencaoDias) })
}))
router.delete('/conversas/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const c = await minhaConversa(req, String(req.params.id))
  if (c.userId !== uid(req) && !SUPERS.includes(papelDe(req))) throw httpError(403, 'Apenas o autor ou a administração pode apagar a conversa.')
  await prisma.ctbAsMensagem.deleteMany({ where: { tenantId: c.tenantId, conversaId: c.id } })
  await prisma.ctbAsConversa.delete({ where: { id: c.id } })
  await auditar(req, MOD, 'CONVERSA_APAGADA', { tipo: 'CtbAsConversa', id: c.id })
  res.json({ ok: true })
}))

router.post('/conversas/:id/mensagens', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const c = await minhaConversa(req, String(req.params.id))
  if (c.userId !== uid(req)) throw httpError(403, 'Só o autor da conversa pode enviar mensagens nela.')
  const cfg = await getCfg(tenantId)
  if (!cfg.ativo) throw httpError(403, 'O Assistente Contábil está desativado para esta instituição.')
  const { texto } = parseBody(z.object({ texto: z.string().min(2).max(2000) }), req.body)
  const sensivel = detectarSensivel(texto)
  const masc = redigirPii(texto)
  const mUser = await prisma.ctbAsMensagem.create({ data: { tenantId, conversaId: c.id, papel: 'USUARIO', conteudo: masc.texto, sensivel } })
  const base = await artigosDoTenant(tenantId)
  const ctx = c.empresaId ? await contextoEmpresa(tenantId, c.empresaId, c.empresaNome) : null
  let r = responderLocal(texto, base, ctx, cfg.retencaoDias)
  // LLM externo: opcional, nunca para pedido sensível; minimiza dados; falha cai no motor local.
  if (!r.sensivel && cfg.usarLlmExterno && llmConfigurado()) {
    const artigos = buscar(texto, base).slice(0, 3).map((x) => x.artigo)
    const ctxTxt = cfg.enviarContexto && ctx ? JSON.stringify({ funcionarios: ctx.funcionarios, folha: ctx.folha && { competencia: ctx.folha.competencia, status: ctx.folha.status }, alvaras: ctx.alvaras.map((a) => ({ tipo: a.tipo, dias: a.dias })), obrigacoes: ctx.obrigacoes.map((o) => ({ tipo: o.tipo, prazo: o.prazo })) }) : ''
    const out = await consultarLlm({ pergunta: masc.texto, contexto: ctxTxt, artigos })
    if (out) r = { ...r, texto: finalizar(out.texto, cfg.retencaoDias), provedor: 'LLM_EXTERNO', semResposta: false }
  }
  const mAs = await prisma.ctbAsMensagem.create({ data: { tenantId, conversaId: c.id, papel: 'ASSISTENTE', conteudo: r.texto, fontes: r.fontes as any, sensivel: r.sensivel, provedor: r.provedor } })
  const titulo = c.titulo === 'Nova conversa' ? masc.texto.slice(0, 60) : c.titulo
  await prisma.ctbAsConversa.update({ where: { id: c.id }, data: { titulo, updatedAt: new Date() } })
  // auditoria: sem o texto da pergunta (só hash e indicadores)
  await auditar(req, MOD, r.sensivel ? 'PEDIDO_SENSIVEL_RECUSADO' : 'PERGUNTA_RESPONDIDA', { tipo: 'CtbAsConversa', id: c.id }, { hashPergunta: hash(texto), sensivel: r.sensivel, provedor: r.provedor, semResposta: r.semResposta, piiMascarada: masc.redigidos })
  res.status(201).json({ pergunta: mUser, resposta: mAs, sensivel: r.sensivel, semResposta: r.semResposta, sugerirRevisao: r.semResposta || r.sensivel, avisos: { assistente: AVISO_ASSISTENTE, lgpd: avisoLgpd(cfg.retencaoDias) } })
}))

// ---------------- revisão do contador ----------------
router.post('/conversas/:id/solicitar-revisao', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const c = await minhaConversa(req, String(req.params.id))
  const d = parseBody(z.object({ mensagemId: z.string().max(80).optional(), observacao: z.string().max(1000).optional().nullable() }), req.body)
  const msgs = await prisma.ctbAsMensagem.findMany({ where: { tenantId, conversaId: c.id }, orderBy: { createdAt: 'asc' } })
  if (!msgs.length) throw httpError(409, 'Converse com o assistente antes de solicitar a revisão.')
  const alvo = d.mensagemId ? msgs.find((m) => m.id === d.mensagemId && m.papel === 'ASSISTENTE') : [...msgs].reverse().find((m) => m.papel === 'ASSISTENTE')
  if (!alvo) throw httpError(404, 'Mensagem do assistente não encontrada nesta conversa.')
  const idx = msgs.findIndex((m) => m.id === alvo.id)
  const pergunta = [...msgs.slice(0, idx)].reverse().find((m) => m.papel === 'USUARIO')
  const aberta = await prisma.ctbAsRevisao.findFirst({ where: { tenantId, conversaId: c.id, mensagemId: alvo.id, status: 'PENDENTE' } })
  if (aberta) throw httpError(409, 'Já existe solicitação de revisão pendente para esta resposta.', { revisaoId: aberta.id })
  const r = await prisma.ctbAsRevisao.create({ data: { tenantId, conversaId: c.id, mensagemId: alvo.id, solicitanteId: uid(req), empresaId: c.empresaId, empresaNome: c.empresaNome, pergunta: pergunta?.conteudo || '(sem pergunta)', respostaAssistente: alvo.conteudo, observacao: d.observacao ? redigirPii(d.observacao).texto : null } })
  await auditar(req, MOD, 'REVISAO_SOLICITADA', { tipo: 'CtbAsRevisao', id: r.id })
  // notificação SEM PII: apenas aviso genérico + referência
  await notificarContadores(tenantId, 'Nova solicitação de revisão no Assistente Contábil', 'Há uma solicitação de revisão aguardando seu parecer na fila do Assistente Contábil.', { tipo: 'CtbAsRevisao', id: r.id })
  res.status(201).json(r)
}))
router.get('/revisoes', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId, ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}), ...(ehEscrita(req) ? {} : { solicitanteId: uid(req) }) }
  const [total, items] = await Promise.all([prisma.ctbAsRevisao.count({ where }), prisma.ctbAsRevisao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })])
  res.json({ total, page, pageSize, items, aviso: 'O parecer final é sempre humano (contador).' })
}))
router.put('/revisoes/:id/parecer', soEscrita, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const r = await prisma.ctbAsRevisao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!r) throw httpError(404, 'Solicitação não encontrada.')
  if (r.status !== 'PENDENTE') throw httpError(409, 'Esta solicitação já foi decidida.')
  const d = parseBody(z.object({ status: z.enum(['APROVADO', 'AJUSTAR']), parecer: z.string().min(10, 'Escreva o parecer (mínimo 10 caracteres).').max(4000) }), req.body)
  const nv = await prisma.ctbAsRevisao.update({ where: { id: r.id }, data: { status: d.status, parecer: d.parecer, revisorId: uid(req), decididoEm: new Date() } })
  await auditar(req, MOD, 'REVISAO_DECIDIDA', { tipo: 'CtbAsRevisao', id: r.id }, { status: d.status })
  res.json(nv)
}))
router.post('/revisoes/:id/reabrir', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const r = await prisma.ctbAsRevisao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!r || (r.solicitanteId !== uid(req) && !ehEscrita(req))) throw httpError(404, 'Solicitação não encontrada.')
  if (r.status !== 'AJUSTAR') throw httpError(409, 'Só é possível reabrir solicitações com status AJUSTAR.')
  res.json(await prisma.ctbAsRevisao.update({ where: { id: r.id }, data: { status: 'PENDENTE', decididoEm: null, revisorId: null } }))
}))

// ---------------- retenção (LGPD) ----------------
export async function purgarConversas(tenantId?: string) {
  const cfgs = await prisma.ctbAsConfig.findMany({ where: tenantId ? { tenantId } : {} })
  let conversas = 0
  for (const cfg of cfgs) {
    const limite = new Date(Date.now() - cfg.retencaoDias * 86_400_000)
    const velhas = await prisma.ctbAsConversa.findMany({ where: { tenantId: cfg.tenantId, updatedAt: { lt: limite } }, select: { id: true } })
    if (!velhas.length) continue
    const ids = velhas.map((v) => v.id)
    await prisma.ctbAsMensagem.deleteMany({ where: { tenantId: cfg.tenantId, conversaId: { in: ids } } })
    await prisma.ctbAsConversa.deleteMany({ where: { tenantId: cfg.tenantId, id: { in: ids } } })
    conversas += ids.length
    await auditar(null, MOD, 'RETENCAO_PURGADA', { tipo: 'CtbAsConversa' }, { conversas: ids.length, retencaoDias: cfg.retencaoDias }, cfg.tenantId)
  }
  return { tenants: cfgs.length, conversas }
}
router.post('/retencao/executar', soEscrita, asyncHandler(async (req: AuthenticatedRequest, res) => res.json(await purgarConversas(tid(req)))))
export const registrarJobsAssistente = () => registerEduJob('contabil.assistente-retencao', () => purgarConversas())
registrarJobsAssistente()

export default router
