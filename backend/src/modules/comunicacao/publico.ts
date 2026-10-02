import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { asyncHandler } from '../academico/middleware'
import {
  Cfg, InboundMsg, parseResend, parseTelegram, parseTwilioInbound, parseTwilioStatus, parseWhatsAppMeta, parseMetaMessaging,
} from './adapters'
import { aplicarStatusProvedor } from './dispatcher'
import { processarInbound } from './inbox'
import { URA_PADRAO } from './rotas-voz'
import { getConfig, lerCfg, publicBase } from './store'
import { normalizePhone, safeEqual, twimlResposta, twimlUra, UraMenu, verifyMeta, verifySvix, verifyTelegram, verifyTwilio } from './pure'

// Webhooks PÚBLICOS (sem login). Segurança: o canalId identifica o tenant e TODA requisição
// precisa de assinatura/segredo válidos do provedor; sem segredo configurado o canal rejeita.
export const publicRouter = Router()

const XML = 'text/xml; charset=utf-8'

async function carregarCanal(req: Request, res: Response) {
  const canal = await prisma.comCanal.findFirst({ where: { id: String(req.params.canalId) } })
  if (!canal || !canal.ativo) {
    res.status(404).json({ error: 'Canal não encontrado.' })
    return null
  }
  const { cfg } = lerCfg(canal)
  if (!cfg) {
    res.status(503).json({ error: 'Canal sem credenciais.' })
    return null
  }
  return { canal, cfg }
}

async function log(canal: { id: string; tenantId: string }, tipo: string, ok: boolean, motivo?: string) {
  await prisma.comWebhookLog.create({ data: { canalId: canal.id, tenantId: canal.tenantId, tipo, ok, motivo } }).catch(() => undefined)
}

function candidatosUrl(req: Request, cfg: Cfg): string[] {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0]
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0]
  const path = req.originalUrl
  const urls = [`${proto}://${host}${path}`, `${publicBase()}${path}`]
  if (cfg.urlPublica) urls.push(`${String(cfg.urlPublica).replace(/\/$/, '')}${path}`)
  return [...new Set(urls)]
}
function twilioOk(req: Request, cfg: Cfg) {
  const sig = String(req.headers['x-twilio-signature'] || '')
  return candidatosUrl(req, cfg).some((u) => verifyTwilio(cfg.authToken, u, (req.body ?? {}) as any, sig))
}
const raw = (req: Request) => (req as any).rawBody as Buffer | undefined

// Verificação de webhook da Meta (WhatsApp Cloud / Messenger / Instagram).
publicRouter.get(
  '/webhook/:canalId',
  asyncHandler(async (req, res) => {
    const c = await carregarCanal(req, res)
    if (!c) return
    const { 'hub.mode': mode, 'hub.verify_token': tok, 'hub.challenge': challenge } = req.query as Record<string, string>
    if (mode === 'subscribe' && c.cfg.verifyToken && tok && safeEqual(String(tok), String(c.cfg.verifyToken))) return void res.status(200).send(String(challenge))
    res.status(403).json({ error: 'Verificação recusada.' })
  }),
)

publicRouter.post(
  '/webhook/:canalId',
  asyncHandler(async (req, res) => {
    const c = await carregarCanal(req, res)
    if (!c) return
    const { canal, cfg } = c
    const tipo = canal.tipo
    const rejeitar = async (motivo: string) => {
      await log(canal, tipo, false, motivo)
      res.status(401).json({ error: 'Assinatura inválida.' })
    }
    const processar = async (msgs: InboundMsg[]) => {
      for (const m of msgs) await processarInbound({ tenantId: canal.tenantId, canalTipo: tipo, canalId: canal.id, msg: m })
    }

    if (tipo === 'TELEGRAM') {
      if (!verifyTelegram(cfg.webhookSecret, String(req.headers['x-telegram-bot-api-secret-token'] || ''))) return rejeitar('secret_token do Telegram inválido')
      const m = parseTelegram(req.body)
      if (m) await processar([m])
      await log(canal, tipo, true)
      return void res.json({ ok: true })
    }
    if (tipo === 'WHATSAPP' && canal.provedor === 'META_CLOUD') {
      if (!verifyMeta(cfg.appSecret, raw(req), String(req.headers['x-hub-signature-256'] || ''))) return rejeitar('X-Hub-Signature-256 inválida (ou appSecret não configurado)')
      const { mensagens, status } = parseWhatsAppMeta(req.body)
      await processar(mensagens)
      for (const s of status) await aplicarStatusProvedor(canal.tenantId, s.provedorId, s.status, s.erro)
      await log(canal, tipo, true)
      return void res.json({ ok: true })
    }
    if (canal.provedor === 'TWILIO' && (tipo === 'WHATSAPP' || tipo === 'SMS')) {
      if (!twilioOk(req, cfg)) return rejeitar('X-Twilio-Signature inválida')
      const m = parseTwilioInbound(req.body ?? {})
      if (m) await processar([m])
      await log(canal, tipo, true)
      return void res.type(XML).send('<?xml version="1.0" encoding="UTF-8"?><Response/>')
    }
    if (tipo === 'FACEBOOK' || tipo === 'INSTAGRAM') {
      if (!verifyMeta(cfg.appSecret, raw(req), String(req.headers['x-hub-signature-256'] || ''))) return rejeitar('X-Hub-Signature-256 inválida (ou appSecret não configurado)')
      await processar(parseMetaMessaging(req.body))
      await log(canal, tipo, true)
      return void res.json({ ok: true })
    }
    if (tipo === 'EMAIL') {
      const h = req.headers
      if (!verifySvix(cfg.webhookSecret, raw(req), { id: String(h['svix-id'] || ''), timestamp: String(h['svix-timestamp'] || ''), signature: String(h['svix-signature'] || '') })) return rejeitar('assinatura Svix/Resend inválida (ou webhookSecret não configurado)')
      const r = parseResend(req.body)
      if (r.mensagem) await processar([r.mensagem])
      if (r.status) await aplicarStatusProvedor(canal.tenantId, r.status.provedorId, r.status.status, r.status.erro)
      await log(canal, tipo, true)
      return void res.json({ ok: true })
    }
    await log(canal, tipo, false, 'canal não aceita webhook de mensagens')
    res.status(400).json({ error: 'Este canal não recebe mensagens por webhook.' })
  }),
)

