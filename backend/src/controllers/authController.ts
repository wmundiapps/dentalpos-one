import { createHash, createHmac, randomBytes } from 'crypto'
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
import { validatePassword } from '../utils/passwordPolicy'
import { checkSecondFactor, getSecurity, isLocked, recordFailure, recordSuccess } from '../services/userSecurityService'
import { dispatchRevah } from '../services/revahProviderService'

function jwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET não configurado')
  return secret
}

// Desafio da 2ª etapa: JWT curto (5 min) assinado com chave DERIVADA — nunca é aceito como token de sessão.
const challengeKey = () => createHmac('sha256', jwtSecret()).update('login-2fa-challenge').digest('hex')
function signChallenge(userId: string) {
  return jwt.sign({ uid: userId, purpose: '2fa' }, challengeKey(), { expiresIn: '5m', algorithm: 'HS256' })
}
function readChallenge(token: string): string | null {
  try {
    const d = jwt.verify(token, challengeKey(), { algorithms: ['HS256'] }) as { uid?: string; purpose?: string }
    return d.purpose === '2fa' && typeof d.uid === 'string' ? d.uid : null
  } catch {
    return null
  }
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
    { expiresIn, algorithm: 'HS256' }
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

    const pwProblem = validatePassword(String(password), [String(email), String(firstName), String(lastName)])
    if (pwProblem) {
      return res.status(400).json({ error: pwProblem })
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

    // bloqueio progressivo por conta (5 falhas → 5 min, dobrando até 60 min)
    let sec: Awaited<ReturnType<typeof getSecurity>> | null = null
    try {
      sec = await getSecurity(user.id)
    } catch (e) {
      console.warn('UserSecurity indisponível (aplique a migração 20261004_seguranca_2fa.sql):', e)
    }
    if (sec && isLocked(sec)) {
      const min = Math.max(1, Math.ceil((sec.lockedUntil!.getTime() - Date.now()) / 60000))
      return res.status(423).json({ code: 'ACCOUNT_LOCKED', error: `Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em ${min} min.` })
    }

    const validPassword = await comparePassword(String(password), user.password)

    if (!validPassword) {
      if (sec) await recordFailure(user.id).catch(() => undefined)
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' })
    }

    if (sec?.totpEnabled) {
      return res.json({ twoFactorRequired: true, challenge: signChallenge(user.id) })
    }
    if (sec) await recordSuccess(user.id).catch(() => undefined)

    return finishLogin(req, res, user)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro interno do servidor.' })
  }
}

/** Segunda etapa do login: confirma o código do app autenticador (ou de recuperação) e emite o token. */
export async function loginTwoFactor(req: Request, res: Response) {
  try {
    const challenge = String(req.body?.challenge || '')
    const code = String(req.body?.code || '')
    const userId = readChallenge(challenge)
    if (!userId || !code) return res.status(401).json({ code: 'CHALLENGE_INVALID', error: 'Sessão de verificação expirada. Entre novamente.' })

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.isActive) return res.status(401).json({ error: 'Usuário ou senha inválidos.' })

    const sec = await getSecurity(user.id)
    if (isLocked(sec)) return res.status(423).json({ code: 'ACCOUNT_LOCKED', error: 'Conta temporariamente bloqueada por excesso de tentativas.' })

    const how = await checkSecondFactor(user.id, code)
    if (!how) {
      await recordFailure(user.id).catch(() => undefined)
      return res.status(401).json({ error: 'Código inválido.' })
    }
    await recordSuccess(user.id).catch(() => undefined)
    return finishLogin(req, res, user, how === 'backup' ? 'Login com 2FA (código de recuperação).' : 'Login com 2FA realizado.')
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro interno do servidor.' })
  }
}

async function finishLogin(
  req: Request,
  res: Response,
  user: { id: string; email: string; clinicId: string; tenantId: string; role: string; password: string },
  summary = 'Login realizado com sucesso.',
) {
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
    role: user.role,
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
      summary,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
    })
  } catch (auditError) {
    console.warn('Falha ao registrar auditoria de login:', auditError)
  }

  return res.json({ token, user: safeUser(user), demo })
}

export async function me(_req: Request, res: Response) {
  return res.json({ message: 'Autenticado.' })
}

function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function passwordResetBaseUrl() {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim() || 'https://app.dentalpos.com.br'
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
  const base = passwordResetBaseUrl()

  // Recuperacao de senha NUNCA pode depender de a clinica ter configurado canal.
  // Sem remetente proprio, o envio sai pela conta da plataforma (WMundi).
  const platformKey = String(process.env.RESEND_API_KEY || '').trim()
  if (!sender && !platformKey) {
    console.error('RESEND_API_KEY ausente: e-mail de redefinicao nao enviado.')
    return false
  }
  const credentialsToUse = sender
    ? decryptSecret<Record<string, unknown>>(sender.encryptedCredentials) || {}
    : { apiKey: platformKey }
  const addressToUse = sender ? sender.address : 'DentalPos One <contato@dentalpos.com.br>'

  const url = new URL('redefinir-senha', base)
  url.searchParams.set('token', input.token)


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
      ...credentialsToUse,
      subject: 'Redefinição de senha — DentalPos One',
    },
    addressToUse,
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

    const resetProblem = validatePassword(password)
    if (!token || resetProblem) {
      return res.status(400).json({
        error: resetProblem || 'Token válido e senha são obrigatórios.',
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
