import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole, academicErrorHandler } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { registerEduJob } from '../core/jobs'
import { numeroAnual } from '../apoio/common'
import { MAX_LOG, TRANSICOES, resumirNavegador, sanitizarRota, sanitizarTexto, similaridade } from './sanitize'

const MOD = 'feedback'
const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
/** Triagem: administração + suporte. */
const TRIAGEM: AcademicRole[] = ['SUPPORT']
const isTriagem = (req: AuthenticatedRequest) => SUPER.includes(String(req.user?.role).toUpperCase()) || String(req.user?.role).toUpperCase() === 'SUPPORT'
const TIPOS = ['SUGESTAO', 'MELHORIA', 'ERRO', 'BUG', 'DUVIDA'] as const
const CATEGORIAS = ['ACADEMICO', 'FINANCEIRO', 'SECRETARIA', 'PORTAL', 'INFRAESTRUTURA', 'RH', 'DESEMPENHO', 'DESIGN', 'OUTRO'] as const
const PRIOR = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const
const STATUS = ['NOVO', 'EM_TRIAGEM', 'PLANEJADO', 'EM_ANDAMENTO', 'RESOLVIDO', 'RECUSADO', 'DUPLICADO'] as const
const VOTAVEIS = ['SUGESTAO', 'MELHORIA']
const fail = (status: number, msg: string): never => { throw Object.assign(new Error(msg), { status }) }
const MAX_POR_HORA = 15
const MAX_DATAURL = 2_800_000

const shotSchema = z.object({ arquivoNome: z.string().min(1).max(200), mime: z.string().max(120).optional(), dataUrl: z.string().max(MAX_DATAURL) })
const criarSchema = z.object({
  tipo: z.enum(TIPOS), categoria: z.enum(CATEGORIAS).default('OUTRO'), prioridade: z.enum(PRIOR).default('MEDIA'), titulo: z.string().min(5).max(160), descricao: z.string().min(10).max(6000),
  passosReproduzir: z.string().max(3000).optional().nullable(), anonimo: z.boolean().default(false),
  contexto: z.object({
    rota: z.string().max(400).optional(), tela: z.string().max(160).optional(), versaoApp: z.string().max(40).optional(), navegador: z.string().max(400).optional(), plataforma: z.string().max(80).optional(),
    viewport: z.string().max(30).optional(), idioma: z.string().max(20).optional(), logsConsole: z.string().max(60_000).optional(),
  }).default({}),
  capturas: z.array(shotSchema).max(3).optional(),
})

const nomeCompleto = async (tenantId: string, userId: string) => {
  const u = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { firstName: true, lastName: true, email: true } })
  return u ? [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email : null
}

/** Visão para triagem: autor anônimo continua oculto (a resposta chega a ele por userId). */
function viewTriagem(i: any) { const { autorUserId, ...r } = i; return { ...r, autorNome: i.anonimo ? null : i.autorNome, autorAnonimo: i.anonimo } }
function viewAutor(i: any) { const { autorUserId, logsConsole, responsavelUserId, autorNome, ...r } = i; return r }
function viewPublico(i: any, jaVotei: boolean) { return { id: i.id, numero: i.numero, tipo: i.tipo, categoria: i.categoria, titulo: i.titulo, descricao: i.descricao.slice(0, 400), status: i.status, votos: i.votos, jaVotei, createdAt: i.createdAt } }

async function avisarTriagem(tenantId: string, assunto: string, mensagem: string, refId: string) {
  const us = await prisma.user.findMany({ where: { tenantId, role: { in: ['ADMIN', 'OWNER', 'SUPPORT'] as any } }, select: { id: true }, take: 50 })
  for (const u of us) await notify({ tenantId, userId: u.id, assunto, mensagem, refType: 'FbkItem', refId, templateKey: 'feedback.triagem' }).catch(() => null)
}

const router = Router()