// Callbacks de status de entrega (Twilio).
publicRouter.post(
  '/webhook/:canalId/status',
  asyncHandler(async (req, res) => {
    const c = await carregarCanal(req, res)
    if (!c) return
    if (c.canal.provedor !== 'TWILIO') return void res.status(400).json({ error: 'Somente Twilio usa este endpoint.' })
    if (!twilioOk(req, c.cfg)) {
      await log(c.canal, c.canal.tipo, false, 'X-Twilio-Signature inválida (status)')
      return void res.status(401).json({ error: 'Assinatura inválida.' })
    }
    const s = parseTwilioStatus(req.body ?? {})
    if (s) await aplicarStatusProvedor(c.canal.tenantId, s.provedorId, s.status, s.erro)
    res.type(XML).send('<?xml version="1.0" encoding="UTF-8"?><Response/>')
  }),
)

// ---------------------------------------------------------------- voz (Twilio)
async function uraDoTenant(tenantId: string): Promise<UraMenu> {
  const cfg = await getConfig(tenantId)
  return (cfg.uraMenu as unknown as UraMenu) ?? URA_PADRAO
}
async function voz(req: Request, res: Response) {
  const c = await carregarCanal(req, res)
  if (!c) return null
  if (c.canal.tipo !== 'VOZ' || c.canal.provedor !== 'TWILIO' || !twilioOk(req, c.cfg)) {
    await log(c.canal, 'VOZ', false, 'assinatura Twilio inválida / canal não é de voz')
    res.status(401).type(XML).send('<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>')
    return null
  }
  return c
}

publicRouter.post(
  '/webhook/:canalId/voz/ura',
  asyncHandler(async (req, res) => {
    const c = await voz(req, res)
    if (!c) return
    const b = req.body ?? {}
    const contato = b.From ? await prisma.comContato.findFirst({ where: { tenantId: c.canal.tenantId, telefone: normalizePhone(String(b.From)) ?? '__none__' }, select: { id: true } }) : null
    const existe = b.CallSid ? await prisma.comChamada.findFirst({ where: { tenantId: c.canal.tenantId, provedorSid: String(b.CallSid) } }) : null
    if (!existe) await prisma.comChamada.create({ data: { tenantId: c.canal.tenantId, canalId: c.canal.id, direcao: 'ENTRADA', de: b.From, para: b.To, provedorSid: b.CallSid, status: 'EM_ANDAMENTO', contatoId: contato?.id } })
    const base = `${publicBase()}/api/public/edu/comunicacao/webhook/${c.canal.id}/voz/digito`
    res.type(XML).send(twimlUra(await uraDoTenant(c.canal.tenantId), base))
  }),
)
publicRouter.post(
  '/webhook/:canalId/voz/digito',
  asyncHandler(async (req, res) => {
    const c = await voz(req, res)
    if (!c) return
    const d = String(req.body?.Digits ?? '')
    if (req.body?.CallSid) await prisma.comChamada.updateMany({ where: { tenantId: c.canal.tenantId, provedorSid: String(req.body.CallSid) }, data: { digitos: d } })
    const base = `${publicBase()}/api/public/edu/comunicacao/webhook/${c.canal.id}/voz/digito`
    res.type(XML).send(twimlResposta(await uraDoTenant(c.canal.tenantId), d, base))
  }),
)
publicRouter.post(
  '/webhook/:canalId/voz/status',
  asyncHandler(async (req, res) => {
    const c = await voz(req, res)
    if (!c) return
    const b = req.body ?? {}
    const mapa: Record<string, string> = { completed: 'CONCLUIDA', 'no-answer': 'NAO_ATENDIDA', busy: 'OCUPADO', failed: 'FALHA', canceled: 'FALHA', ringing: 'TOCANDO', 'in-progress': 'EM_ANDAMENTO' }
    const st = mapa[String(b.CallStatus)]
    if (b.CallSid && st) {
      await prisma.comChamada.updateMany({ where: { tenantId: c.canal.tenantId, provedorSid: String(b.CallSid) }, data: { status: st, ...(b.CallDuration ? { duracaoSeg: Number(b.CallDuration) } : {}), ...(['CONCLUIDA', 'NAO_ATENDIDA', 'OCUPADO', 'FALHA'].includes(st) ? { fimEm: new Date() } : {}) } })
    }
    res.type(XML).send('<?xml version="1.0" encoding="UTF-8"?><Response/>')
  }),
)

