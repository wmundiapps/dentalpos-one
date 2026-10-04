import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { encryptSecret } from '../../services/secretVault'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { ocultarComentarioGraph, responderComentarioGraph } from './adapters'
import { APROVADORES, ATENDE, MARKETING } from './roles'
import { podeTransicionarPost, triarTexto, validarPostParaRede } from './pure'
import { publicarPost, sincronizarConta, tokenDaConta } from './social'

const router = Router()
const REDES = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'YOUTUBE', 'X'] as const
const ESCREVE = [...MARKETING, 'SUPPORT' as const]

// ---------------------------------------------------------------- contas
const contaSchema = z.object({ rede: z.enum(REDES), nome: z.string().min(2), handle: z.string().optional(), externalId: z.string().optional(), accessToken: z.string().min(10).optional(), ativa: z.boolean().optional() })
const contaPublica = (c: any) => {
  const { tokenCifrado, ...r } = c
  return { ...r, tokenConfigurado: !!tokenCifrado, publicacaoAutomatica: !!tokenCifrado && !!c.externalId && ['FACEBOOK', 'INSTAGRAM'].includes(c.rede) }
}

router.get(
  '/social/contas',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json((await prisma.comSocialConta.findMany({ where: { tenantId: getTenantId(req) }, orderBy: { rede: 'asc' } })).map(contaPublica))
  }),
)
router.post(
  '/social/contas',
  requireRole(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { accessToken, ...b } = parseBody(contaSchema, req.body)
    let tokenCifrado: string | undefined
    try {
      if (accessToken) tokenCifrado = encryptSecret({ accessToken })
    } catch (e: any) {
      return res.status(503).json({ error: `Cofre de segredos indisponível: ${e.message}` })
    }
    const c = await prisma.comSocialConta.create({ data: { ...b, tenantId, tokenCifrado } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'CONTA_SOCIAL_CRIADA', refType: 'ComSocialConta', refId: c.id })
    res.status(201).json(contaPublica(c))
  }),
)
router.patch(
  '/social/contas/:id',
  requireRole(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.comSocialConta.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Conta não encontrada.' })
    const { accessToken, ...b } = parseBody(contaSchema.partial(), req.body)
    const data: any = { ...b }
    if (accessToken) data.tokenCifrado = encryptSecret({ accessToken })
    res.json(contaPublica(await prisma.comSocialConta.update({ where: { id: c.id }, data })))
  }),
)
router.delete(
  '/social/contas/:id',
  requireRole(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.comSocialConta.deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!r.count) return res.status(404).json({ error: 'Conta não encontrada.' })
    res.status(204).end()
  }),
)
router.post(
  '/social/contas/:id/sincronizar',
  requireRole(...ESCREVE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await sincronizarConta(getTenantId(req), String(req.params.id)))),
)

// ---------------------------------------------------------------- posts (workflow de aprovação)
const postSchema = z.object({ contaId: z.string(), titulo: z.string().min(3), texto: z.string().min(1), midiaUrls: z.array(z.string().url()).optional(), tema: z.string().optional(), agendadoPara: dateISO().nullable().optional() })

router.get(
  '/social/posts',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['status', 'contaId', 'tema']) if (qs((req.query as any)[k])) where[k] = qs((req.query as any)[k])
    const [items, total] = await Promise.all([prisma.comSocialPost.findMany({ where, orderBy: [{ agendadoPara: 'desc' }, { createdAt: 'desc' }], skip, take, include: { conta: { select: { rede: true, nome: true } } } }), prisma.comSocialPost.count({ where })])
    res.json({ items, total, page, pageSize })
  }),
)