// ---------------------------------------------------------------- envio (qualquer usuário autenticado)
router.post('/itens', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), userId = getUserId(req)
  const d = parseBody(criarSchema, req.body)
  const ultimaHora = await prisma.fbkItem.count({ where: { tenantId, autorUserId: userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } })
  if (ultimaHora >= MAX_POR_HORA) { res.setHeader('Retry-After', '3600'); return res.status(429).json({ error: 'Muitos envios na última hora. Tente novamente mais tarde.' }) }
  const c = d.contexto
  const nome = d.anonimo ? null : await nomeCompleto(tenantId, userId)
  const numero = (await numeroAnual(tenantId, 'FBK')).numero
  // Moderação/tamanho dos anexos: o uploadGuard global já varreu o corpo; aqui só aceitamos imagem como captura de tela.
  for (const s of d.capturas ?? []) if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(s.dataUrl)) fail(400, 'A captura de tela deve ser uma imagem (PNG, JPEG, WEBP ou GIF).')
  const item = await prisma.fbkItem.create({
    data: {
      tenantId, numero, tipo: d.tipo, categoria: d.categoria, prioridade: d.prioridade, titulo: sanitizarTexto(d.titulo, 160), descricao: sanitizarTexto(d.descricao, 6000),
      passosReproduzir: d.passosReproduzir ? sanitizarTexto(d.passosReproduzir, 3000) : null,
      rota: sanitizarRota(c.rota), tela: c.tela ? sanitizarTexto(c.tela, 160) : null, versaoApp: c.versaoApp?.replace(/[^\w.\-+]/g, '').slice(0, 40) || null,
      perfil: String(req.user?.role ?? '').toUpperCase() || null, navegador: resumirNavegador(c.navegador), plataforma: c.plataforma ? sanitizarTexto(c.plataforma, 80) : null,
      viewport: c.viewport?.replace(/[^\dx]/gi, '').slice(0, 20) || null, idioma: c.idioma?.replace(/[^\w-]/g, '').slice(0, 20) || null,
      logsConsole: c.logsConsole ? sanitizarTexto(c.logsConsole, MAX_LOG) : null,
      autorUserId: userId, autorNome: nome, anonimo: d.anonimo,
    },
  })
  for (const s of d.capturas ?? []) {
    const tam = Math.floor(((s.dataUrl.length - s.dataUrl.indexOf(',') - 1) * 3) / 4)
    await prisma.fbkAnexo.create({ data: { tenantId, itemId: item.id, nome: s.arquivoNome.replace(/[^\w.\- ]+/g, '_').slice(0, 120), mime: s.mime ?? s.dataUrl.slice(5, s.dataUrl.indexOf(';')), dataUrl: s.dataUrl, tamanhoBytes: tam } })
  }
  if (item.prioridade === 'CRITICA' || item.tipo === 'BUG') await avisarTriagem(tenantId, `${item.tipo === 'BUG' ? 'Bug' : 'Item'} ${item.prioridade === 'CRITICA' ? 'CRÍTICO ' : ''}${numero}`, item.titulo, item.id)
  await audit({ tenantId, userId, modulo: MOD, acao: 'ENVIADO', refType: 'FbkItem', refId: item.id, detalhes: { tipo: item.tipo, anexos: d.capturas?.length ?? 0 } })
  const similares = VOTAVEIS.includes(item.tipo)
    ? (await prisma.fbkItem.findMany({ where: { tenantId, id: { not: item.id }, tipo: { in: VOTAVEIS }, status: { notIn: ['RECUSADO', 'DUPLICADO'] } }, select: { id: true, numero: true, titulo: true, votos: true }, take: 300 }))
        .map((s) => ({ ...s, sim: similaridade(item.titulo, s.titulo) })).filter((s) => s.sim >= 0.5).sort((a, b) => b.sim - a.sim).slice(0, 3)
    : []
  res.status(201).json({ ...viewAutor(item), similares })
}))

router.get('/itens/meus', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where = { tenantId: getTenantId(req), autorUserId: getUserId(req) }
  const [rows, total] = await Promise.all([prisma.fbkItem.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.fbkItem.count({ where })])
  res.json({ items: rows.map(viewAutor), total, page, pageSize })
}))

