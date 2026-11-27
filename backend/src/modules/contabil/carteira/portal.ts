import { randomBytes } from 'crypto'
import type { NextFunction, Request, Response, Router } from 'express'
import {
  CONTADORES, EQUIPE, INTERNO, PORTAL, asArray, clienteOuErro, comp, compAtual, compQ, dataOpt, emailOpt, exigir, getCfg, hojeMeioDia, httpError, pageParams, papelDe, parseBody, prisma, qs, restrito, somaMeses, tid, txt, txtOpt, uid, z,
} from './common'
import { asyncHandler, auditar, criarLoginPortal, desativarUsuario, nomesDeUsuarios, redefinirSenhaUsuario } from './host'
import { enviarArquivo, MAX_ANEXO_BYTES } from './clientes'
import { guiasDaCarteira, AVISO_LEGAL } from './provedores'
import { formatarDocumento } from './documento'
import { situacaoHon } from './honorarios'
import { registrarAcesso } from './lgpdAcesso'

export const TIPOS_DOC = ['NOTAS_EMITIDAS', 'NOTAS_RECEBIDAS', 'EXTRATO', 'FOLHA', 'CONTRATO', 'OUTRO'] as const
const MIMES_DOC = ['application/pdf', 'image/png', 'image/jpeg', 'text/csv', 'application/xml', 'text/xml', 'text/plain', 'application/x-ofx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream']
const MAX_DOCS_POR_DIA = 60

const docSchema = z.object({ tipo: z.enum(TIPOS_DOC).default('OUTRO'), competencia: comp.optional().nullable(), nome: txt(160).pipe(z.string().min(1)), dataUrl: z.string().max(5_000_000) })