// Calendário editorial: posts por dia no intervalo (?de=&ate=, padrão = mês corrente).
router.get(
  '/social/calendario',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const agora = new Date()
    const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : new Date(agora.getFullYear(), agora.getMonth(), 1)
    const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59)
    const posts = await prisma.comSocialPost.findMany({ where: { tenantId, status: { not: 'CANCELADO' }, agendadoPara: { gte: de, lte: ate } }, include: { conta: { select: { rede: true, nome: true } } }, orderBy: { agendadoPara: 'asc' } })
    const dias: Record<string, any[]> = {}
    for (const p of posts) {
      const k = p.agendadoPara!.toISOString().slice(0, 10)
      ;(dias[k] ??= []).push({ id: p.id, titulo: p.titulo, rede: p.conta.rede, conta: p.conta.nome, status: p.status, hora: p.agendadoPara })
    }
    res.json({ de, ate, total: posts.length, dias })
  }),
)

router.post(
  '/social/posts',
  requireRole(...ESCREVE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(postSchema, req.body)
    const conta = await prisma.comSocialConta.findFirst({ where: { id: b.contaId, tenantId, ativa: true } })
    if (!conta) return res.status(404).json({ error: 'Conta social não encontrada/ativa.' })
    const p = await prisma.comSocialPost.create({ data: { ...b, tenantId, midiaUrls: b.midiaUrls ?? [], criadoPorId: getUserId(req) } })
    res.status(201).json({ ...p, avisos: validarPostParaRede(conta.rede, b.texto, b.midiaUrls ?? []) })
  }),
)

router.patch(
  '/social/posts/:id',
  requireRole(...ESCREVE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await prisma.comSocialPost.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) return res.status(404).json({ error: 'Post não encontrado.' })
    if (!['RASCUNHO', 'REJEITADO'].includes(p.status)) return res.status(409).json({ error: 'Só é possível editar posts em rascunho ou rejeitados (para reeditar um post em aprovação/aprovado, devolva-o a rascunho).' })
    const { contaId: _c, ...b } = parseBody(postSchema.partial(), req.body)
    res.json(await prisma.comSocialPost.update({ where: { id: p.id }, data: b }))
  }),
)

async function mudarStatus(req: AuthenticatedRequest, res: Response, para: string, extra: (p: any, userId: string) => Promise<Record<string, unknown>> | Record<string, unknown> = () => ({})) {
  const tenantId = getTenantId(req)
  const p = await prisma.comSocialPost.findFirst({ where: { id: String(req.params.id), tenantId }, include: { conta: true } })
  if (!p) return res.status(404).json({ error: 'Post não encontrado.' })
  if (!podeTransicionarPost(p.status, para)) return res.status(409).json({ error: `Transição inválida: ${p.status} -> ${para}.` })
  const userId = getUserId(req)
  const r = await prisma.comSocialPost.update({ where: { id: p.id }, data: { status: para as any, ...(await extra(p, userId)) } })
  await audit({ tenantId, userId, modulo: 'comunicacao', acao: `POST_${para}`, refType: 'ComSocialPost', refId: p.id })
  res.json(r)
}

