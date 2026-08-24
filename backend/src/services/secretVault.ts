import crypto from 'crypto'

function key() {
  const raw = process.env.TENANT_SECRET_MASTER_KEY
  if (!raw) throw new Error('TENANT_SECRET_MASTER_KEY não configurada')
  return crypto.createHash('sha256').update(raw).digest()
}

export function encryptSecret(value: unknown) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map(x => x.toString('base64url')).join('.')
}

export function decryptSecret<T=unknown>(payload?: string | null): T | null {
  if (!payload) return null
  const [iv, tag, encrypted] = payload.split('.').map(x => Buffer.from(x, 'base64url'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')) as T
}
