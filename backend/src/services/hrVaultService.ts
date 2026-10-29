import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { NextFunction, Response } from 'express'
import { prisma } from '../lib/prisma'
import { writeAudit } from './auditService'
import { comparePassword, hashPassword } from './userService'
import { dispatchRevah } from './revahProviderService'
import type { AuthRequest } from '../middleware/auth'

// Acesso exclusivo do RH: como toda a clínica usa o mesmo login do sistema, salários e dados dos colaboradores
// só abrem com um login e senha próprios do RH (criados no primeiro acesso). O servidor exige o token do cofre em todas as rotas do RH.
const secret = () => `${process.env.JWT_SECRET || ''}:rh-cofre`
const TOKEN_MIN = 30
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex')
const maskEmail = (e: string) => e.replace(/^(.{2}).*(@.*)$/, '$1***$2')
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

type Ctx = { clinicId: string; tenantId: string; userId: string }
const issue = (c: Ctx) => jwt.sign({ kind: 'rh-cofre', clinicId: c.clinicId, userId: c.userId }, secret(), { expiresIn: `${TOKEN_MIN}m` })

export function readVaultToken(req: AuthRequest): { ok: boolean } {
  const raw = String(req.headers['x-hr-vault'] || '')
  if (!raw) return { ok: false }
  try {
    const p = jwt.verify(raw, secret()) as { kind?: string; clinicId?: string; userId?: string }
    return { ok: p.kind === 'rh-cofre' && p.clinicId === req.user?.clinicId && p.userId === req.user?.id }
  } catch { return { ok: false } }
}

// Barra todas as rotas do RH que não tenham o token do cofre (exceto bater ponto, tela pessoal e o próprio cofre).
export function requireHrVault(req: AuthRequest, res: Response, next: NextFunction) {
  const p = req.path
  if (p.startsWith('/me/') || p.startsWith('/vault') || p === '/timeclock/face-punch' || p === '/timeclock/face-first-enroll') return next()
  if (readVaultToken(req).ok) return next()
  return res.status(423).json({ code: 'HR_VAULT_LOCKED', error: 'Área exclusiva do RH. Entre com o login e a senha do RH.' })
}

export async function status(c: Ctx, req: AuthRequest) {
  const v = await prisma.hRVault.findUnique({ where: { clinicId: c.clinicId } })
  return { configured: Boolean(v), unlocked: Boolean(v) && readVaultToken(req).ok, login: v?.login || null, recoveryEmail: v ? maskEmail(v.recoveryEmail) : null, lockedUntil: v?.lockedUntil && v.lockedUntil > new Date() ? v.lockedUntil : null }
}

export async function setup(c: Ctx, body: any) {
  if (await prisma.hRVault.findUnique({ where: { clinicId: c.clinicId } })) return { error: 'O acesso do RH já foi criado.', status: 409 }
  const login = String(body?.login || '').trim()
  const password = String(body?.password || '')
  const email = String(body?.recoveryEmail || '').trim()
  if (login.length < 3 || login.length > 60) return { error: 'O login do RH precisa ter de 3 a 60 caracteres.' }
  if (password.length < 8 || password.length > 72) return { error: 'A senha precisa ter de 8 a 72 caracteres.' }
  if (password !== String(body?.confirm ?? '')) return { error: 'A confirmação da senha não confere.' }
  if (!EMAIL_RE.test(email)) return { error: 'Informe um e-mail válido para recuperar a senha.' }
  await prisma.hRVault.create({ data: { clinicId: c.clinicId, tenantId: c.tenantId, login, passwordHash: await hashPassword(password), recoveryEmail: email } })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.userId, module: 'hr', action: 'HR_VAULT_SETUP', entityType: 'HRVault', entityId: c.clinicId, summary: 'Acesso exclusivo do RH criado.' }).catch(() => undefined)
  return { ok: true, token: issue(c), minutes: TOKEN_MIN }
}

