import { createHash, randomBytes } from 'crypto'
import { Request, Response } from 'express'
import jwt, { SignOptions } from 'jsonwebtoken'
import { prisma } from '../lib/prisma'
import {
  createUser,
  getUserByEmail,
  comparePassword,
  hashPassword
} from '../services/userService'
import { writeAudit } from '../services/auditService'
import { getDemoAccess } from '../services/demoAccessService'
import { decryptSecret } from '../services/secretVault'
import { dispatchRevah } from '../services/revahProviderService'

function jwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET não configurado')
  return secret
}

function safeUser<T extends { password?: unknown }>(user: T) {
  const { password: _password, ...safe } = user
  return safe
}

function generateToken(user: {
  id: string
  email: string
  clinicId: string
  tenantId: string
  role: string
}) {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '8h') as SignOptions['expiresIn']
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      clinicId: user.clinicId,
      tenantId: user.tenantId,
      role: user.role
    },
    jwtSecret(),
    { expiresIn }
  )
}

export async function register(req: Request, res: Response) {
  try {
    if (process.env.ALLOW_PUBLIC_REGISTRATION !== 'true') {
      return res.status(403).json({ error: 'Cadastro público desabilitado.' })
    }

    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      clinicId,
      tenantId
    } = req.body

    if (!firstName || !lastName || !email || !password || !clinicId || !tenantId) {
      return res.status(400).json({ error: 'Dados obrigatórios não informados.' })
    }

    if (String(password).length < 10) {
      return res.status(400).json({ error: 'A senha deve possuir pelo menos 10 caracteres.' })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const exists = await getUserByEmail(clinicId, normalizedEmail)

    if (exists) {
      return res.status(409).json({ error: 'E-mail já cadastrado.' })
    }

    const user = await createUser({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: normalizedEmail,
      password,
      phone,
      clinicId,
      tenantId,
      role: 'USER',
      isActive: true
    })

    const token = generateToken({
      id: user.id,
      email: user.email,
      clinicId: user.clinicId,
      tenantId: user.tenantId,
      role: user.role
    })

    return res.status(201).json({
      message: 'Usuário criado com sucesso.',
      token,
      user: safeUser(user)
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro interno do servidor.' })
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { clinicId, email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    let user

    if (clinicId) {
      user = await getUserByEmail(String(clinicId), normalizedEmail)
    } else {
      const matches = await prisma.user.findMany({
        where: { email: normalizedEmail, isActive: true },
        take: 3,
        orderBy: { createdAt: 'asc' },
      })

      if (matches.length > 1) {
        return res.status(409).json({
          code: 'CLINIC_ID_REQUIRED',
          error:
            'Este e-mail está vinculado a mais de uma clínica. Informe também o ID da clínica.',
        })
      }

      user = matches[0]
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' })
    }

    const validPassword = await comparePassword(String(password), user.password)

    if (!validPassword) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' })
    }

    const demo = await getDemoAccess(user.clinicId)
    if (demo.isDemo && demo.phase === 'ENDED') {
      return res.status(403).json({
        code: 'DEMO_ENDED',
        error:
          'A demonstração gratuita foi encerrada. Seus dados permanecem preservados. Solicite uma proposta para reativar o acesso.',
        demo,
      })
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      clinicId: user.clinicId,
      tenantId: user.tenantId,
      role: user.role
    })

    try {
      await writeAudit({
        clinicId: user.clinicId,
        tenantId: user.tenantId,
        actorId: user.id,
        module: 'auth',
        action: 'LOGIN',
        entityType: 'User',
        entityId: user.id,
        summary: 'Login realizado com sucesso.',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || undefined
      })
    } catch (auditError) {
      console.warn('Falha ao registrar auditoria de login:', auditError)
    }

    return res.json({ token, user: safeUser(user), demo })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro interno do servidor.' })
  }
}

export async function me(_req: Request, res: Response) {
  return res.json({ message: 'Autenticado.' })
}

function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function passwordResetBaseUrl() {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim()
  if (!configured) return ''
  return configured.endsWith('/') ? configured : `${configured}/`
}

async function deliverPasswordReset(input: {
  clinicId: string
  tenantId: string
  email: string
  firstName: string
  token: string
}) {
  const sender = await prisma.revahSender.findFirst({
    where: {
      clinicId: input.clinicId,
      tenantId: input.tenantId,
      channel: 'EMAIL',
      isActive: true,
      isDefault: true,
    },
  })
  if (!sender) return false

  const base = passwordResetBaseUrl()
  if (!base) return false

  const url = new URL('redefinir-senha', base)
  url.searchParams.set('token', input.token)

  const credentials = decryptSecret<Record<string, unknown>>(sender.encryptedCredentials) || {}
  const result = await dispatchRevah(
    'EMAIL',
    input.email,
    [
      `Olá, ${input.firstName}.`,
      '',
      'Recebemos uma solicitação para redefinir sua senha do DentalPos One.',
      `Use este link temporário: ${url.toString()}`,
      '',
      'O link expira em 30 minutos. Se você não solicitou a alteração, ignore esta mensagem.',
    ].join('\n'),
    {
      ...credentials,
      subject: 'Redefinição de senha — DentalPos One',
    },
    sender.address,
  )

  return !result.simulated
}

export async function requestPasswordReset(req: Request, res: Response) {
  const generic = {
    message:
      'Se o e-mail estiver vinculado a uma conta elegível, enviaremos as instruções de redefinição.',
  }

  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const clinicId = String(req.body?.clinicId || '').trim()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.json(generic)
    }

    const matches = await prisma.user.findMany({
      where: {
        email,
        isActive: true,
        ...(clinicId ? { clinicId } : {}),
      },
      take: 2,
      orderBy: { createdAt: 'asc' },
    })

    // Sem clinicId, mais de uma clínica não deve revelar qual conta existe.
    if (matches.length !== 1) return res.json(generic)

    const user = matches[0]
    const token = randomBytes(32).toString('hex')
    const tokenHash = hashResetToken(token)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

    await prisma.passwordResetToken.create({
      data: {
        clinicId: user.clinicId,
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    })

    try {
      await deliverPasswordReset({
        clinicId: user.clinicId,
        tenantId: user.tenantId,
        email: user.email,
        firstName: user.firstName,
        token,
      })
    } catch (deliveryError) {
      console.warn('Falha ao entregar e-mail de redefinição:', deliveryError)
    }

    try {
      await writeAudit({
        clinicId: user.clinicId,
        tenantId: user.tenantId,
        actorId: user.id,
        module: 'auth',
        action: 'PASSWORD_RESET_REQUEST',
        entityType: 'User',
        entityId: user.id,
        summary: 'Solicitação de redefinição de senha registrada.',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || undefined,
      })
    } catch {}

    return res.json(generic)
  } catch (error) {
    console.error('Erro na solicitação de redefinição:', error)
    return res.json(generic)
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const token = String(req.body?.token || '').trim()
    const password = String(req.body?.password || '')

    if (!token || password.length < 10) {
      return res.status(400).json({
        error: 'Token válido e senha com pelo menos 10 caracteres são obrigatórios.',
      })
    }

    const tokenHash = hashResetToken(token)
    const row = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    })

    if (!row || !row.user.isActive) {
      return res.status(400).json({
        error: 'Este link é inválido ou expirou. Solicite uma nova redefinição.',
      })
    }

    const passwordHash = await hashPassword(password)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { password: passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ])

    try {
      await writeAudit({
        clinicId: row.user.clinicId,
        tenantId: row.user.tenantId,
        actorId: row.user.id,
        module: 'auth',
        action: 'PASSWORD_RESET_CONFIRM',
        entityType: 'User',
        entityId: row.user.id,
        summary: 'Senha redefinida; sessões anteriores foram revogadas.',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || undefined,
      })
    } catch {}

    return res.json({ message: 'Senha redefinida com sucesso.' })
  } catch (error) {
    console.error('Erro ao redefinir senha:', error)
    return res.status(500).json({ error: 'Não foi possível redefinir a senha.' })
  }
}
