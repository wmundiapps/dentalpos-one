import crypto from 'crypto'
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { revahConfigured } from '../../services/revahBridge'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs, dateISO } from '../core/crud'
import { audit, notify } from '../core/notify'
import { camposObrigatorios, provedoresDoTipo, telegramSetWebhook, testarConexao } from './adapters'
import { despacharPendentes, despacharPorId, reenfileirar } from './dispatcher'
import { ATENDE, GESTAO_COM } from './roles'
import { gravarCfg, lerCfg, variaveisDoContato, webhookUrl } from './store'
import { CANAIS_ENVIO, extractVars, renderTemplate } from './pure'

const router = Router()
const TIPOS = ['WHATSAPP', 'TELEGRAM', 'EMAIL', 'SMS', 'VOZ', 'INSTAGRAM', 'FACEBOOK', 'SITE_CHAT'] as const

function publico(c: any) {
  const { cfg } = lerCfg(c)
  const { configCifrada, ...resto } = c
  return {
    ...resto,
    camposConfigurados: cfg ? Object.keys(cfg).filter((k) => cfg[k]) : [],
    camposObrigatorios: camposObrigatorios(c.tipo, c.provedor) ?? [],
    webhookUrl: webhookUrl(c.id),
  }
}

const canalSchema = z.object({
  tipo: z.enum(TIPOS),
  nome: z.string().min(2),
  provedor: z.string().min(2),
  ativo: z.boolean().optional(),
  config: z.record(z.string(), z.any()).optional(),
  limiteHora: z.number().int().min(1).max(100000).optional(),
  limiteDia: z.number().int().min(1).max(1000000).optional(),
  restringirHorario: z.boolean().optional(),
  delegarRevah: z.boolean().optional(),
})

function completarSegredos(tipo: string, provedor: string, cfg: Record<string, any>) {
  if (tipo === 'TELEGRAM' && !cfg.webhookSecret) cfg.webhookSecret = crypto.randomBytes(24).toString('hex')
  if (tipo === 'SITE_CHAT' && !cfg.chatKey) cfg.chatKey = crypto.randomBytes(18).toString('hex')
  if (['FACEBOOK', 'INSTAGRAM'].includes(tipo) || (tipo === 'WHATSAPP' && provedor === 'META_CLOUD')) if (!cfg.verifyToken) cfg.verifyToken = crypto.randomBytes(16).toString('hex')
  return cfg
}

router.get('/canais/provedores', requireRole(...ATENDE), (_req, res) => {
  res.json(TIPOS.map((t) => ({ tipo: t, provedores: provedoresDoTipo(t).map((p) => ({ provedor: p, campos: camposObrigatorios(t, p) })) })))
})

router.get(
  '/canais',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rows = await prisma.comCanal.findMany({ where: { tenantId: getTenantId(req) }, orderBy: [{ tipo: 'asc' }, { nome: 'asc' }] })
    res.json({ items: rows.map(publico), total: rows.length })
  }),
)

router.post(
  '/canais',
  requireRole(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(canalSchema, req.body)
    if (!provedoresDoTipo(b.tipo).includes(b.provedor)) return res.status(400).json({ error: `Provedor "${b.provedor}" inválido para ${b.tipo}. Use: ${provedoresDoTipo(b.tipo).join(', ')}.` })
    const cfg = completarSegredos(b.tipo, b.provedor, { ...(b.config ?? {}) })
    let g: ReturnType<typeof gravarCfg>
    try {
      g = gravarCfg(b.tipo, b.provedor, cfg)
    } catch (e: any) {
      return res.status(503).json({ error: `Cofre de segredos indisponível: ${e.message}` })
    }
    const row = await prisma.comCanal.create({
      data: { tenantId, tipo: b.tipo, nome: b.nome, provedor: b.provedor, ativo: b.ativo ?? true, configCifrada: g.configCifrada, configurado: g.configurado, limiteHora: b.limiteHora ?? 300, limiteDia: b.limiteDia ?? 2000, restringirHorario: b.restringirHorario ?? false, delegarRevah: b.delegarRevah ?? false },
    })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'CANAL_CRIADO', refType: 'ComCanal', refId: row.id })
    res.status(201).json({ ...publico(row), faltam: g.faltam })
  }),
)

