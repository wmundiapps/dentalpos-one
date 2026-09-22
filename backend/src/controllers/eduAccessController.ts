import { createHash, randomBytes } from 'crypto'
import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { createUser } from '../services/userService'
import { decryptSecret } from '../services/secretVault'
import { dispatchRevah } from '../services/revahProviderService'
import { activateStudentAccessSchema } from '../validators/eduAccessValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function activationBaseUrl() {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim() || 'https://app.dentalpos.com.br'
  return configured.endsWith('/') ? configured : `${configured}/`
}

// Reaproveita o mesmo mecanismo de token do fluxo de "esqueci minha
// senha" (PasswordResetToken + /auth/password-reset/confirm) em vez de
// inventar um fluxo de convite novo. Falha graciosamente sem canal de
// e-mail configurado: devolve o link para a secretaria copiar/repassar.
async function deliverActivationEmail(input: { clinicId: string; tenantId: string; email: string; firstName: string; token: string }) {
  const sender = await prisma.revahSender.findFirst({
    where: { clinicId: input.clinicId, tenantId: input.tenantId, channel: 'EMAIL', isActive: true, isDefault: true }
  })
  const platformKey = String(process.env.RESEND_API_KEY || '').trim()
  if (!sender && !platformKey) return false

  const credentialsToUse = sender ? decryptSecret<Record<string, unknown>>(sender.encryptedCredentials) || {} : { apiKey: platformKey }
  const addressToUse = sender ? sender.address : 'DentalPos One <contato@dentalpos.com.br>'

  const url = new URL('redefinir-senha', activationBaseUrl())
  url.searchParams.set('token', input.token)

  const result = await dispatchRevah(
    'EMAIL', input.email,
    [
      `Olá, ${input.firstName}.`,
      '',
      'Seu acesso ao portal do aluno foi liberado.',
      `Defina sua senha neste link: ${url.toString()}`,
      '',
      'O link expira em 24 horas. Se você não esperava este e-mail, ignore-o.'
    ].join('\n'),
    { ...credentialsToUse, subject: 'Acesso liberado — Portal do Aluno' },
    addressToUse
  )
  return !result.simulated
}

// Cria (ou reaproveita) o login do aluno e envia o link de ativação.
// Idempotente: chamar de novo para um aluno já ativado apenas reenvia
// um novo link de definição de senha.
export async function activateStudentAccess(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const studentId = String(req.params.id)
    const student = await prisma.eduStudent.findFirst({ where: { id: studentId, clinicId, tenantId } })
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado.' })

    const parsed = activateStudentAccessSchema.safeParse(req.body || {})
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const email = parsed.data.email || student.email
    if (!email) return res.status(400).json({ error: 'Informe um e-mail para o acesso do aluno.' })

    let user = student.userId ? await prisma.user.findUnique({ where: { id: student.userId } }) : null

    if (!user) {
      user = await prisma.user.findUnique({ where: { clinicId_email: { clinicId, email } } })
      if (user && user.role !== 'STUDENT') {
        return res.status(409).json({ error: 'Já existe um usuário da equipe com este e-mail. Use outro e-mail para o acesso do aluno.' })
      }
      if (!user) {
        const [firstName, ...rest] = student.fullName.trim().split(' ')
        user = await createUser({
          clinicId, tenantId, email, password: randomBytes(24).toString('hex'),
          firstName: firstName || student.fullName, lastName: rest.join(' ') || '-', role: 'STUDENT', isActive: true
        })
      }
      await prisma.eduStudent.update({ where: { id: studentId }, data: { userId: user.id } })
    }

    const token = randomBytes(32).toString('hex')
    await prisma.passwordResetToken.create({
      data: { clinicId, userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
    })

    let delivered = false
    if (parsed.data.sendEmail) {
      try {
        delivered = await deliverActivationEmail({ clinicId, tenantId, email: user.email, firstName: user.firstName, token })
      } catch (deliveryError) {
        console.warn('Falha ao entregar e-mail de ativação do aluno:', deliveryError)
      }
    }

    const activationUrl = new URL('redefinir-senha', activationBaseUrl())
    activationUrl.searchParams.set('token', token)

    await writeAudit({
      clinicId, tenantId, actorId, module: 'edu', action: 'EDU_STUDENT_ACCESS_ACTIVATE', entityType: 'EduStudent', entityId: studentId,
      summary: `Acesso ao portal liberado para ${student.fullName}${delivered ? ' (e-mail enviado)' : ' (link gerado manualmente)'}.`
    })

    return res.status(201).json({ userId: user.id, email: user.email, delivered, activationUrl: activationUrl.toString() })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao ativar acesso do aluno.' })
  }
}