router.post(
  '/social/posts/:id/enviar-aprovacao',
  requireRole(...ESCREVE),
  asyncHandler(async (req, res) =>
    mudarStatus(req as AuthenticatedRequest, res, 'EM_APROVACAO', async (p) => {
      const erros = validarPostParaRede(p.conta.rede, p.texto, p.midiaUrls)
      if (erros.length) throw Object.assign(new Error(erros.join(' ')), { status: 400 })
      await scheduleReminder({ tenantId: p.tenantId, modulo: 'comunicacao', titulo: `Aprovar post: ${p.titulo}`, dueAt: p.agendadoPara ?? new Date(Date.now() + 2 * 86_400_000), antecedenciaDias: 1, refType: 'ComSocialPost', refId: p.id, assigneeRole: 'COORDINATOR', severity: 'INFO', dedupeKey: `com-aprov-${p.id}` })
      return { motivoRejeicao: null }
    }),
  ),
)
router.post(
  '/social/posts/:id/aprovar',
  requireRole(...APROVADORES),
  asyncHandler(async (req, res) =>
    mudarStatus(req as AuthenticatedRequest, res, 'APROVADO', async (p, userId) => {
      const role = String((req as AuthenticatedRequest).user?.role)
      if (p.criadoPorId === userId && !['ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(role)) throw Object.assign(new Error('Quem criou o post não pode aprová-lo (segregação de funções).'), { status: 403 })
      await completeReminders({ tenantId: p.tenantId, refType: 'ComSocialPost', refId: p.id, userId })
      return { aprovadoPorId: userId, aprovadoEm: new Date(), agendadoPara: p.agendadoPara ?? new Date() }
    }),
  ),
)
router.post(
  '/social/posts/:id/rejeitar',
  requireRole(...APROVADORES),
  asyncHandler(async (req, res) => {
    const { motivo } = parseBody(z.object({ motivo: z.string().min(3) }), req.body)
    return mudarStatus(req as AuthenticatedRequest, res, 'REJEITADO', () => ({ motivoRejeicao: motivo, aprovadoPorId: null }))
  }),
)
router.post('/social/posts/:id/devolver-rascunho', requireRole(...ESCREVE), asyncHandler(async (req, res) => mudarStatus(req as AuthenticatedRequest, res, 'RASCUNHO')))
router.post('/social/posts/:id/cancelar', requireRole(...ESCREVE), asyncHandler(async (req, res) => mudarStatus(req as AuthenticatedRequest, res, 'CANCELADO')))

router.post(
  '/social/posts/:id/publicar',
  requireRole(...APROVADORES),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await publicarPost(getTenantId(req), String(req.params.id)))),
)
router.post(
  '/social/posts/:id/marcar-publicado',
  requireRole(...ESCREVE),
  asyncHandler(async (req, res) => {
    const b = parseBody(z.object({ url: z.string().url().optional(), publicadoEm: dateISO().optional() }), req.body)
    return mudarStatus(req as AuthenticatedRequest, res, 'PUBLICADO', async (p) => {
      await completeReminders({ tenantId: p.tenantId, refType: 'ComSocialPost', refId: p.id })
      return { publicadoEm: b.publicadoEm ?? new Date(), urlPublicado: b.url, erro: null }
    })
  }),
)

// ---------------------------------------------------------------- métricas
const metricaSchema = z.object({ contaId: z.string(), postId: z.string().optional(), data: dateISO().optional(), alcance: z.number().int().min(0).default(0), impressoes: z.number().int().min(0).default(0), curtidas: z.number().int().min(0).default(0), comentarios: z.number().int().min(0).default(0), compartilhamentos: z.number().int().min(0).default(0), cliques: z.number().int().min(0).default(0), seguidores: z.number().int().min(0).optional() })
router.post(
  '/social/metricas',
  requireRole(...ESCREVE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(metricaSchema, req.body)
    const conta = await prisma.comSocialConta.findFirst({ where: { id: b.contaId, tenantId } })
    if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' })
    if (b.postId && !(await prisma.comSocialPost.findFirst({ where: { id: b.postId, tenantId, contaId: conta.id } }))) return res.status(404).json({ error: 'Post não encontrado nesta conta.' })
    if (b.seguidores !== undefined) await prisma.comSocialConta.update({ where: { id: conta.id }, data: { seguidores: b.seguidores } })
    res.status(201).json(await prisma.comSocialMetrica.create({ data: { ...b, tenantId, origem: 'MANUAL' } }))
  }),
)
router.get(
  '/social/metricas',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId }
    if (qs(req.query.contaId)) where.contaId = qs(req.query.contaId)
    if (qs(req.query.postId)) where.postId = qs(req.query.postId)
    if (qs(req.query.de) || qs(req.query.ate)) where.data = { ...(qs(req.query.de) ? { gte: new Date(qs(req.query.de)!) } : {}), ...(qs(req.query.ate) ? { lte: new Date(qs(req.query.ate)!) } : {}) }
    const itens = await prisma.comSocialMetrica.findMany({ where, orderBy: { data: 'desc' }, take: 500 })
    const soma = itens.reduce((a, m) => ({ alcance: a.alcance + m.alcance, impressoes: a.impressoes + m.impressoes, curtidas: a.curtidas + m.curtidas, comentarios: a.comentarios + m.comentarios, compartilhamentos: a.compartilhamentos + m.compartilhamentos, cliques: a.cliques + m.cliques }), { alcance: 0, impressoes: 0, curtidas: 0, comentarios: 0, compartilhamentos: 0, cliques: 0 })
    const interacoes = soma.curtidas + soma.comentarios + soma.compartilhamentos
    res.json({ itens, soma, taxaEngajamentoPct: soma.alcance ? Math.round((interacoes / soma.alcance) * 10000) / 100 : null })
  }),
)