router.patch(
  '/canais/:id',
  requireRole(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const atual = await prisma.comCanal.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!atual) return res.status(404).json({ error: 'Canal não encontrado.' })
    const b = parseBody(canalSchema.partial(), req.body)
    const data: any = {}
    for (const k of ['nome', 'ativo', 'limiteHora', 'limiteDia', 'restringirHorario', 'delegarRevah'] as const) if (b[k] !== undefined) data[k] = b[k]
    if (b.config) {
      const { cfg } = lerCfg(atual)
      const novo = { ...(cfg ?? {}) }
      for (const [k, v] of Object.entries(b.config)) if (v !== '' && v !== null && v !== undefined) novo[k] = v
      completarSegredos(atual.tipo, atual.provedor, novo)
      const g = gravarCfg(atual.tipo, atual.provedor, novo)
      data.configCifrada = g.configCifrada
      data.configurado = g.configurado
      data.ultimoTesteOk = null
    }
    const row = await prisma.comCanal.update({ where: { id: atual.id }, data })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'CANAL_ATUALIZADO', refType: 'ComCanal', refId: row.id, detalhes: { campos: Object.keys(b) } })
    res.json(publico(row))
  }),
)

router.delete(
  '/canais/:id',
  requireRole(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.comCanal.deleteMany({ where: { id: String(req.params.id), tenantId } })
    if (!r.count) return res.status(404).json({ error: 'Canal não encontrado.' })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'CANAL_REMOVIDO', refType: 'ComCanal', refId: String(req.params.id) })
    res.status(204).end()
  }),
)

router.post(
  '/canais/:id/testar',
  requireRole(...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.comCanal.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Canal não encontrado.' })
    const { cfg, erro } = lerCfg(c)
    if (!cfg) return res.json({ ok: false, mensagem: erro ?? 'Canal sem credenciais: não configurado.' })
    const r = await testarConexao(c.tipo, c.provedor, cfg)
    await prisma.comCanal.update({ where: { id: c.id }, data: { ultimoTesteEm: new Date(), ultimoTesteOk: r.ok, ultimoTesteMsg: r.mensagem } })
    res.json(r)
  }),
)

// Registra o webhook do Telegram apontando para este backend.
router.post(
  '/canais/:id/telegram/webhook',
  requireRole(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.comCanal.findFirst({ where: { id: String(req.params.id), tenantId, tipo: 'TELEGRAM' } })
    if (!c) return res.status(404).json({ error: 'Canal Telegram não encontrado.' })
    const { cfg } = lerCfg(c)
    if (!cfg?.botToken) return res.status(409).json({ error: 'Canal sem botToken.' })
    res.json(await telegramSetWebhook(cfg.botToken, webhookUrl(c.id), cfg.webhookSecret))
  }),
)

// Dados para configurar webhooks no painel do provedor (inclui verifyToken da Meta).
router.get(
  '/canais/:id/webhook-info',
  requireRole(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await prisma.comCanal.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!c) return res.status(404).json({ error: 'Canal não encontrado.' })
    const { cfg } = lerCfg(c)
    res.json({
      urlMensagens: webhookUrl(c.id),
      urlStatus: webhookUrl(c.id, '/status'),
      urlUraVoz: c.tipo === 'VOZ' ? webhookUrl(c.id, '/voz/ura') : undefined,
      verifyToken: cfg?.verifyToken,
      chaveSiteChat: c.tipo === 'SITE_CHAT' ? cfg?.chatKey : undefined,
      urlSiteChat: c.tipo === 'SITE_CHAT' ? `${webhookUrl(c.id).replace('/webhook/', '/sitechat/')}` : undefined,
      observacao: 'Cada provedor exige assinatura válida: Telegram (secret_token), Meta (X-Hub-Signature-256 com appSecret), Twilio (X-Twilio-Signature com authToken), Resend (Svix com webhookSecret). Sem o segredo configurado o webhook é rejeitado.',
    })
  }),
)

// Integração REVAH: quando ativa, é possível delegar o despacho de um canal (delegarRevah).
router.get(
  '/revah/status',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const delegados = await prisma.comCanal.findMany({ where: { tenantId: getTenantId(req), delegarRevah: true }, select: { id: true, tipo: true, nome: true } })
    res.json({
      revahConfigurado: revahConfigured(),
      canaisDelegados: delegados,
      orientacao: revahConfigured()
        ? 'REVAH ativo no ambiente. Para NÃO duplicar envio próprio, marque delegarRevah=true no canal: o despachante deste módulo deixa de enviar por ele e as mensagens permanecem PENDENTES na caixa de saída para o REVAH consumir.'
        : 'REVAH não configurado (REVAH_API_URL/REVAH_SHARED_SECRET). O envio é feito pelos adapters próprios deste módulo.',
    })
  }),
)

