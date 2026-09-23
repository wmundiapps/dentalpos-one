import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { ah, badRequest, conflict, HttpError } from '../lib/errors'
import { randomToken, sha256 } from '../lib/crypto'
import { normalizeEmail, normalizePhone, slugify } from '../lib/normalize'
import { requireAuth, signSession, type AuthedRequest } from '../middleware/auth'
import { audit } from '../services/audit'
import { ssoExchange } from '../services/dentalpos'
import { limitsFor, trialStatus } from '../services/plans'
import { sendSystemEmail } from '../services/systemEmail'

const r = Router()

const RegisterSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.'),
  email: z.string().trim().email('E-mail inválido.'),
  password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
  company: z.string().trim().min(2).optional(),
  empresa: z.string().trim().min(2).optional(),
  phone: z.string().optional(),
  telefone: z.string().optional(),
  document: z.string().optional(),
  acceptTerms: z.boolean().optional(),
})

export function sessionPayload(user: any, tenant: any, embedded = false) {
  return {
    token: signSession(user, embedded),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      source: tenant.source,
      leadsAddonActive: tenant.leadsAddonActive,
      limits: limitsFor(tenant),
      trial: trialStatus(tenant),
    },
    embedded,
    superadmin: config.superadminEmails.includes(String(user.email).toLowerCase()),
  }
}

// Cadastro = empresa em teste grátis (2 campanhas × 20 contatos, sem cartão).
r.post(
  '/register',
  ah(async (req, res) => {
    const b = RegisterSchema.parse(req.body)
    const email = normalizeEmail(b.email)!
    if (await prisma.user.findUnique({ where: { email } })) throw conflict('Já existe uma conta com este e-mail. Faça login.', 'EMAIL_IN_USE')
    const phone = normalizePhone(b.phone || b.telefone)
    const document = b.document?.replace(/\D/g, '') || null
    const companyName = b.company || b.empresa || b.name

    // Um teste grátis por e-mail, telefone e documento.
    const keys = [`email:${sha256(email)}`, phone ? `phone:${sha256(phone)}` : null, document ? `doc:${sha256(document)}` : null].filter(Boolean) as string[]
    const reused = await prisma.trialRegistry.findFirst({ where: { key: { in: keys } } })
    const tenant = await prisma.tenant.create({
      data: {
        name: companyName,
        slug: `${slugify(companyName)}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        phone,
        document,
        // Quem já usou o teste começa com as campanhas grátis consumidas.
        trialCampaignsUsed: reused ? 2 : 0,
      },
    })
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, name: b.name, email, passwordHash: await bcrypt.hash(b.password, 11), role: 'OWNER', lastLoginAt: new Date() },
    })
    if (!reused) await prisma.trialRegistry.createMany({ data: keys.map((key) => ({ key, tenantId: tenant.id })), skipDuplicates: true })
    await audit(tenant.id, user.id, 'REGISTER', 'Tenant', tenant.id, { trialReused: Boolean(reused) })
    res.status(201).json({ ...sessionPayload(user, tenant), trialAlreadyUsed: Boolean(reused) })
  }),
)

r.post(
  '/login',
  ah(async (req, res) => {
    const email = normalizeEmail(req.body?.email)
    const password = String(req.body?.password || req.body?.senha || '')
    if (!email || !password) throw badRequest('Informe e-mail e senha.')
    const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } })
    const ok = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false
    if (!user || !ok) throw new HttpError(401, 'E-mail ou senha incorretos.', 'INVALID_CREDENTIALS')
    if (!user.isActive) throw new HttpError(403, 'Usuário desativado. Fale com o administrador da sua empresa.')
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    res.json(sessionPayload(user, user.tenant))
  }),
)

r.get(
  '/me',
  requireAuth,
  ah(async (req: AuthedRequest, res) => {
    res.json(sessionPayload(req.user, req.tenant, Boolean(req.embedded)))
  }),
)

r.post(
  '/forgot-password',
  ah(async (req, res) => {
    const email = normalizeEmail(req.body?.email)
    if (email) {
      const user = await prisma.user.findUnique({ where: { email } })
      if (user?.isActive) {
        const token = randomToken(32)
        await prisma.user.update({ where: { id: user.id }, data: { resetTokenHash: sha256(token), resetTokenExpires: new Date(Date.now() + 60 * 60_000) } })
        await sendSystemEmail(
          email,
          'REVAH — redefinição de senha',
          `Olá, ${user.name}.\n\nPara criar uma nova senha, acesse (válido por 1 hora):\n${config.appUrl}/redefinir-senha?token=${token}\n\nSe não foi você, ignore este e-mail.`,
        )
      }
    }
    res.json({ ok: true, message: 'Se o e-mail estiver cadastrado, você receberá as instruções em instantes.' })
  }),
)

r.post(
  '/reset-password',
  ah(async (req, res) => {
    const token = String(req.body?.token || '')
    const password = String(req.body?.password || '')
    if (password.length < 8) throw badRequest('A senha precisa ter ao menos 8 caracteres.')
    const user = await prisma.user.findFirst({ where: { resetTokenHash: sha256(token), resetTokenExpires: { gt: new Date() } }, include: { tenant: true } })
    if (!user) throw badRequest('Link inválido ou expirado. Peça um novo.')
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 11), resetTokenHash: null, resetTokenExpires: null } })
    res.json(sessionPayload(user, user.tenant))
  }),
)

r.post(
  '/change-password',
  requireAuth,
  ah(async (req: AuthedRequest, res) => {
    const current = String(req.body?.currentPassword || '')
    const next = String(req.body?.newPassword || '')
    if (next.length < 8) throw badRequest('A nova senha precisa ter ao menos 8 caracteres.')
    if (req.user.passwordHash && !(await bcrypt.compare(current, req.user.passwordHash))) throw badRequest('Senha atual incorreta.')
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(next, 11) } })
    res.json({ ok: true })
  }),
)

// SSO a partir do DentalPos One (aba Marketing).
r.post(
  '/sso/dentalpos',
  ah(async (req, res) => {
    const { user, tenant } = await ssoExchange(String(req.body?.token || ''))
    res.json(sessionPayload(user, tenant, true))
  }),
)

export default r
