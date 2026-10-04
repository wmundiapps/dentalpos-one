import crypto from 'crypto'

/**
 * TOTP (RFC 6238) / HOTP (RFC 4226) com HMAC-SHA1, 6 dígitos, passo de 30 s — compatível com
 * Google Authenticator, Microsoft Authenticator, Authy, 1Password etc. Sem dependências externas.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const i = B32.indexOf(ch)
    if (i < 0) throw new Error('base32 inválido')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function generateSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes))
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = crypto.createHmac('sha1', secret).update(msg).digest()
  const off = h[h.length - 1] & 15
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

export const STEP = 30

export function totpAt(secretB32: string, timeMs: number, digits = 6): string {
  return hotp(base32Decode(secretB32), Math.floor(timeMs / 1000 / STEP), digits)
}

const safeEq = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

/**
 * Verifica o código aceitando ±`window` passos (deriva de relógio). Retorna o contador usado ou null.
 * `lastCounter` impede reutilização do mesmo código (replay).
 */
export function verifyTotp(secretB32: string, code: string, opts: { now?: number; window?: number; lastCounter?: number | null } = {}): number | null {
  const c = String(code || '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(c)) return null
  const now = opts.now ?? Date.now()
  const win = opts.window ?? 1
  const secret = base32Decode(secretB32)
  const center = Math.floor(now / 1000 / STEP)
  let hit: number | null = null
  for (let d = -win; d <= win; d++) {
    const counter = center + d
    if (safeEq(hotp(secret, counter), c) && hit === null) hit = counter // sem early-return: tempo constante
  }
  if (hit === null) return null
  if (opts.lastCounter != null && hit <= opts.lastCounter) return null
  return hit
}

export function otpauthUri(secretB32: string, account: string, issuer = 'Dentalpos One'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`
}

/** Códigos de recuperação de uso único (ex.: "k3f9-x7q2-m8d4"). */
export function generateBackupCodes(n = 8): string[] {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: n }, () => {
    const b = crypto.randomBytes(12)
    const s = Array.from(b, (x) => alphabet[x % alphabet.length]).join('')
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`
  })
}

export const hashBackupCode = (code: string) =>
  crypto.createHash('sha256').update(code.toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex')
