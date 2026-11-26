// Verificação em 2 etapas com aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy…).
// Padrão TOTP (RFC 6238): código de 6 números que muda a cada 30 segundos. O segredo fica cifrado no banco
// (AES-256-GCM, ENCRYPTION_KEY); os códigos reserva ficam só como hash. Adaptado do ClubeFaz (wmundiapps/ifaco).
import crypto from 'crypto'
import type { User } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { decryptJson, encryptJson, sha256, signPayload, verifyPayload } from '../lib/crypto'

const ISSUER = 'REVAH'
const STEP = 30
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer) {
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

export function base32Decode(text: string) {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function hotp(secret: Buffer, counter: number) {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = crypto.createHmac('sha1', secret).update(msg).digest()
  const off = h[h.length - 1] & 15
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(bin % 1_000_000).padStart(6, '0')
}

// Aceita o código do passo atual e de um passo antes/depois (relógio do celular adiantado ou atrasado).
export function matchStep(secret: Buffer, code: string, now = Date.now()): number | null {
  const step = Math.floor(now / 1000 / STEP)
  for (const s of [step, step - 1, step + 1]) {
    const expected = Buffer.from(hotp(secret, s))
    const got = Buffer.from(code)
    if (got.length === expected.length && crypto.timingSafeEqual(got, expected)) return s
  }
  return null
}

const sealSecret = (secret: Buffer) => encryptJson({ k: base32Encode(secret) })
const openSecret = (sealed: string) => base32Decode(decryptJson<{ k: string }>(sealed)?.k || '')
const backupHash = (userId: string, code: string) => sha256(`totp-backup:${userId}:${code.replace(/\W/g, '').toLowerCase()}`)

function newBackupCodes() {
  return Array.from({ length: 8 }, () => {
    const raw = base32Encode(crypto.randomBytes(5)).toLowerCase().slice(0, 8)
    return `${raw.slice(0, 4)}-${raw.slice(4)}`
  })
}

export const twoFactorEnabled = (user: Pick<User, 'totpEnabledAt' | 'totpSecret'>) => Boolean(user.totpEnabledAt && user.totpSecret)

// Confere código do aplicativo (sem reaproveitar o mesmo código) ou um código reserva (que é gasto).
export async function verifySecondFactor(user: User, input: string): Promise<'totp' | 'backup' | null> {
  if (!twoFactorEnabled(user)) return null
  const code = String(input || '').trim()
  if (/^\d{6}$/.test(code)) {
    const step = matchStep(openSecret(user.totpSecret!), code)
    if (step === null) return null
    if (user.totpLastStep !== null && BigInt(step) <= user.totpLastStep) return null
    const updated = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: BigInt(step) } }] },
      data: { totpLastStep: BigInt(step) },
    })
    return updated.count ? 'totp' : null
  }
  const hash = backupHash(user.id, code)
  if (!user.totpBackupHashes.includes(hash)) return null
  await prisma.user.update({ where: { id: user.id }, data: { totpBackupHashes: user.totpBackupHashes.filter((h) => h !== hash) } })
  return 'backup'
}

// Bilhete curto entre a senha e o código: prova que a senha foi conferida há menos de 5 minutos.
export function issueLoginTicket(userId: string) {
  return signPayload({ p: '2fa', u: userId, e: String(Date.now() + 5 * 60_000) })
}

export function readLoginTicket(ticket: string): string | null {
  const t = verifyPayload<{ p: string; u: string; e: string }>(ticket)
  return t && t.p === '2fa' && Number(t.e) > Date.now() ? t.u : null
}

// Passo 1: gera o segredo (ainda pendente) e o endereço para o QR do aplicativo.
export async function startSetup(user: User) {
  const secret = crypto.randomBytes(20)
  await prisma.user.update({ where: { id: user.id }, data: { totpPending: sealSecret(secret) } })
  const key = base32Encode(secret)
  const label = encodeURIComponent(`${ISSUER}:${user.email}`)
  return { key, uri: `otpauth://totp/${label}?secret=${key}&issuer=${ISSUER}&algorithm=SHA1&digits=6&period=${STEP}` }
}

// Passo 2: confirma com o primeiro código do aplicativo e devolve os 8 códigos reserva (mostrados uma única vez).
export async function confirmSetup(user: User, code: string) {
  if (!user.totpPending) return null
  const secret = openSecret(user.totpPending)
  const step = matchStep(secret, code)
  if (step === null) return null
  const codes = newBackupCodes()
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: sealSecret(secret), totpPending: null, totpEnabledAt: new Date(), totpLastStep: BigInt(step), totpBackupHashes: codes.map((c) => backupHash(user.id, c)) },
  })
  return codes
}

export async function disableTwoFactor(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: null, totpPending: null, totpEnabledAt: null, totpLastStep: null, totpBackupHashes: [] } })
}

export async function regenerateBackupCodes(userId: string) {
  const codes = newBackupCodes()
  await prisma.user.update({ where: { id: userId }, data: { totpBackupHashes: codes.map((c) => backupHash(userId, c)) } })
  return codes
}
