import { createHash, randomBytes } from 'crypto'
import { prisma } from '../lib/prisma'
import { hashPassword } from './userService'
import { writeAudit } from './auditService'
import { decryptSecret } from './secretVault'
import { dispatchRevah } from './revahProviderService'
import { HrError } from './hrTimeService'

// Acesso ao ponto: cria o login do colaborador (perfil PONTO, que só abre "Meu ponto")
// e envia por e-mail o link para ele mesmo criar a senha. Ninguém da clínica vê a senha.

type Ctx = { clinicId: string; tenantId: string; actorId?: string }
export const ROLE_PONTO = 'PONTO'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVITE_HOURS = 72

export async function accessStatus(c: Ctx) {
  const emps = await prisma.hREmployee.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId }, select: { id: true, email: true } })
  const emails = emps.map((e) => String(e.email || '').toLowerCase()).filter(Boolean)
  const users = emails.length ? await prisma.user.findMany({ where: { clinicId: c.clinicId, email: { in: emails, mode: 'insensitive' } }, select: { email: true, isActive: true } }) : []
  const porEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.isActive]))
  const out: Record<string, 'OK' | 'SEM_EMAIL' | 'SEM_LOGIN' | 'LOGIN_INATIVO'> = {}
  for (const e of emps) {
    const em = String(e.email || '').toLowerCase()
    out[e.id] = !em ? 'SEM_EMAIL' : !porEmail.has(em) ? 'SEM_LOGIN' : porEmail.get(em) ? 'OK' : 'LOGIN_INATIVO'
  }
  return out
}

async function sendInvite(c: Ctx, user: { id: string; email: string; firstName: string }) {
  const token = randomBytes(32).toString('hex')
  await prisma.passwordResetToken.create({
    data: { clinicId: c.clinicId, userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + INVITE_HOURS * 3600000) },
  })
  const baseRaw = String(process.env.PUBLIC_APP_URL || '').trim() || 'https://app.completodonto.com.br'
  const url = new URL('redefinir-senha', baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`)
  url.searchParams.set('token', token)
  const clinic = await prisma.clinic.findUnique({ where: { id: c.clinicId }, select: { name: true } })

  const sender = await prisma.revahSender.findFirst({ where: { clinicId: c.clinicId, tenantId: c.tenantId, channel: 'EMAIL', isActive: true, isDefault: true } })
  const platformKey = String(process.env.RESEND_API_KEY || '').trim()
  if (!sender && !platformKey) return false
  const creds = sender ? decryptSecret<Record<string, unknown>>(sender.encryptedCredentials) || {} : { apiKey: platformKey }
  const from = sender ? sender.address : 'CompletoDonto <contato@dentalpos.com.br>'
  const r = await dispatchRevah('EMAIL', user.email, [
    `Olá, ${user.firstName}.`,
    '',
    `${clinic?.name || 'A clínica'} liberou o seu acesso ao ponto eletrônico do CompletoDonto.`,
    `Crie a sua senha neste link: ${url.toString()}`,
    '',
    `O link vale por ${INVITE_HOURS} horas. Depois, entre com este e-mail e a sua senha e abra "Meu ponto".`,
  ].join('\n'), { ...creds, subject: 'Seu acesso ao ponto — CompletoDonto' }, from)
  return !r.simulated
}

export async function grantAccess(c: Ctx, employeeId: string, body: any) {
  const emp = await prisma.hREmployee.findFirst({ where: { id: employeeId, clinicId: c.clinicId, tenantId: c.tenantId } })
  if (!emp) throw new HrError(404, 'Colaborador não encontrado.')
  if (['TERMINATED', 'Desligado'].includes(emp.status)) throw new HrError(400, 'Colaborador desligado não recebe acesso ao ponto.')
  const email = String(body?.email || emp.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new HrError(400, 'Informe um e-mail válido do colaborador.')
  if (email !== String(emp.email || '').toLowerCase()) await prisma.hREmployee.update({ where: { id: emp.id }, data: { email } })

  let user = await prisma.user.findFirst({ where: { clinicId: c.clinicId, email: { equals: email, mode: 'insensitive' } } })
  let created = false
  if (user && !user.isActive) throw new HrError(409, 'Já existe um login inativo com este e-mail. Reative-o em Permissões.')
  if (!user) {
    const partes = emp.name.trim().split(/\s+/)
    user = await prisma.user.create({
      data: {
        clinicId: c.clinicId, tenantId: c.tenantId, email,
        password: await hashPassword(randomBytes(24).toString('hex')), // senha inutilizável até ele criar a dele
        firstName: partes[0] || emp.name, lastName: partes.slice(1).join(' ') || '-',
        role: ROLE_PONTO, phone: emp.phone || null,
      },
    })
    created = true
  }
  const emailSent = await sendInvite(c, user).catch(() => false)
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'hr', action: 'TIMECLOCK_ACCESS', entityType: 'HREmployee', entityId: emp.id, summary: `${emp.name}: acesso ao ponto ${created ? 'criado' : 'reenviado'} (${email}).` }).catch(() => undefined)
  return { created, emailSent, email, existingRole: created ? ROLE_PONTO : user.role }
}
