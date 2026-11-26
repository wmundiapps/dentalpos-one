import type { Request, Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import { SubscriptionError, addCardToTrial, cancelSubscription, getSubscriptionView, publicOffer, reactivateSubscription, startTrial } from '../services/subscriptionService'

// Limite simples por IP para o cadastro (10 min; evita teste de cartoes roubados e criacao em massa de contas).
// Erro de preenchimento (campo faltando, data invalida...) NAO conta: so contam contas criadas e cartoes recusados.
const attempts = new Map<string, number[]>()
const WINDOW_MS = 10 * 60_000 // a trava dura 10 minutos
const MAX_ATTEMPTS = 10
function recent(ip: string) {
  const now = Date.now()
  const list = (attempts.get(ip) || []).filter(t => now - t < WINDOW_MS)
  attempts.set(ip, list)
  return list
}
const isBlocked = (ip: string) => recent(ip).length >= MAX_ATTEMPTS
const countAttempt = (ip: string) => { const l = recent(ip); l.push(Date.now()); attempts.set(ip, l) }
// Usado por reativar/cadastrar cartao: cada chamada conta.
function tooMany(ip: string) { countAttempt(ip); return recent(ip).length > MAX_ATTEMPTS }

export async function offer(_req: Request, res: Response) {
  return res.json(publicOffer())
}

export async function signup(req: Request, res: Response) {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    if (isBlocked(ip)) return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em 10 minutos.' })
    const result = await startTrial(req.body || {}, ip)
    countAttempt(ip)
    return res.status(201).json(result)
  } catch (error) {
    if (error instanceof SubscriptionError) {
      // Cartao recusado (402) conta; erro de preenchimento (400/409) nao.
      if (error.status === 402) countAttempt(req.ip || req.socket.remoteAddress || 'unknown')
      return res.status(error.status).json({ error: error.message })
    }
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
    if (tooMany(`re:${ip}`)) return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em 10 minutos.' })
    return res.json(await reactivateSubscription(req.user!.clinicId, req.body || {}, ip))
  } catch (error) {
    if (error instanceof SubscriptionError) return res.status(error.status).json({ error: error.message })
    console.error('Erro ao reativar assinatura:', error instanceof Error ? error.message : 'erro')
    return res.status(500).json({ error: 'Não foi possível reativar agora.' })
  }
}

// Cadastrar o cartao durante o teste sem cartao (vale tambem com o teste vencido, por isso nao passa por requirePermission).
export async function addCard(req: AuthRequest, res: Response) {
  try {
    if (req.user!.role !== 'ADMIN') return res.status(403).json({ error: 'Só o administrador da clínica pode cadastrar o cartão.' })
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    if (tooMany(`card:${ip}`)) return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em 10 minutos.' })
    return res.json(await addCardToTrial(req.user!.clinicId, req.body || {}, ip))
  } catch (error) {
    if (error instanceof SubscriptionError) return res.status(error.status).json({ error: error.message })
    console.error('Erro ao cadastrar cartão no teste:', error instanceof Error ? error.message : 'erro')
    return res.status(500).json({ error: 'Não foi possível cadastrar o cartão agora.' })
  }
}