function lerDataUrl(d: z.infer<typeof docSchema>) {
  const m = /^data:([\w.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(d.dataUrl)
  if (!m) throw httpError(400, 'Arquivo inválido: envie como data URL base64.')
  if (!MIMES_DOC.includes(m[1])) throw httpError(415, 'Tipo de arquivo não permitido (aceitos: PDF, PNG/JPEG, XML, CSV, OFX, TXT, XLSX).')
  const tamanho = Math.floor((m[2].replace(/\s/g, '').length * 3) / 4)
  if (tamanho > MAX_ANEXO_BYTES) throw httpError(413, `Arquivo maior que ${Math.round(MAX_ANEXO_BYTES / 1048576)} MB.`)
  return { mime: m[1], tamanho }
}

async function pendenciasDoc(tenantId: string, clienteId: string, competencia: string) {
  const cfg = await getCfg(tenantId)
  const esperados = asArray<string>(cfg.documentosEsperados)
  const recebidos = await prisma.ctbCaixaDoc.findMany({ where: { tenantId, clienteId, competencia, status: { not: 'REJEITADO' } }, select: { tipo: true, status: true } })
  return { competencia, esperados, itens: esperados.map((tipo) => { const r = recebidos.filter((x) => x.tipo === tipo); return { tipo, recebido: r.length > 0, conferido: r.some((x) => x.status === 'CONFERIDO'), comPendencia: r.some((x) => x.status === 'COM_PENDENCIA') } }), faltando: esperados.filter((t) => !recebidos.some((x) => x.tipo === t)) }
}

const senhaProvisoria = () => `Tmp-${randomBytes(6).toString('base64url')}9a`

// ----------------------------------------------------------------------------
// Portal do cliente final (cargo CLIENTE_CONTABIL): isolamento ESTRITO. O cliente vem SEMPRE do vínculo CtbPortalAcesso do usuário logado —
// nenhum identificador de cliente é aceito de entrada (rota, query ou corpo).
// ----------------------------------------------------------------------------
async function portalCtx(req: Request, res: Response, next: NextFunction) {
  try {
    if (papelDe(req) !== PORTAL) return res.status(403).json({ error: 'Área exclusiva do portal do cliente.', codigo: 'PORTAL_SOMENTE_CLIENTE' })
    const ac = await prisma.ctbPortalAcesso.findFirst({ where: { tenantId: tid(req), userId: uid(req), ativo: true } })
    if (!ac) return res.status(403).json({ error: 'Seu acesso ao portal não está ativo. Fale com o escritório.', codigo: 'PORTAL_SEM_VINCULO' })
    const cli = await prisma.ctbCliente.findFirst({ where: { id: ac.clienteId, tenantId: tid(req), anonimizadoEm: null, status: { not: 'ENCERRADO' } } })
    if (!cli) return res.status(403).json({ error: 'Cadastro não disponível no portal.', codigo: 'PORTAL_CLIENTE_INDISPONIVEL' })
    ;(req as any).portal = { clienteId: cli.id, cliente: cli }
    next()
  } catch (e) { next(e) }
}
const pc = (req: Request): { clienteId: string; cliente: any } => (req as any).portal

export function registrarPortal(router: Router) {
  // ============================ lado do escritório ============================
  router.post('/clientes/:id/portal/acesso', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    if (c.anonimizadoEm || c.status === 'ENCERRADO') throw httpError(409, 'Cliente encerrado/anonimizado não recebe acesso ao portal.')
    const d = parseBody(z.object({ email: z.string().trim().toLowerCase().email().max(160), nome: txt(120).pipe(z.string().min(2)), senha: z.string().min(10, "a senha inicial precisa ter ao menos 10 caracteres").max(100).regex(/[A-Za-z]/, "use letras").regex(/\d/, "use números").optional() }), req.body)
    const senha = d.senha ?? senhaProvisoria()
    const u = await criarLoginPortal(req, { email: d.email, nome: d.nome, senha })
    await prisma.ctbPortalAcesso.create({ data: { tenantId: tid(req), clienteId: c.id, userId: u.id } })
    await auditar(req, 'PORTAL_ACESSO_CRIADO', 'CtbCliente', c.id, { email: d.email })
    res.status(201).json({ userId: u.id, email: u.email, ...(d.senha ? {} : { senhaProvisoria: senha }), aviso: d.senha ? 'Acesso criado com a senha informada.' : 'Guarde esta senha agora: ela não será mostrada de novo. Oriente o cliente a trocá-la no primeiro acesso.' })
  }))
  router.post('/clientes/:id/portal/acesso/:pid/redefinir', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const a = await prisma.ctbPortalAcesso.findFirst({ where: { id: String(req.params.pid), tenantId: tid(req), clienteId: c.id } })
    if (!a) throw httpError(404, 'Acesso não encontrado.')
    const senha = senhaProvisoria()
    await redefinirSenhaUsuario(tid(req), a.userId, senha)
    await prisma.ctbPortalAcesso.update({ where: { id: a.id }, data: { ativo: true } })
    await auditar(req, 'PORTAL_SENHA_REDEFINIDA', 'CtbPortalAcesso', a.id)
    res.json({ senhaProvisoria: senha, aviso: 'Guarde esta senha agora: ela não será mostrada de novo.' })
  }))
  router.delete('/clientes/:id/portal/acesso/:pid', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const a = await prisma.ctbPortalAcesso.findFirst({ where: { id: String(req.params.pid), tenantId: tid(req), clienteId: c.id } })
    if (!a) throw httpError(404, 'Acesso não encontrado.')
    await prisma.ctbPortalAcesso.update({ where: { id: a.id }, data: { ativo: false } })
    await desativarUsuario(tid(req), a.userId)
    await auditar(req, 'PORTAL_ACESSO_REVOGADO', 'CtbPortalAcesso', a.id)
    res.status(204).end()
  }))

  // ---- guias (camada mínima local; o fiscal real entra pelo FiscalProvider) ----
  const guia = z.object({ tipo: z.enum(['DAS', 'DARF', 'GPS', 'FGTS', 'ISS', 'ICMS', 'OUTRA']), competencia: comp.optional().nullable(), vencimento: z.union([z.string(), z.date()]), valor: z.number().positive().max(100_000_000), codigo: txtOpt(120) })
  router.get('/clientes/:id/guias', exigir(INTERNO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const g = await guiasDaCarteira(tid(req), [{ id: c.id, empresaId: c.empresaId }])
    res.json({ items: g.guias, fiscal: { provedor: g.provedor, simulado: g.simulado, degradado: g.degradado } })
  }))
  router.post('/clientes/:id/guias', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const d = parseBody(guia, req.body)
    const venc = typeof d.vencimento === 'string' ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d.vencimento) ? `${d.vencimento}T12:00:00Z` : d.vencimento) : d.vencimento
    if (isNaN(venc.getTime())) throw httpError(400, 'Vencimento inválido.')
    const g = await prisma.ctbCarGuia.create({ data: { tenantId: tid(req), clienteId: c.id, tipo: d.tipo, competencia: d.competencia ?? null, vencimento: venc, valor: d.valor, codigo: d.codigo, criadoPorId: uid(req) } })
    await auditar(req, 'GUIA_CRIADA', 'CtbCarGuia', g.id, { clienteId: c.id, valor: g.valor })
    res.status(201).json({ ...g, aviso: 'Guia lançada manualmente (estimativa/simulação). Valide com o contador antes de pagar.' })
  }))
  router.patch('/guias/:id', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const g = await prisma.ctbCarGuia.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!g) throw httpError(404, 'Guia não encontrada.')
    await clienteOuErro(req, g.clienteId)
    const d = parseBody(z.object({ status: z.enum(['PAGA', 'CANCELADA']) }), req.body)
    res.json(await prisma.ctbCarGuia.update({ where: { id: g.id }, data: { status: d.status, pagaEm: d.status === 'PAGA' ? new Date() : null } }))
  }))

  // ---- caixa de entrada de documentos ----
  router.get('/caixa-documentos', exigir(INTERNO), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['status', 'clienteId', 'competencia', 'tipo'] as const) if (qs(req.query[k])) where[k] = qs(req.query[k])
    // contador/analista: só documentos dos próprios clientes
    const vis = await prisma.ctbCliente.findMany({ where: { tenantId, ...(restrito(req) ? { OR: [{ responsavelId: uid(req) }, { analistaId: uid(req) }] } : {}) }, select: { id: true, nome: true } })
    if (restrito(req)) where.clienteId = where.clienteId ? (vis.some((v) => v.id === where.clienteId) ? where.clienteId : '__nenhum__') : { in: vis.map((v) => v.id) }
    const [total, rows] = await Promise.all([prisma.ctbCaixaDoc.count({ where }), prisma.ctbCaixaDoc.findMany({ where, select: { id: true, clienteId: true, tipo: true, competencia: true, nome: true, mime: true, tamanho: true, status: true, observacao: true, createdAt: true, conferidoEm: true }, orderBy: { createdAt: 'desc' }, skip, take })])
    const clis = rows.length ? await prisma.ctbCliente.findMany({ where: { tenantId, id: { in: rows.map((r) => r.clienteId) } }, select: { id: true, nome: true } }) : []
    res.json({ items: rows.map((r) => ({ ...r, clienteNome: clis.find((c) => c.id === r.clienteId)?.nome ?? null })), total, page, pageSize })
  }))
  router.patch('/caixa-documentos/:id', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const d = parseBody(z.object({ status: z.enum(['CONFERIDO', 'COM_PENDENCIA', 'REJEITADO']), observacao: txtOpt(500) }), req.body)
    const doc = await prisma.ctbCaixaDoc.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) }, select: { id: true, clienteId: true } })
    if (!doc) throw httpError(404, 'Documento não encontrado.')
    await clienteOuErro(req, doc.clienteId)
    if (d.status !== 'CONFERIDO' && !d.observacao) throw httpError(400, 'Explique a pendência/rejeição para o cliente.')
    const r = await prisma.ctbCaixaDoc.update({ where: { id: doc.id }, data: { status: d.status, observacao: d.observacao, conferidoPorId: uid(req), conferidoEm: new Date() }, select: { id: true, status: true, observacao: true } })
    await auditar(req, 'DOCUMENTO_CONFERIDO', 'CtbCaixaDoc', doc.id, { status: d.status })
    res.json(r)
  }))
  router.get('/caixa-documentos/:id/download', exigir(INTERNO), asyncHandler(async (req, res) => {
    const doc = await prisma.ctbCaixaDoc.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!doc) throw httpError(404, 'Documento não encontrado.')
    await clienteOuErro(req, doc.clienteId)
    void registrarAcesso(req, doc.clienteId, 'BAIXOU_ANEXO', doc.nome)
    enviarArquivo(res, doc.nome, doc.mime, doc.conteudo)
  }))
  router.get('/clientes/:id/pendencias-documentos', exigir(INTERNO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    res.json(await pendenciasDoc(tid(req), c.id, compQ(qs(req.query.competencia), somaMeses(compAtual(), -1))))
  }))

  // ---- mensagens com o cliente (lado do escritório) ----
  router.get('/clientes/:id/mensagens-portal', exigir(INTERNO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const tenantId = tid(req)
    const rows = await prisma.ctbPortalMsg.findMany({ where: { tenantId, clienteId: c.id }, orderBy: { createdAt: 'asc' }, take: 500 })
    await prisma.ctbPortalMsg.updateMany({ where: { tenantId, clienteId: c.id, autorTipo: 'CLIENTE', lidaEm: null }, data: { lidaEm: new Date() } })
    const nomes = await nomesDeUsuarios(tenantId, rows.map((r) => r.autorId))
    res.json({ items: rows.map((r) => ({ ...r, autorNome: r.autorId ? nomes.get(r.autorId) ?? null : null })) })
  }))
  router.post('/clientes/:id/mensagens-portal', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const d = parseBody(z.object({ texto: txt(4000).pipe(z.string().min(1)) }), req.body)
    res.status(201).json(await prisma.ctbPortalMsg.create({ data: { tenantId: tid(req), clienteId: c.id, autorTipo: 'ESCRITORIO', autorId: uid(req), texto: d.texto } }))
  }))

  // ============================ portal (cliente final) ============================
  const P = '/portal'
  router.get(`${P}/resumo`, portalCtx, asyncHandler(async (req, res) => {
    const tenantId = tid(req), { clienteId, cliente } = pc(req), hoje = hojeMeioDia()
    const [g, hon, naoLidas, pend, cfg, resp] = await Promise.all([
      guiasDaCarteira(tenantId, [{ id: clienteId, empresaId: cliente.empresaId }], { status: 'ABERTA' }),
      prisma.ctbHonorario.findMany({ where: { tenantId, clienteId, status: 'ABERTO' }, orderBy: { vencimento: 'asc' } }),
      prisma.ctbPortalMsg.count({ where: { tenantId, clienteId, autorTipo: 'ESCRITORIO', lidaEm: null } }),
      pendenciasDoc(tenantId, clienteId, somaMeses(compAtual(), -1)),
      getCfg(tenantId),
      cliente.responsavelId ? nomesDeUsuarios(tenantId, [cliente.responsavelId]) : new Map<string, string>(),
    ])
    res.json({
      cliente: { nome: cliente.nome, nomeFantasia: cliente.nomeFantasia, documento: cliente.documento ? formatarDocumento(cliente.documento) : null, regime: cliente.regime, responsavel: cliente.responsavelId ? resp.get(cliente.responsavelId) ?? null : null },
      escritorio: cfg.nomeEscritorio,
      guiasAPagar: g.guias.length, guiasVencidas: g.guias.filter((x) => x.vencimento < hoje).length, proximaGuia: g.guias[0] ? { tipo: g.guias[0].tipo, vencimento: g.guias[0].vencimento, valor: g.guias[0].valor } : null,
      honorariosAbertos: hon.length, valorHonorarios: Math.round(hon.reduce((s, h) => s + h.valor, 0) * 100) / 100,
      documentosFaltando: pend.faltando, competenciaDocumentos: pend.competencia, mensagensNaoLidas: naoLidas,
      aviso: AVISO_LEGAL, fiscalSimulado: g.simulado,
    })
  }))

  router.get(`${P}/guias`, portalCtx, asyncHandler(async (req, res) => {
    const g = await guiasDaCarteira(tid(req), [{ id: pc(req).clienteId, empresaId: pc(req).cliente.empresaId }])
    const hoje = hojeMeioDia()
    res.json({ items: g.guias.map((x) => ({ id: x.id, tipo: x.tipo, competencia: x.competencia, vencimento: x.vencimento, valor: x.valor, status: x.status, vencida: x.status === 'ABERTA' && x.vencimento < hoje, codigo: x.codigo ?? null })), aviso: 'Valores são estimativas/simulações; confirme com seu contador antes de pagar.', simulado: g.simulado })
  }))

  router.get(`${P}/honorarios`, portalCtx, asyncHandler(async (req, res) => {
    const rows = await prisma.ctbHonorario.findMany({ where: { tenantId: tid(req), clienteId: pc(req).clienteId, status: { not: 'CANCELADO' } }, orderBy: { vencimento: 'desc' }, take: 60 })
    res.json({ items: rows.map((h) => ({ id: h.id, competencia: h.competencia, descricao: h.descricao, valor: h.valor, vencimento: h.vencimento, situacao: situacaoHon(h), pagoEm: h.pagoEm })) })
  }))

  router.get(`${P}/documentos`, portalCtx, asyncHandler(async (req, res) => {
    const rows = await prisma.ctbCaixaDoc.findMany({ where: { tenantId: tid(req), clienteId: pc(req).clienteId }, select: { id: true, tipo: true, competencia: true, nome: true, mime: true, tamanho: true, status: true, observacao: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 200 })
    res.json({ items: rows })
  }))
  router.get(`${P}/documentos/:id/download`, portalCtx, asyncHandler(async (req, res) => {
    const d = await prisma.ctbCaixaDoc.findFirst({ where: { id: String(req.params.id), tenantId: tid(req), clienteId: pc(req).clienteId } })
    if (!d) throw httpError(404, 'Documento não encontrado.')
    enviarArquivo(res, d.nome, d.mime, d.conteudo)
  }))
  router.post(`${P}/documentos`, portalCtx, asyncHandler(async (req, res) => {
    const d = parseBody(docSchema, req.body)
    const tenantId = tid(req), { clienteId } = pc(req)
    const { mime, tamanho } = lerDataUrl(d)
    const hoje = await prisma.ctbCaixaDoc.count({ where: { tenantId, clienteId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } })
    if (hoje >= MAX_DOCS_POR_DIA) throw httpError(429, 'Limite diário de envios atingido. Tente novamente amanhã ou fale com o escritório.')
    const r = await prisma.ctbCaixaDoc.create({ data: { tenantId, clienteId, tipo: d.tipo, competencia: d.competencia ?? somaMeses(compAtual(), -1), nome: d.nome.replace(/[\\/]/g, '_'), mime, tamanho, conteudo: d.dataUrl, enviadoPorId: uid(req) }, select: { id: true, tipo: true, competencia: true, nome: true, status: true, createdAt: true } })
    await auditar(req, 'PORTAL_DOCUMENTO_ENVIADO', 'CtbCaixaDoc', r.id, { clienteId, tipo: d.tipo, tamanho })
    const pend = await pendenciasDoc(tenantId, clienteId, r.competencia!)
    res.status(201).json({ documento: r, pendencias: pend })
  }))
  router.get(`${P}/pendencias`, portalCtx, asyncHandler(async (req, res) => {
    res.json(await pendenciasDoc(tid(req), pc(req).clienteId, compQ(qs(req.query.competencia), somaMeses(compAtual(), -1))))
  }))

  router.get(`${P}/mensagens`, portalCtx, asyncHandler(async (req, res) => {
    const tenantId = tid(req), { clienteId } = pc(req)
    const rows = await prisma.ctbPortalMsg.findMany({ where: { tenantId, clienteId }, orderBy: { createdAt: 'asc' }, take: 300 })
    await prisma.ctbPortalMsg.updateMany({ where: { tenantId, clienteId, autorTipo: 'ESCRITORIO', lidaEm: null }, data: { lidaEm: new Date() } })
    res.json({ items: rows.map((r) => ({ id: r.id, autorTipo: r.autorTipo, texto: r.texto, createdAt: r.createdAt })) })
  }))
  router.post(`${P}/mensagens`, portalCtx, asyncHandler(async (req, res) => {
    const d = parseBody(z.object({ texto: txt(4000).pipe(z.string().min(1, 'escreva a mensagem')) }), req.body)
    const m = await prisma.ctbPortalMsg.create({ data: { tenantId: tid(req), clienteId: pc(req).clienteId, autorTipo: 'CLIENTE', autorId: uid(req), texto: d.texto } })
    res.status(201).json({ id: m.id, autorTipo: m.autorTipo, texto: m.texto, createdAt: m.createdAt })
  }))
  router.post(`${P}/nps`, portalCtx, asyncHandler(async (req, res) => {
    const d = parseBody(z.object({ nota: z.number().int().min(0).max(10), comentario: txtOpt(1000) }), req.body)
    await prisma.ctbNps.create({ data: { tenantId: tid(req), clienteId: pc(req).clienteId, nota: d.nota, comentario: d.comentario, origem: 'PORTAL' } })
    res.status(201).json({ ok: true, mensagem: 'Obrigado pela avaliação!' })
  }))
  // Dados do próprio titular (transparência LGPD): somente o que o escritório guarda sobre ele, sem notas internas.
  router.get(`${P}/meus-dados`, portalCtx, asyncHandler(async (req, res) => {
    const tenantId = tid(req), { clienteId, cliente } = pc(req)
    const [contatos, socios] = await Promise.all([prisma.ctbContato.findMany({ where: { tenantId, clienteId }, select: { nome: true, papel: true, email: true, telefone: true } }), prisma.ctbSocio.findMany({ where: { tenantId, clienteId }, select: { nome: true, participacao: true, administrador: true } })])
    res.json({ cadastro: { nome: cliente.nome, nomeFantasia: cliente.nomeFantasia, documento: cliente.documento ? formatarDocumento(cliente.documento) : null, email: cliente.email, telefone: cliente.telefone, regime: cliente.regime, endereco: cliente.endereco }, contatos, socios, baseLegal: cliente.baseLegal, aviso: AVISO_LEGAL })
  }))
}