// ---------------------------------------------------------------- chat do site
const rate = new Map<string, { n: number; t: number }>()
function limitar(chave: string, max = 30, janelaMs = 60_000) {
  const agora = Date.now()
  const r = rate.get(chave)
  if (!r || agora - r.t > janelaMs) {
    rate.set(chave, { n: 1, t: agora })
    if (rate.size > 5000) for (const [k, v] of rate) if (agora - v.t > janelaMs) rate.delete(k)
    return true
  }
  r.n++
  return r.n <= max
}
async function chatSite(req: Request, res: Response) {
  const c = await carregarCanal(req, res)
  if (!c) return null
  if (c.canal.tipo !== 'SITE_CHAT' || !c.cfg.chatKey || !safeEqual(String(req.headers['x-chat-key'] || ''), String(c.cfg.chatKey))) {
    res.status(401).json({ error: 'Chave do chat inválida.' })
    return null
  }
  return c
}
const SID = /^[A-Za-z0-9_-]{8,64}$/

publicRouter.post(
  '/sitechat/:canalId',
  asyncHandler(async (req, res) => {
    const c = await chatSite(req, res)
    if (!c) return
    const sessionId = String(req.body?.sessionId || '')
    const texto = String(req.body?.texto || '').trim().slice(0, 1000)
    if (!SID.test(sessionId) || !texto) return void res.status(400).json({ error: 'sessionId (8-64 caracteres) e texto são obrigatórios.' })
    if (!limitar(`${c.canal.id}:${sessionId}`)) return void res.status(429).json({ error: 'Muitas mensagens. Aguarde um instante.' })
    const antes = new Date()
    const r = await processarInbound({ tenantId: c.canal.tenantId, canalTipo: 'SITE_CHAT', canalId: c.canal.id, msg: { chaveExterna: sessionId, nome: req.body?.nome ? String(req.body.nome).slice(0, 80) : undefined, email: undefined, texto } })
    const respostas = r.conversaId ? await prisma.comMensagem.findMany({ where: { conversaId: r.conversaId, direcao: 'SAIDA', createdAt: { gte: antes } }, orderBy: { createdAt: 'asc' }, select: { id: true, conteudo: true, autorTipo: true, createdAt: true } }) : []
    res.json({ conversaId: r.conversaId, respostas })
  }),
)
publicRouter.get(
  '/sitechat/:canalId/mensagens',
  asyncHandler(async (req, res) => {
    const c = await chatSite(req, res)
    if (!c) return
    const sessionId = String(req.query.sessionId || '')
    if (!SID.test(sessionId)) return void res.status(400).json({ error: 'sessionId inválido.' })
    if (!limitar(`poll:${c.canal.id}:${sessionId}`, 120)) return void res.status(429).json({ error: 'Muitas requisições.' })
    const contato = await prisma.comContato.findFirst({ where: { tenantId: c.canal.tenantId, tags: { has: `sitechat:${sessionId}` } }, select: { id: true } })
    if (!contato) return void res.json({ mensagens: [] })
    const desde = req.query.desde ? new Date(String(req.query.desde)) : new Date(0)
    const mensagens = await prisma.comMensagem.findMany({ where: { tenantId: c.canal.tenantId, direcao: 'SAIDA', createdAt: { gt: isNaN(desde.getTime()) ? new Date(0) : desde }, conversa: { contatoId: contato.id, canalTipo: 'SITE_CHAT' } }, orderBy: { createdAt: 'asc' }, take: 50, select: { id: true, conteudo: true, autorTipo: true, createdAt: true } })
    res.json({ mensagens })
  }),
)

publicRouter.use((err: any, _req: Request, res: Response, next: any) => {
  if (res.headersSent) return next(err)
  console.error('[com-webhook]', err)
  res.status(err?.status || 500).json({ error: 'Erro ao processar webhook.' })
})
