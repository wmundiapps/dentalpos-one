import type { Request, Response } from 'express'
import { MarketingError, captureLead, handleWhatsappWebhook, salesWhatsappNumber, verifyMetaSignature } from '../services/salesBotService'

const seen = new Map<string, number[]>()
function tooMany(ip: string) {
  const now = Date.now()
  const recent = (seen.get(ip) || []).filter(t => now - t < 3_600_000)
  recent.push(now)
  seen.set(ip, recent)
  return recent.length > 12
}

export const config = (_req: Request, res: Response) => res.json({ whatsapp: salesWhatsappNumber() })

export async function lead(req: Request, res: Response) {
  try {
    if (tooMany(req.ip || 'unknown')) return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em alguns minutos.' })
    return res.status(201).json(await captureLead(req.body || {}))
  } catch (error) {
    if (error instanceof MarketingError) return res.status(error.status).json({ error: error.message })
    console.error('Erro ao registrar lead:', error instanceof Error ? error.message : 'erro')
    return res.status(500).json({ error: 'Não foi possível continuar agora. Tente de novo.' })
  }
}

// Verificacao do webhook (a Meta chama uma vez ao cadastrar a URL).
export function whatsappVerify(req: Request, res: Response) {
  const expected = process.env.META_VERIFY_TOKEN
  if (expected && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === expected) return res.status(200).send(String(req.query['hub.challenge'] || ''))
  return res.status(403).end()
}

// Mensagens recebidas. Sem META_APP_SECRET o webhook fica fechado; assinatura invalida e recusada.
export async function whatsappInbound(req: Request, res: Response) {
  if (!process.env.META_APP_SECRET) return res.status(503).json({ error: 'Webhook ainda nao configurado.' })
  const raw = (req as Request & { rawBody?: Buffer }).rawBody
  if (!verifyMetaSignature(raw, req.get('x-hub-signature-256'))) return res.status(401).json({ error: 'Assinatura invalida.' })
  try {
    return res.status(200).json(await handleWhatsappWebhook(req.body))
  } catch (error) {
    console.error('Erro no webhook do WhatsApp:', error instanceof Error ? error.message : 'erro')
    return res.status(200).json({ ok: false })
  }
}
