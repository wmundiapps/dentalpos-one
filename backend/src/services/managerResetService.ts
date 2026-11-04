import { createHmac, randomUUID } from 'crypto'

// Link de redefinição de senha do DentalPos Manager (ver server/resetLink.js no repositório dentalpos-erp).
// Assinado com MANAGER_RESET_SECRET (mesmo valor nos dois sistemas, nunca no código). Vale 10 minutos, uma vez só.
// Formato: <payload base64url>.<HMAC-SHA256 base64url>. Sem o segredo configurado, recusa.

const AUD = 'manager-reset'
export const RESET_TTL_SEC = 10 * 60

export const managerBaseUrl = () => String(process.env.MANAGER_URL || 'https://dentalpos-manager-production.up.railway.app').replace(/\/$/, '')
export const resetAllowedEmails = () => String(process.env.MANAGER_RESET_EMAILS || 'clinicaravel@gmail.com').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
export const resetEnabled = () => String(process.env.MANAGER_RESET_SECRET || '').length >= 32

export function signManagerResetToken(email: string, now = Date.now()) {
  const secret = String(process.env.MANAGER_RESET_SECRET || '')
  if (secret.length < 32) throw new Error('MANAGER_RESET_SECRET ausente ou curto')
  const payload = Buffer.from(JSON.stringify({ aud: AUD, sub: email.toLowerCase(), exp: Math.floor(now / 1000) + RESET_TTL_SEC, jti: randomUUID() })).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

// O código vai no fragmento (#t=): nunca chega ao servidor nem ao Referer.
export const managerResetUrl = (token: string) => `${managerBaseUrl()}/redefinir-senha#t=${token}`