// ---------------------------------------------------------------- sugestões públicas e votação
router.get('/sugestoes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), userId = getUserId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId, tipo: { in: VOTAVEIS }, status: { notIn: ['RECUSADO', 'DUPLICADO'] } }
  const q = qs(req.query.q); if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { descricao: { contains: q, mode: 'insensitive' } }]
  if (qs(req.query.categoria)) where.categoria = qs(req.query.categoria)
  const [rows, total] = await Promise.all([prisma.fbkItem.findMany({ where, orderBy: [{ votos: 'desc' }, { createdAt: 'desc' }], skip, take }), prisma.fbkItem.count({ where })])
  const meus = new Set((await prisma.fbkVoto.findMany({ where: { tenantId, userId, itemId: { in: rows.map((r) => r.id) } } })).map((v) => v.itemId))
  res.json({ items: rows.map((r) => viewPublico(r, meus.has(r.id))), total, page, pageSize })
}))
router.post('/itens/:id/votar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), userId = getUserId(req)
  const item = await prisma.fbkItem.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!item || !VOTAVEIS.includes(item.tipo)) return res.status(404).json({ error: 'Sugestão não encontrada.' })
  if (['RECUSADO', 'DUPLICADO', 'RESOLVIDO'].includes(item.status)) fail(409, 'Esta sugestão não aceita mais votos.')
  if (item.autorUserId === userId) fail(409, 'Você não pode votar na sua própria sugestão.')
  const ja = await prisma.fbkVoto.findFirst({ where: { itemId: item.id, userId } })
  if (ja) { await prisma.fbkVoto.delete({ where: { id: ja.id } }) } else { await prisma.fbkVoto.create({ data: { tenantId, itemId: item.id, userId } }) }
  const votos = await prisma.fbkVoto.count({ where: { itemId: item.id } })
  await prisma.fbkItem.update({ where: { id: item.id }, data: { votos } })
  res.json({ votos, jaVotei: !ja })
}))

// ---------------------------------------------------------------- triagem (administração / suporte)
function filtros(req: AuthenticatedRequest) {
  const where: any = { tenantId: getTenantId(req) }
  for (const f of ['status', 'tipo', 'categoria', 'prioridade', 'responsavelUserId', 'perfil']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
  if (qs(req.query.abertos) === 'true') where.status = { in: ['NOVO', 'EM_TRIAGEM', 'PLANEJADO', 'EM_ANDAMENTO'] }
  const q = qs(req.query.q); if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { descricao: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }, { rota: { contains: q, mode: 'insensitive' } }]
  const de = qs(req.query.de), ate = qs(req.query.ate)
  if (de || ate) where.createdAt = { ...(de ? { gte: new Date(de) } : {}), ...(ate ? { lte: new Date(ate + (ate.length <= 10 ? 'T23:59:59Z' : '')) } : {}) }
  return where
}
const ORD_PRIOR: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 }

router.get('/fila', requireRole(...TRIAGEM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where = filtros(req)
  const ordem = qs(req.query.ordem)
  if (ordem === 'prioridade') {
    const todos = await prisma.fbkItem.findMany({ where, orderBy: { createdAt: 'asc' }, take: 2000 })
    todos.sort((a, b) => (ORD_PRIOR[a.prioridade] - ORD_PRIOR[b.prioridade]) || (a.createdAt.getTime() - b.createdAt.getTime()))
    return res.json({ items: todos.slice(skip, skip + take).map(viewTriagem), total: todos.length, page, pageSize })
  }
  const orderBy: any = ordem === 'votos' ? [{ votos: 'desc' }, { createdAt: 'desc' }] : { createdAt: 'desc' }
  const [rows, total] = await Promise.all([prisma.fbkItem.findMany({ where, orderBy, skip, take }), prisma.fbkItem.count({ where })])
  res.json({ items: rows.map(viewTriagem), total, page, pageSize })
}))

router.get('/exportar', requireRole(...TRIAGEM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rows = await prisma.fbkItem.findMany({ where: filtros(req), orderBy: { createdAt: 'desc' }, take: 10_000 })
  const out = rows.map((i) => ({ numero: i.numero, criadoEm: i.createdAt, tipo: i.tipo, categoria: i.categoria, prioridade: i.prioridade, status: i.status, titulo: i.titulo, descricao: i.descricao, rota: i.rota ?? '', perfil: i.perfil ?? '', versao: i.versaoApp ?? '', navegador: i.navegador ?? '', votos: i.votos, responsavel: i.responsavelNome ?? '', respondido: i.respondidoEm ?? '', resolvidoEm: i.resolvidoEm ?? '' }))
  await audit({ tenantId: getTenantId(req), userId: getUserId(req), modulo: MOD, acao: 'EXPORTADO', detalhes: { linhas: out.length } })
  if (qs(req.query.format) === 'csv') {
    const esc = (v: unknown) => { let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const cols = out.length ? Object.keys(out[0]) : ['numero']
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="feedback.csv"')
    return res.send('\ufeff' + [cols.join(';'), ...out.map((r) => cols.map((c) => esc((r as any)[c])).join(';'))].join('\n'))
  }
  res.json({ items: out, total: out.length })
}))

