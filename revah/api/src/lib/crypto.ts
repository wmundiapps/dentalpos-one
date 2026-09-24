import crypto from 'crypto'
import { config } from '../config'

function key() {
  const raw = config.encryptionKey
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('ENCRYPTION_KEY não configurada.')
    return crypto.createHash('sha256').update('revah-dev-encryption-key').digest()
  }
  return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : crypto.createHash('sha256').update(raw).digest()
}

// AES-256-GCM para credenciais de provedores (nunca voltam para o frontend).
export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

export function decryptJson<T = Record<string, any>>(payload?: string | null): T | null {
  if (!payload) return null
  const [v, iv, tag, data] = payload.split(':')
  if (v !== 'v1') return null
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  const out = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()])
  return JSON.parse(out.toString('utf8')) as T
}

export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex')
export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url')

export function hmacHex(secret: string, payload: string | Buffer, algo: 'sha256' | 'sha1' = 'sha256') {
  return crypto.createHmac(algo, secret).update(payload).digest('hex')
}

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

// Token assinado sem estado, usado em links de descadastro de e-mail.
export function signPayload(data: Record<string, string>) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url')
  const sig = hmacHex(config.jwtSecret || 'dev', body).slice(0, 32)
  return `${body}.${sig}`
}

export function verifyPayload<T = Record<string, string>>(token: string): T | null {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig) return null
  if (!safeEqual(hmacHex(config.jwtSecret || 'dev', body).slice(0, 32), sig)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}
