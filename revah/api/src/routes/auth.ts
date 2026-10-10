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
import {
  confirmSetup,
  disableTwoFactor,
  issueLoginTicket,
  readLoginTicket,
  regenerateBackupCodes,
  startSetup,
  twoFactorEnabled,
  verifySecondFactor,
} from '../services/twoFactor'

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
    user: { id: user.id, name: user.name, email: user.email, role: user.role, twoFactorEnabled: twoFactorEnabled(user) },
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

// Cadastro = empresa criada; os 14 dias grátis começam ao cadastrar a forma de pagamento.
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
        // Quem já usou o teste (e-mail/telefone/documento) não ganha novos 14 dias.
        status: 'PENDING_PAYMENT',
        trialEligible: !reused,
      },
    })
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, name: b.name, email, passwordHash: await bcrypt.hash(b.password, 11), role: 'OWNER', lastLoginAt: new Date() },
    })
    if (!reused) await prisma.trialRegistry.createMany({ data: keys.map((key) => ({ key, tenantId: tenant.id })), skipDuplicates: true })
    await audit(tenant.id, user.id, 'REGISTER', 'Tenant', tenant.id, { trialReused: Boolean(reused) })
    await Promise.all([
      sendSystemEmail(
        email,
        'Bem-vindo ao REVAH',
        `Olá, ${b.name}!\n\nSua conta ${companyName} foi criada no REVAH.\n\n` +
          (reused
            ? 'Este e-mail, telefone ou documento já usou o teste grátis antes; para disparar campanhas, escolha um plano em Assinatura.\n\n'
            : 'Para começar seus 14 dias grátis, escolha o plano e cadastre a forma de pagamento em Assinatura. Se cancelar antes do fim do teste, não há cobrança.\n\n') +
          `Acesse: ${config.appUrl}/login\nE-mail de acesso: ${email}\n\nSe não foi você quem criou esta conta, responda este e-mail.`,
      ),
      sendSystemEmail(
        config.systemEmail.adminNotify,
        `REVAH: nova conta criada — ${companyName}`,
        `Nova conta no REVAH.\n\nEmpresa: ${companyName}\nNome: ${b.name}\nE-mail: ${email}\nTelefone: ${phone || 'não informado'}\nDocumento: ${document || 'não informado'}\nTeste grátis: ${reused ? 'já usado antes (sem novo teste)' : '14 dias, disponível'}\nData: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      ),
    ]).catch((e) => console.error('[revah] e-mails de cadastro', e))
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
    // Com 2 etapas ativa, a senha só libera um bilhete de 5 minutos para o passo do código.
    if (twoFactorEnabled(user)) return res.json({ twoFactorRequired: true, ticket: issueLoginTicket(user.id) })
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    res.json(sessionPayload(user, user.tenant))
  }),
)

// Segundo passo do login: código do aplicativo autenticador ou um código reserva.
r.post(
  '/2fa/login',
  ah(async (req, res) => {
    const userId = readLoginTicket(String(req.body?.ticket || ''))
    if (!userId) throw new HttpError(401, 'O tempo para digitar o código acabou. Entre com a senha de novo.', 'TWO_FACTOR_EXPIRED')
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { tenant: true } })
    if (!user || !user.isActive) throw new HttpError(401, 'Usuário inválido.', 'UNAUTHENTICATED')
    const { tenant, ...plain } = user
    const how = await verifySecondFactor(plain as any, String(req.body?.code || ''))
    if (!how) {
      await audit(user.tenantId, user.id, 'AUTH_2FA_FAILED', 'User', user.id)
      throw new HttpError(401, 'Código não confere. Digite o código que aparece agora no aplicativo.', 'TWO_FACTOR_INVALID')
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    if (how === 'backup') await audit(user.tenantId, user.id, 'AUTH_2FA_BACKUP_USED', 'User', user.id)
    const fresh = await prisma.user.findUnique({ where: { id: user.id } })
    res.json({ ...sessionPayload(fresh, tenant), usedBackupCode: how === 'backup', backupCodesLeft: fresh?.totpBackupHashes.length ?? 0 })
  }),
)

// Ativar, desativar e renovar códigos reserva (Configurações → Segurança).
r.get(
  '/2fa',
  requireAuth,
  ah(async (req: AuthedRequest, res) => {
    res.json({ enabled: twoFactorEnabled(req.user), enabledAt: req.user.totpEnabledAt, backupCodesLeft: req.user.totpBackupHashes.length })
  }),
)

r.post(
  '/2fa/setup',
  requireAuth,
  ah(async (req: AuthedRequest, res) => {
    if (twoFactorEnabled(req.user)) throw conflict('A verificação em 2 etapas já está ativa.')
    res.json(await startSetup(req.user))
  }),
)

r.post(
  '/2fa/enable',
  requireAuth,
  ah(async (req: AuthedRequest, res) => {
    const code = String(req.body?.code || '').trim()
    if (!/^\d{6}$/.test(code)) throw badRequest('O código tem 6 números.')
    if (twoFactorEnabled(req.user)) throw conflict('A verificação em 2 etapas já está ativa.')
    if (!req.user.totpPending) throw badRequest('Comece pelo botão "Ativar".')
    const codes = await confirmSetup(req.user, code)
    if (!codes) throw badRequest('Código não confere. Confira a hora do celular e digite o código que aparece agora.')
    await audit(req.tenant.id, req.user.id, 'AUTH_2FA_ENABLED', 'User', req.user.id)
    res.json({ backupCodes: codes })
  }),
)

r.post(
  '/2fa/disable',
  requireAuth,
  ah(async (req: AuthedRequest, res) => {
    if (!twoFactorEnabled(req.user)) throw conflict('A verificação em 2 etapas não está ativa.')
    const passwordOk = req.user.passwordHash ? await bcrypt.compare(String(req.body?.password || ''), req.user.passwordHash) : false
    if (!passwordOk || !(await verifySecondFactor(req.user, String(req.body?.code || '')))) throw badRequest('Senha ou código não conferem.')
    await disableTwoFactor(req.user.id)
    await audit(req.tenant.id, req.user.id, 'AUTH_2FA_DISABLED', 'User', req.user.id)
    res.json({ ok: true })
  }),
)

r.post(
  '/2fa/backup-codes',
  requireAuth,
  ah(async (req: AuthedRequest, res) => {
    if ((await verifySecondFactor(req.user, String(req.body?.code || ''))) !== 'totp') throw badRequest('Digite o código que aparece agora no aplicativo.')
    const codes = await regenerateBackupCodes(req.user.id)
    await audit(req.tenant.id, req.user.id, 'AUTH_2FA_BACKUP_REGENERATED', 'User', req.user.id)
    res.json({ backupCodes: codes })
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
    // Trocar a senha pelo e-mail não pula a 2 etapas.
    if (twoFactorEnabled(user)) return res.json({ twoFactorRequired: true, ticket: issueLoginTicket(user.id) })
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