router.get('/responsaveis', requireRole(...TRIAGEM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const us = await prisma.user.findMany({ where: { tenantId: getTenantId(req), role: { in: ['ADMIN', 'OWNER', 'SUPPORT', 'RECTOR'] as any } }, select: { id: true, firstName: true, lastName: true }, take: 100 })
  res.json({ items: us.map((u) => ({ id: u.id, nome: [u.firstName, u.lastName].filter(Boolean).join(' ') })) })
}))

router.get('/painel', requireRole(...TRIAGEM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const todos = await prisma.fbkItem.findMany({ where: { tenantId }, take: 10_000 })
  const cnt = (k: string) => todos.reduce<Record<string, number>>((m, i: any) => { const v = i[k] ?? 'N/D'; m[v] = (m[v] ?? 0) + 1; return m }, {})
  const abertos = todos.filter((i) => ['NOVO', 'EM_TRIAGEM', 'PLANEJADO', 'EM_ANDAMENTO'].includes(i.status))
  const res_ = todos.filter((i) => i.resolvidoEm)
  const porRota: Record<string, number> = {}
  for (const i of todos.filter((x) => ['ERRO', 'BUG'].includes(x.tipo) && x.rota)) { const r = i.rota!.split('?')[0]; porRota[r] = (porRota[r] ?? 0) + 1 }
  res.json({
    total: todos.length, abertos: abertos.length, semResponsavel: abertos.filter((i) => !i.responsavelUserId).length, criticosAbertos: abertos.filter((i) => i.prioridade === 'CRITICA').length,
    porStatus: cnt('status'), porTipo: cnt('tipo'), porCategoria: cnt('categoria'), porPrioridade: cnt('prioridade'), porVersao: cnt('versaoApp'),
    telasComMaisErros: Object.entries(porRota).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([rota, total]) => ({ rota, total })),
    maisVotadas: todos.filter((i) => VOTAVEIS.includes(i.tipo) && !['RECUSADO', 'DUPLICADO'].includes(i.status)).sort((a, b) => b.votos - a.votos).slice(0, 5).map((i) => ({ id: i.id, numero: i.numero, titulo: i.titulo, votos: i.votos, status: i.status })),
    tempoMedioResolucaoDias: res_.length ? Math.round((res_.reduce((s, i) => s + (i.resolvidoEm!.getTime() - i.createdAt.getTime()) / 86_400_000, 0) / res_.length) * 10) / 10 : null,
    taxaResposta: todos.length ? Math.round((todos.filter((i) => i.respondidoEm).length / todos.length) * 1000) / 10 : null,
  })
}))

async function carregar(req: AuthenticatedRequest, res: Response) {
  const item = await prisma.fbkItem.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
  if (!item) { res.status(404).json({ error: 'Item não encontrado.' }); return null }
  return item
}

router.get('/itens/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const item = await carregar(req, res); if (!item) return
  const triagem = isTriagem(req)
  if (!triagem && item.autorUserId !== getUserId(req)) return res.status(404).json({ error: 'Item não encontrado.' })
  const [comentarios, anexos] = await Promise.all([
    prisma.fbkComentario.findMany({ where: { itemId: item.id, tenantId: item.tenantId, ...(triagem ? {} : { interno: false }) }, orderBy: { createdAt: 'asc' } }),
    prisma.fbkAnexo.findMany({ where: { itemId: item.id }, select: { id: true, nome: true, mime: true, tamanhoBytes: true, createdAt: true } }),
  ])
  if (triagem) await audit({ tenantId: item.tenantId, userId: getUserId(req), modulo: MOD, acao: 'TRIAGEM_VISUALIZOU', refType: 'FbkItem', refId: item.id })
  res.json({ ...(triagem ? viewTriagem(item) : viewAutor(item)), comentarios: comentarios.map((c) => ({ ...c, autorNome: triagem ? c.autorNome : 'Equipe EduMaster' })), anexos })
}))
router.get('/itens/:id/anexos/:anexoId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const item = await carregar(req, res); if (!item) return
  if (!isTriagem(req) && item.autorUserId !== getUserId(req)) return res.status(404).json({ error: 'Item não encontrado.' })
  const a = await prisma.fbkAnexo.findFirst({ where: { id: String(req.params.anexoId), itemId: item.id } })
  if (!a) return res.status(404).json({ error: 'Anexo não encontrado.' })
  const buf = Buffer.from(a.dataUrl.slice(a.dataUrl.indexOf(',') + 1), 'base64')
  res.setHeader('Content-Type', a.mime && /^image\/(png|jpe?g|webp|gif)$/.test(a.mime) ? a.mime : 'application/octet-stream')
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', "default-src 'none'")
  res.send(buf)
}))

