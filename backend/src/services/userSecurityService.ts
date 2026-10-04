import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { generateBackupCodes, generateSecret, hashBackupCode, verifyTotp } from './totpService'

/**
 * Estado de segurança por usuário (2FA + bloqueio por tentativas) em tabela própria "UserSecurity",
 * criada sob demanda — assim o login continua funcionando mesmo antes de a migração manual ser aplicada.
 */

export interface UserSecurityRow {
  userId: string
  totpSecret: string | null
  totpEnabled: boolean
  lastCounter: number | null
  backupCodes: string[]
  failedLogins: number
  lockedUntil: Date | null
}

let ready: Promise<void> | null = null
function ensureTable() {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "UserSecurity" (
        "userId" TEXT PRIMARY KEY, "totpSecret" TEXT, "totpEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
        "lastCounter" BIGINT, "backupCodes" TEXT NOT NULL DEFAULT '[]', "failedLogins" INTEGER NOT NULL DEFAULT 0,
        "lockedUntil" TIMESTAMPTZ, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
    })().catch((e) => {
      ready = null
      throw e
    })
  }
  return ready
}

function vaultKey() {
  const raw = process.env.TENANT_SECRET_MASTER_KEY || process.env.JWT_SECRET
  if (!raw) throw new Error('Chave de criptografia não configurada')
  return crypto.createHash('sha256').update('dentalpos:totp:' + raw).digest()
}
function enc(plain: string) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map((x) => x.toString('base64url')).join('.')
}
function dec(payload: string) {
  const [iv, tag, body] = payload.split('.').map((x) => Buffer.from(x, 'base64url'))
  const d = crypto.createDecipheriv('aes-256-gcm', vaultKey(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(body), d.final()]).toString('utf8')
}

export async function getSecurity(userId: string): Promise<UserSecurityRow> {
  await ensureTable()
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "UserSecurity" WHERE "userId" = $1`, userId)
  const r = rows[0]
  if (!r) return { userId, totpSecret: null, totpEnabled: false, lastCounter: null, backupCodes: [], failedLogins: 0, lockedUntil: null }
  return {
    userId,
    totpSecret: r.totpSecret ? dec(r.totpSecret) : null,
    totpEnabled: !!r.totpEnabled,
    lastCounter: r.lastCounter == null ? null : Number(r.lastCounter),
    backupCodes: JSON.parse(r.backupCodes || '[]'),
    failedLogins: Number(r.failedLogins || 0),
    lockedUntil: r.lockedUntil ? new Date(r.lockedUntil) : null,
  }
}

async function save(s: UserSecurityRow) {
  await ensureTable()
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserSecurity" ("userId","totpSecret","totpEnabled","lastCounter","backupCodes","failedLogins","lockedUntil","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT ("userId") DO UPDATE SET "totpSecret"=$2,"totpEnabled"=$3,"lastCounter"=$4,"backupCodes"=$5,"failedLogins"=$6,"lockedUntil"=$7,"updatedAt"=NOW()`,
    s.userId, s.totpSecret ? enc(s.totpSecret) : null, s.totpEnabled, s.lastCounter, JSON.stringify(s.backupCodes), s.failedLogins, s.lockedUntil,
  )
}

// ── bloqueio progressivo: 5 falhas → 5 min; depois dobra até 60 min ──
const MAX_FAILS = 5
export function lockMinutes(fails: number) {
  return fails < MAX_FAILS ? 0 : Math.min(60, 5 * 2 ** Math.floor((fails - MAX_FAILS) / MAX_FAILS))
}
export const isLocked = (s: UserSecurityRow) => !!s.lockedUntil && s.lockedUntil.getTime() > Date.now()

export async function recordFailure(userId: string) {
  const s = await getSecurity(userId)
  s.failedLogins += 1
  const m = lockMinutes(s.failedLogins)
  if (m > 0 && s.failedLogins % MAX_FAILS === 0) s.lockedUntil = new Date(Date.now() + m * 60_000)
  await save(s)
  return s
}
export async function recordSuccess(userId: string) {
  const s = await getSecurity(userId)
  if (s.failedLogins === 0 && !s.lockedUntil) return
  s.failedLogins = 0
  s.lockedUntil = null
  await save(s)
}

// ── 2FA ──
export async function beginSetup(userId: string) {
  const s = await getSecurity(userId)
  if (s.totpEnabled) throw new Error('2FA já está ativo.')
  s.totpSecret = generateSecret()
  await save(s)
  return s.totpSecret
}

export async function enableTotp(userId: string, code: string): Promise<string[] | null> {
  const s = await getSecurity(userId)
  if (s.totpEnabled || !s.totpSecret) return null
  const counter = verifyTotp(s.totpSecret, code)
  if (counter === null) return null
  const codes = generateBackupCodes()
  s.totpEnabled = true
  s.lastCounter = counter
  s.backupCodes = codes.map(hashBackupCode)
  await save(s)
  return codes
}

/** Valida código do app OU código de recuperação (consumido). */
export async function checkSecondFactor(userId: string, code: string): Promise<'totp' | 'backup' | null> {
  const s = await getSecurity(userId)
  if (!s.totpEnabled || !s.totpSecret) return null
  const counter = verifyTotp(s.totpSecret, code, { lastCounter: s.lastCounter })
  if (counter !== null) {
    s.lastCounter = counter
    await save(s)
    return 'totp'
  }
  const h = hashBackupCode(code)
  const i = s.backupCodes.indexOf(h)
  if (i >= 0) {
    s.backupCodes.splice(i, 1)
    await save(s)
    return 'backup'
  }
  return null
}

export async function disableTotp(userId: string) {
  const s = await getSecurity(userId)
  s.totpEnabled = false
  s.totpSecret = null
  s.lastCounter = null
  s.backupCodes = []
  await save(s)
}