// ---------------------------------------------------------------- moderação
router.get(
  '/social/interacoes',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId, status: qs(req.query.status) ?? 'PENDENTE' }
    if (qs(req.query.contaId)) where.contaId = qs(req.query.contaId)
    if (qs(req.query.alerta) === 'true') where.alerta = { not: null }
    const [items, total] = await Promise.all([prisma.comSocialInteracao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.comSocialInteracao.count({ where })])
    res.json({ items, total, page, pageSize })
  }),
)
router.post(
  '/social/interacoes',
  requireRole(...ESCREVE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ contaId: z.string(), postId: z.string().optional(), tipo: z.enum(['COMENTARIO', 'DM', 'MENCAO']), autor: z.string().optional(), texto: z.string().min(1), externalId: z.string().optional() }), req.body)
    if (!(await prisma.comSocialConta.findFirst({ where: { id: b.contaId, tenantId } }))) return res.status(404).json({ error: 'Conta não encontrada.' })
    const tri = triarTexto(b.texto)
    res.status(201).json(await prisma.comSocialInteracao.create({ data: { ...b, tenantId, status: tri.spam ? 'SPAM' : 'PENDENTE', alerta: tri.alerta ?? (tri.spam ? 'spam' : undefined) } }))
  }),
)
router.post(
  '/social/interacoes/:id/moderar',
  requireRole(...ESCREVE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const i = await prisma.comSocialInteracao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!i) return res.status(404).json({ error: 'Interação não encontrada.' })
    const b = parseBody(z.object({ acao: z.enum(['APROVAR', 'OCULTAR', 'SPAM', 'RESPONDER']), resposta: z.string().min(1).optional() }), req.body)
    if (b.acao === 'RESPONDER' && !b.resposta) return res.status(400).json({ error: 'Informe a resposta.' })
    const conta = await prisma.comSocialConta.findFirst({ where: { id: i.contaId, tenantId } })
    const token = conta ? tokenDaConta(conta) : null
    let remoto: string | null = null
    if (token && conta && ['FACEBOOK', 'INSTAGRAM'].includes(conta.rede) && i.externalId && i.tipo === 'COMENTARIO') {
      if (b.acao === 'OCULTAR' || b.acao === 'SPAM') {
        const r = await ocultarComentarioGraph(conta.rede, i.externalId, token, true)
        remoto = r.ok ? 'Comentário ocultado na rede.' : `Falha ao ocultar na rede: ${r.erro}`
      } else if (b.acao === 'RESPONDER') {
        const r = await responderComentarioGraph(conta.rede, i.externalId, token, b.resposta!)
        if (!r.ok) return res.status(502).json({ error: `Resposta não publicada na rede: ${r.erro}` })
        remoto = 'Resposta publicada na rede.'
      }
    } else if (b.acao !== 'APROVAR') remoto = 'Sem token/API para esta rede: ação registrada apenas internamente (execute manualmente na plataforma).'
    const status = b.acao === 'APROVAR' ? 'APROVADO' : b.acao === 'OCULTAR' ? 'OCULTO' : b.acao === 'SPAM' ? 'SPAM' : 'RESPONDIDO'
    const r = await prisma.comSocialInteracao.update({ where: { id: i.id }, data: { status, moderadoPorId: getUserId(req), ...(b.acao === 'RESPONDER' ? { resposta: b.resposta, respondidoEm: new Date() } : {}) } })
    await completeReminders({ tenantId, refType: 'ComSocialInteracao', refId: i.externalId ?? i.id })
    res.json({ ...r, remoto })
  }),
)

export default router