router.patch('/itens/:id', requireRole(...TRIAGEM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const item = await carregar(req, res); if (!item) return
  const b = parseBody(z.object({ tipo: z.enum(TIPOS), categoria: z.enum(CATEGORIAS), prioridade: z.enum(PRIOR), responsavelUserId: z.string().nullable() }).partial(), req.body)
  const data: any = { ...b }
  if (b.responsavelUserId !== undefined) {
    if (b.responsavelUserId) { const n = await nomeCompleto(item.tenantId, b.responsavelUserId); if (!n) fail(400, 'Responsável não encontrado neste tenant.'); data.responsavelNome = n } else data.responsavelNome = null
  }
  if (item.status === 'NOVO' && Object.keys(b).length) data.status = 'EM_TRIAGEM'
  res.json(viewTriagem(await prisma.fbkItem.update({ where: { id: item.id }, data })))
}))

router.post('/itens/:id/status', requireRole(...TRIAGEM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const item = await carregar(req, res); if (!item) return
  const b = parseBody(z.object({ status: z.enum(STATUS), resposta: z.string().min(3).max(3000).optional() }), req.body)
  if (b.status === 'DUPLICADO') fail(400, 'Use /duplicado para marcar duplicidade.')
  if (!(TRANSICOES[item.status] ?? []).includes(b.status)) fail(409, `Transição inválida: ${item.status} -> ${b.status}.`)
  if (b.status === 'RECUSADO' && !(b.resposta || item.respostaAutor)) fail(400, 'Explique ao autor o motivo da recusa (resposta).')
  const agora = new Date()
  const upd = await prisma.fbkItem.update({
    where: { id: item.id },
    data: { status: b.status, resolvidoEm: b.status === 'RESOLVIDO' ? agora : null, ...(b.resposta ? { respostaAutor: sanitizarTexto(b.resposta, 3000), respondidoEm: agora, respondidoPorId: getUserId(req) } : {}), responsavelUserId: item.responsavelUserId ?? getUserId(req), responsavelNome: item.responsavelNome ?? (await nomeCompleto(item.tenantId, getUserId(req))) },
  })
  await notify({ tenantId: item.tenantId, userId: item.autorUserId, assunto: `Seu envio ${item.numero}: ${b.status.replace('_', ' ').toLowerCase()}`, mensagem: b.resposta ?? `O status mudou para ${b.status}.`, refType: 'FbkItem', refId: item.id, templateKey: 'feedback.status' }).catch(() => null)
  await audit({ tenantId: item.tenantId, userId: getUserId(req), modulo: MOD, acao: 'STATUS', refType: 'FbkItem', refId: item.id, detalhes: { de: item.status, para: b.status } })
  res.json(viewTriagem(upd))
}))

router.post('/itens/:id/responder', requireRole(...TRIAGEM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const item = await carregar(req, res); if (!item) return
  const b = parseBody(z.object({ resposta: z.string().min(3).max(3000) }), req.body)
  const upd = await prisma.fbkItem.update({ where: { id: item.id }, data: { respostaAutor: sanitizarTexto(b.resposta, 3000), respondidoEm: new Date(), respondidoPorId: getUserId(req), status: item.status === 'NOVO' ? 'EM_TRIAGEM' : item.status } })
  await notify({ tenantId: item.tenantId, userId: item.autorUserId, assunto: `Resposta ao seu envio ${item.numero}`, mensagem: b.resposta.slice(0, 500), refType: 'FbkItem', refId: item.id, templateKey: 'feedback.resposta' }).catch(() => null)
  res.json(viewTriagem(upd))
}))

