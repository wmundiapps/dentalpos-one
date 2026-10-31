import type { Request, Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import { SubscriptionError, cancelSubscription, getSubscriptionView, publicOffer, reactivateSubscription, startTrial } from '../services/subscriptionService'

// Limite simples por IP para o cadastro com cartao (evita teste de cartoes roubados).
const attempts = new Map<string, number[]>()
function tooMany(ip: string) {
  const now = Date.now()
  const recent = (attempts.get(ip) || []).filter(t => now - t < 3_600_000)
  recent.push(now)
  attempts.set(ip, recent)
  return recent.length > 6
}

export async function offer(_req: Request, res: Response) {
  return res.json(publicOffer())
}

export async function signup(req: Request, res: Response) {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    if (tooMany(ip)) return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em alguns minutos.' })
    const result = await startTrial(req.body || {}, ip)
    return res.status(201).json(result)
  } catch (error) {
    if (error instanceof SubscriptionError) return res.status(error.status).json({ error: error.message })
    console.error('Erro no cadastro com teste de 30 dias:', error instanceof Error ? error.message : 'erro')
    return res.status(500).json({ error: 'Não foi possível concluir o cadastro agora. Tente de novo em instantes.' })
  }
}

export async function mine(req: AuthRequest, res: Response) {
  try {
    return res.json(await getSubscriptionView(req.user!.clinicId))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar a assinatura.' })
  }
}

export async function cancel(req: AuthRequest, res: Response) {
  try {
    return res.json(await cancelSubscription(req.user!.clinicId))
  } catch (error) {
    if (error instanceof SubscriptionError) return res.status(error.status).json({ error: error.message })
    console.error(error)
    return res.status(500).json({ error: 'Não foi possível cancelar agora.' })
  }
}

// Reativar vale mesmo com a conta somente leitura, por isso nao passa por requirePermission.
export async function reactivate(req: AuthRequest, res: Response) {
  try {
    if (req.user!.role !== 'ADMIN') return res.status(403).json({ error: 'Só o administrador da clínica pode reativar a assinatura.' })
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    if (tooMany(`re:${ip}`)) return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em alguns minutos.' })
    return res.json(await reactivateSubscription(req.user!.clinicId, req.body || {}, ip))
  } catch (error) {
    if (error instanceof SubscriptionError) return res.status(error.status).json({ error: error.message })
    console.error('Erro ao reativar assinatura:', error instanceof Error ? error.message : 'erro')
    return res.status(500).json({ error: 'Não foi possível reativar agora.' })
  }
}