// ---------------------------------------------------------------- caixa de saída / despacho
router.post(
  '/despacho/executar',
  requireRole(...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await despacharPendentes({ tenantId: getTenantId(req), limit: Math.min(500, Number(req.body?.limit) || 200) }))
  }),
)

router.get(
  '/outbox',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId, canal: qs(req.query.canal) ?? { not: 'IN_APP' } }
    const status = qs(req.query.status)
    if (status) where.status = status
    if (qs(req.query.studentId)) where.studentId = qs(req.query.studentId)
    if (qs(req.query.refType)) where.refType = qs(req.query.refType)
    const [items, total] = await Promise.all([prisma.eduNotification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.eduNotification.count({ where })])
    res.json({ items, total, page, pageSize })
  }),
)

router.get(
  '/outbox/resumo',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const g = await prisma.eduNotification.groupBy({ by: ['canal', 'status'], where: { tenantId: getTenantId(req), canal: { not: 'IN_APP' }, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: { _all: true } })
    res.json(g.map((x) => ({ canal: x.canal, status: x.status, total: x._count._all })))
  }),
)

const enfileirarSchema = z.object({
  canal: z.enum(CANAIS_ENVIO),
  destino: z.string().optional(),
  contatoId: z.string().optional(),
  studentId: z.string().optional(),
  assunto: z.string().optional(),
  mensagem: z.string().min(1).optional(),
  templateId: z.string().optional(),
  variaveis: z.record(z.string(), z.string()).optional(),
  agendadoPara: dateISO().optional(),
  enviarAgora: z.boolean().optional(),
})
router.post(
  '/outbox',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(enfileirarSchema, req.body)
    let studentId = b.studentId
    let destino = b.destino
    let nome: string | undefined
    if (b.contatoId) {
      const c = await prisma.comContato.findFirst({ where: { id: b.contatoId, tenantId } })
      if (!c) return res.status(404).json({ error: 'Contato não encontrado.' })
      studentId = studentId ?? c.studentId ?? undefined
      nome = c.nome
      if (!destino) destino = (b.canal === 'EMAIL' ? c.email : b.canal === 'TELEGRAM' ? c.telegramChatId : c.telefone) ?? undefined
    }
    let mensagem = b.mensagem
    let assunto = b.assunto
    let templateKey: string | undefined
    if (b.templateId) {
      const t = await prisma.comTemplate.findFirst({ where: { id: b.templateId, tenantId, ativo: true } })
      if (!t) return res.status(404).json({ error: 'Template não encontrado.' })
      const vars = { ...(await variaveisDoContato(tenantId, { nome, studentId })), ...(b.variaveis ?? {}) }
      const r = renderTemplate(t.corpo, vars)
      if (r.faltantes.length) return res.status(400).json({ error: `Variáveis sem valor: ${r.faltantes.join(', ')}.`, faltantes: r.faltantes })
      mensagem = r.texto
      assunto = assunto ?? (t.assunto ? renderTemplate(t.assunto, vars).texto : undefined)
      templateKey = t.chave
    }
    if (!mensagem) return res.status(400).json({ error: 'Informe mensagem ou templateId.' })
    if (!destino && !studentId) return res.status(400).json({ error: 'Informe destino, contatoId ou studentId.' })
    const n = await notify({ tenantId, canal: b.canal, destino, studentId, assunto, mensagem, templateKey, agendadoPara: b.agendadoPara })
    if (b.enviarAgora && !b.agendadoPara) return res.status(201).json(await despacharPorId(tenantId, n.id))
    res.status(201).json(n)
  }),
)

router.post(
  '/outbox/:id/reenviar',
  requireRole(...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const n = await reenfileirar(getTenantId(req), String(req.params.id))
    if (!n) return res.status(409).json({ error: 'Somente notificações em FALHA/CANCELADA podem ser reenviadas.' })
    res.json({ ok: true })
  }),
)
router.post(
  '/outbox/:id/cancelar',
  requireRole(...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.eduNotification.updateMany({ where: { id: String(req.params.id), tenantId: getTenantId(req), status: 'PENDENTE' }, data: { status: 'CANCELADA', erro: 'Cancelada manualmente.' } })
    if (!r.count) return res.status(409).json({ error: 'Somente pendentes podem ser canceladas.' })
    res.json({ ok: true })
  }),
)

export { extractVars }
export default router