router.post('/itens/:id/duplicado', requireRole(...TRIAGEM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const item = await carregar(req, res); if (!item) return
  const b = parseBody(z.object({ duplicadoDeId: z.string().uuid() }), req.body)
  if (b.duplicadoDeId === item.id) fail(400, 'Um item não pode duplicar a si mesmo.')
  const alvo = await prisma.fbkItem.findFirst({ where: { id: b.duplicadoDeId, tenantId: item.tenantId } })
  if (!alvo) fail(400, 'Item principal não encontrado.')
  if (alvo!.status === 'DUPLICADO') fail(409, 'O item principal também é um duplicado: aponte para o original.')
  if (!(TRANSICOES[item.status] ?? []).includes('DUPLICADO')) fail(409, `Transição inválida: ${item.status} -> DUPLICADO.`)
  // os votos do duplicado migram para o principal (sem repetir o mesmo usuário)
  const votos = await prisma.fbkVoto.findMany({ where: { itemId: item.id } })
  for (const v of votos) if (!(await prisma.fbkVoto.findFirst({ where: { itemId: alvo!.id, userId: v.userId } })) && v.userId !== alvo!.autorUserId) await prisma.fbkVoto.create({ data: { tenantId: item.tenantId, itemId: alvo!.id, userId: v.userId } })
  // o autor do duplicado também "apoia" o principal
  if (item.autorUserId !== alvo!.autorUserId && VOTAVEIS.includes(alvo!.tipo) && !(await prisma.fbkVoto.findFirst({ where: { itemId: alvo!.id, userId: item.autorUserId } }))) await prisma.fbkVoto.create({ data: { tenantId: item.tenantId, itemId: alvo!.id, userId: item.autorUserId } })
  await prisma.fbkItem.update({ where: { id: alvo!.id }, data: { votos: await prisma.fbkVoto.count({ where: { itemId: alvo!.id } }) } })
  const upd = await prisma.fbkItem.update({ where: { id: item.id }, data: { status: 'DUPLICADO', duplicadoDeId: alvo!.id, respostaAutor: `Já existe um registro igual (${alvo!.numero}). Acompanhe por ele.`, respondidoEm: new Date(), respondidoPorId: getUserId(req) } })
  await notify({ tenantId: item.tenantId, userId: item.autorUserId, assunto: `Seu envio ${item.numero} é duplicado`, mensagem: `Já existe o registro ${alvo!.numero} sobre o mesmo assunto; ele passa a representar seu pedido.`, refType: 'FbkItem', refId: item.id }).catch(() => null)
  res.json(viewTriagem(upd))
}))

router.post('/itens/:id/comentarios', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const item = await carregar(req, res); if (!item) return
  const triagem = isTriagem(req)
  if (!triagem && item.autorUserId !== getUserId(req)) return res.status(404).json({ error: 'Item não encontrado.' })
  const b = parseBody(z.object({ texto: z.string().min(1).max(3000), interno: z.boolean().default(true) }), req.body)
  const interno = triagem ? b.interno : false
  const c = await prisma.fbkComentario.create({ data: { tenantId: item.tenantId, itemId: item.id, userId: getUserId(req), autorNome: await nomeCompleto(item.tenantId, getUserId(req)), texto: sanitizarTexto(b.texto, 3000), interno } })
  if (!triagem) await avisarTriagem(item.tenantId, `Complemento em ${item.numero}`, 'O autor acrescentou informações.', item.id)
  else if (!interno) await notify({ tenantId: item.tenantId, userId: item.autorUserId, assunto: `Atualização em ${item.numero}`, mensagem: b.texto.slice(0, 300), refType: 'FbkItem', refId: item.id }).catch(() => null)
  res.status(201).json(c)
}))

