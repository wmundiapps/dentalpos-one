import { createHmac, randomBytes, timingSafeEqual, createHash } from 'crypto'
import { prisma } from '../lib/prisma'
import { decryptSecret, encryptSecret } from './secretVault'

// Verificação em 2 etapas com aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy...).
// Padrão TOTP (RFC 6238): código de 6 números que muda a cada 30 segundos, sem biblioteca externa.
// O segredo fica cifrado no banco; os códigos reserva ficam só como hash; um código não vale duas vezes.

export const TWO_FACTOR_ISSUER = 'DentalPos'
const STEP = 30
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
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
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

function hotp(secret: Buffer, counter: number) {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', secret).update(msg).digest()
  const off = h[h.length - 1] & 15
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(bin % 1_000_000).padStart(6, '0')
}

// Aceita o código do passo atual e de um passo antes/depois (relógio do celular adiantado ou atrasado)
export function matchStep(secret: Buffer, code: string, now = Date.now()): number | null {
  const step = Math.floor(now / 1000 / STEP)
  for (const s of [step, step - 1, step + 1]) {
    const expected = Buffer.from(hotp(secret, s))
    const got = Buffer.from(code)
    if (got.length === expected.length && timingSafeEqual(got, expected)) return s
  }
  return null
}
export const totpAt = (secret: Buffer, now: number) => hotp(secret, Math.floor(now / 1000 / STEP))

const sha = (v: string) => createHash('sha256').update(v).digest('hex')
const backupHash = (userId: string, code: string) => sha(`totp-backup:${userId}:${code.replace(/\W/g, '').toLowerCase()}`)

export function newBackupCodes() {
  return Array.from({ length: 8 }, () => {
    const raw = base32Encode(randomBytes(5)).toLowerCase().slice(0, 8)
    return `${raw.slice(0, 4)}-${raw.slice(4)}`
  })
}

export async function twoFactorEnabled(userId: string): Promise<boolean> {
  try {
    const row = await prisma.userTwoFactor.findUnique({ where: { userId }, select: { enabledAt: true, secret: true } })
    return Boolean(row?.enabledAt && row.secret)
  } catch (error) {
    // Tabela ainda não criada no banco: o acesso segue sem 2 etapas até o SQL rodar.
    console.error('Falha ao consultar 2 etapas:', error)
    return false
  }
}

export async function startSetup(userId: string, email: string) {
  const secret = randomBytes(20)
  await prisma.userTwoFactor.upsert({
    where: { userId },
    update: { pending: encryptSecret(base32Encode(secret)) },
    create: { userId, pending: encryptSecret(base32Encode(secret)) },
  })
  const key = base32Encode(secret)
  const label = encodeURIComponent(`${TWO_FACTOR_ISSUER}:${email}`)
  return { key, uri: `otpauth://totp/${label}?secret=${key}&issuer=${TWO_FACTOR_ISSUER}&algorithm=SHA1&digits=6&period=${STEP}` }
}

export async function finishSetup(userId: string, code: string): Promise<{ backupCodes: string[] } | null> {
  const row = await prisma.userTwoFactor.findUnique({ where: { userId } })
  if (!row?.pending) return null
  const key = decryptSecret<string>(row.pending)
  if (!key) return null
  const step = matchStep(base32Decode(key), code)
  if (step === null) return null
  const codes = newBackupCodes()
  await prisma.userTwoFactor.update({
    where: { userId },
    data: { secret: row.pending, pending: null, enabledAt: new Date(), lastStep: step, backupHashes: codes.map((c) => backupHash(userId, c)) },
  })
  return { backupCodes: codes }
}

// Confere o código do aplicativo (sem reaproveitar o mesmo código) ou um código reserva (que é gasto).
export async function verifySecondFactor(userId: string, input: string): Promise<'totp' | 'backup' | null> {
  const row = await prisma.userTwoFactor.findUnique({ where: { userId } })
  if (!row?.enabledAt || !row.secret) return null
  const code = input.trim()
  if (/^\d{6}$/.test(code)) {
    const key = decryptSecret<string>(row.secret)
    if (!key) return null
    const step = matchStep(base32Decode(key), code)
    if (step === null) return null
    if (row.lastStep !== null && step <= row.lastStep) return null
    const updated = await prisma.userTwoFactor.updateMany({ where: { userId, OR: [{ lastStep: null }, { lastStep: { lt: step } }] }, data: { lastStep: step } })
    return updated.count ? 'totp' : null
  }
  const hash = backupHash(userId, code)
  if (!row.backupHashes.includes(hash)) return null
  await prisma.userTwoFactor.update({ where: { userId }, data: { backupHashes: row.backupHashes.filter((h) => h !== hash) } })
  return 'backup'
}

export async function regenerateBackupCodes(userId: string) {
  const codes = newBackupCodes()
  await prisma.userTwoFactor.update({ where: { userId }, data: { backupHashes: codes.map((c) => backupHash(userId, c)) } })
  return codes
}

export async function disableTwoFactor(userId: string) {
  await prisma.userTwoFactor.deleteMany({ where: { userId } })
}

// Bilhete curto entre a senha e o código: prova que a senha foi conferida há menos de 5 minutos.
const ticketSecret = () => {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET não configurado')
  return `2fa-ticket:${s}`
}
export function issueLoginTicket(userId: string) {
  const exp = Date.now() + 5 * 60_000
  const body = `${userId}.${exp}`
  return `${body}.${createHmac('sha256', ticketSecret()).update(body).digest('base64url')}`
}
export function readLoginTicket(ticket: string): string | null {
  const [userId, exp, sig] = String(ticket || '').split('.')
  if (!userId || !exp || !sig || Number(exp) < Date.now()) return null
  const want = createHmac('sha256', ticketSecret()).update(`${userId}.${exp}`).digest()
  const got = Buffer.from(sig, 'base64url')
  return got.length === want.length && timingSafeEqual(got, want) ? userId : null
}