export async function unlock(c: Ctx, body: any) {
  const v = await prisma.hRVault.findUnique({ where: { clinicId: c.clinicId } })
  if (!v) return { error: 'O acesso do RH ainda não foi criado.', status: 404 }
  if (v.lockedUntil && v.lockedUntil > new Date()) return { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.', status: 429 }
  const okLogin = norm(body?.login) === norm(v.login)
  const okPass = await comparePassword(String(body?.password || ''), v.passwordHash)
  if (!okLogin || !okPass) {
    const failed = v.failedCount + 1
    await prisma.hRVault.update({ where: { clinicId: c.clinicId }, data: failed >= 5 ? { failedCount: 0, lockedUntil: new Date(Date.now() + 10 * 60 * 1000) } : { failedCount: failed } })
    await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.userId, module: 'hr', action: 'HR_VAULT_FAILED', entityType: 'HRVault', entityId: c.clinicId, summary: 'Tentativa de acesso ao RH com login/senha incorretos.' }).catch(() => undefined)
    return { error: 'Login ou senha do RH incorretos.', status: 401 }
  }
  await prisma.hRVault.update({ where: { clinicId: c.clinicId }, data: { failedCount: 0, lockedUntil: null } })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.userId, module: 'hr', action: 'HR_VAULT_UNLOCK', entityType: 'HRVault', entityId: c.clinicId, summary: 'Acesso ao RH liberado.' }).catch(() => undefined)
  return { ok: true, token: issue(c), minutes: TOKEN_MIN }
}

export async function requestReset(c: Ctx) {
  const v = await prisma.hRVault.findUnique({ where: { clinicId: c.clinicId } })
  if (!v) return { error: 'O acesso do RH ainda não foi criado.', status: 404 }
  const apiKey = String(process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) return { error: 'O envio de e-mail não está configurado. Fale com o suporte da WMundi Apps.', status: 503 }
  const code = String(crypto.randomInt(100000, 1000000))
  await prisma.hRVault.update({ where: { clinicId: c.clinicId }, data: { resetCodeHash: sha(`${c.clinicId}:${code}`), resetExpiresAt: new Date(Date.now() + 15 * 60 * 1000) } })
  await dispatchRevah('EMAIL', v.recoveryEmail, `Seu código para redefinir a senha do RH no CompletoDonto é ${code}.\n\nEle vale por 15 minutos. Se você não pediu, ignore este e-mail.`, { apiKey, subject: 'Código para redefinir o acesso do RH' }, 'CompletoDonto <contato@dentalpos.com.br>')
  return { ok: true, sentTo: maskEmail(v.recoveryEmail) }
}

export async function confirmReset(c: Ctx, body: any) {
  const v = await prisma.hRVault.findUnique({ where: { clinicId: c.clinicId } })
  if (!v || !v.resetCodeHash || !v.resetExpiresAt || v.resetExpiresAt < new Date()) return { error: 'Código expirado. Peça um novo código.', status: 400 }
  if (v.lockedUntil && v.lockedUntil > new Date()) return { error: 'Muitas tentativas. Aguarde alguns minutos.', status: 429 }
  if (sha(`${c.clinicId}:${String(body?.code || '').trim()}`) !== v.resetCodeHash) {
    const failed = v.failedCount + 1
    await prisma.hRVault.update({ where: { clinicId: c.clinicId }, data: failed >= 5 ? { failedCount: 0, lockedUntil: new Date(Date.now() + 10 * 60 * 1000), resetCodeHash: null } : { failedCount: failed } })
    return { error: 'Código incorreto.', status: 400 }
  }
  const password = String(body?.password || '')
  if (password.length < 8 || password.length > 72) return { error: 'A nova senha precisa ter de 8 a 72 caracteres.' }
  if (password !== String(body?.confirm ?? '')) return { error: 'A confirmação da senha não confere.' }
  const login = String(body?.login || '').trim() || v.login
  await prisma.hRVault.update({ where: { clinicId: c.clinicId }, data: { passwordHash: await hashPassword(password), login, resetCodeHash: null, resetExpiresAt: null, failedCount: 0, lockedUntil: null } })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.userId, module: 'hr', action: 'HR_VAULT_RESET', entityType: 'HRVault', entityId: c.clinicId, summary: 'Senha do RH redefinida por código enviado ao e-mail de recuperação.' }).catch(() => undefined)
  return { ok: true, token: issue(c), minutes: TOKEN_MIN }
}