// ---------------------------------------------------------------- integração com Atendimento
// Prefere a Central de Atendimento (modules/atendimento, protocolo ATD-…); se ela não estiver instalada, abre um chamado em Apoio (CHD-…).
// A importação é dinâmica para não criar dependência rígida entre módulos.
async function abrirNoAtendimento(item: any, userId: string): Promise<{ ref: string; id: string; modulo: 'atendimento' | 'apoio' }> {
  const tenantId = item.tenantId
  const prioridade = item.prioridade === 'CRITICA' ? 'URGENTE' : item.prioridade === 'ALTA' ? 'ALTA' : item.prioridade === 'BAIXA' ? 'BAIXA' : 'NORMAL'
  const descricao = `${item.descricao}\n\nOrigem: caixa de sugestões/bugs ${item.numero} (${item.tipo}). Tela: ${item.rota ?? 'n/d'}.`
  try {
    const caminho = '../atendimento/atendimentos'
    const mod: any = await import(caminho)
    if (typeof mod.criarAtendimento === 'function' && (prisma as any).atdAtendimento) {
      const autor = item.anonimo ? 'Usuário (anônimo)' : item.autorNome || 'Usuário'
      const a = await mod.criarAtendimento({ tenantId, canal: 'CHAT_PORTAL', assunto: `[${item.numero}] ${item.titulo}`.slice(0, 200), solicitanteNome: autor, prioridade, categoria: 'SISTEMA', origem: 'FEEDBACK', criadoPorId: userId, textoInicial: descricao, classificarIa: false, tags: ['feedback', item.tipo.toLowerCase()] })
      return { ref: a.numero, id: a.id, modulo: 'atendimento' }
    }
  } catch (e: any) { console.warn('[feedback] Atendimento indisponível, usando Apoio:', String(e?.message || e).slice(0, 120)) }
  const { numero } = await numeroAnual(tenantId, 'CHD')
  const sla: Record<string, number> = { URGENTE: 4, ALTA: 24, NORMAL: 72, BAIXA: 120 }
  const c = await prisma.apoChamado.create({
    data: { tenantId, numero, solicitanteUserId: item.autorUserId, categoria: 'TECNOLOGIA', prioridade, titulo: `[${item.numero}] ${item.titulo}`.slice(0, 200), descricao, slaHoras: sla[prioridade], prazoEm: new Date(Date.now() + sla[prioridade] * 3_600_000), responsavelRole: 'SUPPORT' },
  })
  return { ref: c.numero, id: c.id, modulo: 'apoio' }
}

router.post('/itens/:id/encaminhar-atendimento', requireRole(...TRIAGEM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const item = await carregar(req, res); if (!item) return
  if (item.atendimentoRef) fail(409, `Já encaminhado ao Atendimento (${item.atendimentoRef}).`)
  const r = await abrirNoAtendimento(item, getUserId(req))
  const upd = await prisma.fbkItem.update({ where: { id: item.id }, data: { atendimentoRef: r.ref, status: item.status === 'NOVO' ? 'EM_TRIAGEM' : item.status } })
  await audit({ tenantId: item.tenantId, userId: getUserId(req), modulo: MOD, acao: 'ENCAMINHADO_ATENDIMENTO', refType: 'FbkItem', refId: item.id, detalhes: { protocolo: r.ref, destino: r.modulo } })
  res.status(201).json({ ...viewTriagem(upd), chamadoId: r.id, atendimentoId: r.id, destino: r.modulo })
}))

// ---------------------------------------------------------------- retenção LGPD: logs/capturas de itens encerrados há > 180 dias
export async function jobFeedbackRetencao() {
  const limite = new Date(Date.now() - 180 * 86_400_000)
  const velhos = await prisma.fbkItem.findMany({ where: { status: { in: ['RESOLVIDO', 'RECUSADO', 'DUPLICADO'] }, updatedAt: { lt: limite }, OR: [{ logsConsole: { not: null } }] }, select: { id: true }, take: 2000 })
  const ids = velhos.map((v) => v.id)
  if (!ids.length) return { logsRemovidos: 0, capturasRemovidas: 0 }
  await prisma.fbkItem.updateMany({ where: { id: { in: ids } }, data: { logsConsole: null } })
  const c = await prisma.fbkAnexo.deleteMany({ where: { itemId: { in: ids } } })
  return { logsRemovidos: ids.length, capturasRemovidas: c.count }
}
registerEduJob('feedback.retencao', () => jobFeedbackRetencao())

router.use(academicErrorHandler)
export default router
