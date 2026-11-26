import { createHash, randomBytes } from 'crypto'
import { Request, Response, NextFunction } from 'express'
import jwt, { SignOptions } from 'jsonwebtoken'
import { prisma } from '../lib/prisma'
import {
  createUser,
  getUserByEmail,
  comparePassword,
  hashPassword
} from '../services/userService'
import { writeAudit } from '../services/auditService'
import { BRAND_NAME } from '../lib/brand'
import { getDemoAccess } from '../services/demoAccessService'
import { decryptSecret } from '../services/secretVault'
import { dispatchRevah } from '../services/revahProviderService'
import { validarSenhaForte } from '../modules/seguranca/senha'
import { registrarEvento, ipDaRequisicao } from '../modules/seguranca/eventos'
import { bloqueioLogin, falhaLogin, sucessoLogin, desafioSegundoFator } from '../modules/seguranca/login'
import { desafioDispositivo } from '../modules/seguranca/dispositivos'
import { checkNewDevice, createSession } from '../services/securityService'
import { issueLoginTicket, readLoginTicket, twoFactorEnabled, verifySecondFactor } from '../services/twoFactorService'

function jwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET não configurado')
  return secret
}

function safeUser<T extends { password?: unknown }>(user: T) {
  const { password: _password, ...safe } = user
  return safe
}

export function generateToken(user: {
  id: string
  email: string
  clinicId: string
  tenantId: string
  role: string
  accessExpiresAt?: Date | null
}, sid?: string) {
  let expiresIn = (process.env.JWT_EXPIRES_IN || '8h') as SignOptions['expiresIn']
  // Acesso de convidado: a sessão nunca passa da data de expiração do acesso.
  if (user.accessExpiresAt) {
    const restante = Math.floor((new Date(user.accessExpiresAt).getTime() - Date.now()) / 1000)
    if (restante > 0) {
      const padrao = typeof expiresIn === 'number' ? expiresIn : 8 * 3600
      expiresIn = Math.min(restante, padrao)
    }
  }
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      clinicId: user.clinicId,
      tenantId: user.tenantId,
      role: user.role,
      ...(sid ? { sid } : {})
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

    const senhaOk = validarSenhaForte(password, { email: String(email), nome: `${firstName} ${lastName}` })
    if (!senhaOk.ok) {
      void registrarEvento({ tenantId: String(tenantId), tipo: 'senha_fraca', ip: ipDaRequisicao(req), detalhe: { rota: 'register' } })
      return res.status(400).json({ error: senhaOk.erro })
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
    }, await createSession({ id: user.id, clinicId: user.clinicId, tenantId: user.tenantId }, req))

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

/** Senha inicial derivada da data de nascimento (DDMMAAAA). Usada no provisionamento de aluno/professor/gestor de polo; troca-se no 1º acesso. */
export function senhaInicialPorNascimento(data: Date): string {
  const d = String(data.getUTCDate()).padStart(2, '0')
  const m = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${d}${m}${data.getUTCFullYear()}`
}

/**
 * Login por identificador alternativo (RA do aluno, via Student.ra; ou nome de usuário do professor/gestor de
 * polo, via User.loginAlt) em vez de e-mail. Resolve para email+clinicId e delega ao login() normal, reaproveitando
 * bloqueio por tentativas, 2FA, aprovação de dispositivo e auditoria — sem duplicar essa lógica de segurança.
 */
export async function resolverIdentificador(req: Request, res: Response, next: NextFunction) {
  try {
    const ra = req.body?.ra ? String(req.body.ra).trim() : ''
    const loginAlt = req.body?.loginAlt ? String(req.body.loginAlt).trim().toLowerCase() : ''
    if (!ra && !loginAlt) return next()

    let userId: string | null = null
    if (ra) {
      const student = await prisma.student.findFirst({ where: { ra } })
      userId = student?.userId ?? null
    } else {
      const user = await prisma.user.findFirst({ where: { loginAlt } })
      userId = user?.id ?? null
    }
    if (!userId) return res.status(401).json({ error: 'Usuário ou senha inválidos.' })

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.isActive) return res.status(401).json({ error: 'Usuário ou senha inválidos.' })

    req.body.email = user.email
    req.body.clinicId = user.clinicId
    next()
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erro interno do servidor.' })
  }
}

// Abre a sessão pelo fluxo de 2FA mais antigo (ticket + /auth/login/2fa, usado pelas clínicas que já tinham
// a verificação em duas etapas configurada antes da aprovação de dispositivo/2FA do EduMaster).
async function finishLogin(req: Request, res: Response, user: any, demo: unknown) {
  // O aviso de aparelho novo olha os logins anteriores, por isso vem antes de registrar este.
  await checkNewDevice({ id: user.id, clinicId: user.clinicId, tenantId: user.tenantId }, req)
  const sid = await createSession({ id: user.id, clinicId: user.clinicId, tenantId: user.tenantId }, req)
  const token = generateToken({
    id: user.id,
    email: user.email,
    clinicId: user.clinicId,
    tenantId: user.tenantId,
    role: user.role
  }, sid)

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
}

export async function login(req: Request, res: Response) {
  try {
    const { clinicId, email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' })
    }

    const normalizedEmail = String(email).trim().toLowerCase()

    // Bloqueio temporário progressivo por e-mail+IP (mensagem genérica; não revela se o e-mail existe).
    const lock = await bloqueioLogin(req, normalizedEmail)
    if (lock.bloqueado) {
      res.setHeader('Retry-After', String(lock.segundos))
      return res.status(429).json({ error: 'Muitas tentativas de acesso. Aguarde alguns minutos antes de tentar novamente.' })
    }

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
      await falhaLogin(req, normalizedEmail, null)
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' })
    }

    const validPassword = await comparePassword(String(password), user.password)

    if (!validPassword) {
      await falhaLogin(req, normalizedEmail, user)
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' })
    }

    if (user.accessExpiresAt && new Date(user.accessExpiresAt).getTime() <= Date.now()) {
      return res.status(403).json({
        code: 'ACCESS_EXPIRED',
        error: 'O período de acesso de convidado terminou. Solicite a renovação à WMundi® Technologies.',
      })
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

    // 2FA ativo (ou exigido pelo papel): o token normal só sai depois do segundo fator.
    const desafio = await desafioSegundoFator(req, user)
    if (desafio) return res.json(desafio)

    // Conta com a verificação em 2 etapas mais antiga (configurada em Configurações > Segurança): idem.
    if (await twoFactorEnabled(user.id)) {
      return res.json({ twoFactorRequired: true, ticket: issueLoginTicket(user.id) })
    }

    // Dispositivo novo (fingerprint do navegador nunca visto para este usuário): aguarda aprovação do dono da conta.
    const desafioDisp = await desafioDispositivo(req, user, req.body?.fingerprint)
    if (desafioDisp) return res.json(desafioDisp)

    // Aviso (não bloqueia) de aparelho/rede novos — cobre quem não usa a aprovação de dispositivo do EduMaster.
    void checkNewDevice({ id: user.id, clinicId: user.clinicId, tenantId: user.tenantId }, req)

    await sucessoLogin(req, normalizedEmail)
    const sid = await createSession({ id: user.id, clinicId: user.clinicId, tenantId: user.tenantId }, req)
    return res.json(await concluirLogin(req, user, demo, undefined, sid))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro interno do servidor.' })
  }
}

/** Emite o token de sessão normal + auditoria. Usado pelo login sem 2FA e por POST /auth/2fa/verify. */
export async function concluirLogin(
  req: Request,
  user: { id: string; email: string; clinicId: string; tenantId: string; role: string; password?: unknown; accessExpiresAt?: Date | null },
  demo: unknown,
  resumo = 'Login realizado com sucesso.',
  sid?: string
) {
  const token = generateToken({
    id: user.id,
    email: user.email,
    clinicId: user.clinicId,
    tenantId: user.tenantId,
    role: user.role,
    accessExpiresAt: user.accessExpiresAt
  }, sid)

  try {
    await writeAudit({
      clinicId: user.clinicId,
      tenantId: user.tenantId,
      actorId: user.id,
      module: 'auth',
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      summary: resumo,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined
    })
  } catch (auditError) {
    console.warn('Falha ao registrar auditoria de login:', auditError)
  }

  return { token, user: safeUser(user), demo }
}

export async function me(_req: Request, res: Response) {
  return res.json({ message: 'Autenticado.' })
}

function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function passwordResetBaseUrl() {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim() || 'https://app.completodonto.com.br'
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
  const addressToUse = sender ? sender.address : `${BRAND_NAME} <contato@dentalpos.com.br>`

  const url = new URL('redefinir-senha', base)
  url.searchParams.set('token', input.token)


  const result = await dispatchRevah(
    'EMAIL',
    input.email,
    [
      `Olá, ${input.firstName}.`,
      '',
      `Recebemos uma solicitação para redefinir sua senha do ${BRAND_NAME}.`,
      `Use este link temporário: ${url.toString()}`,
      '',
      'O link expira em 30 minutos. Se você não solicitou a alteração, ignore esta mensagem.',
    ].join('\n'),
    {
      ...credentialsToUse,
      subject: `Redefinição de senha — ${BRAND_NAME}`,
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

/** Troca de senha autenticada: usada no fluxo normal e, sem exigir a senha atual, na troca obrigatória do 1º acesso (mustChangePassword). */
export async function changePassword(req: Request & { user?: { id: string; email: string; clinicId: string; tenantId: string; role: string } }, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const senhaAtual = req.body?.senhaAtual ? String(req.body.senhaAtual) : ''
    const novaSenha = String(req.body?.novaSenha || '')

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user || !user.isActive) return res.status(404).json({ error: 'Usuário não encontrado.' })

    if (!user.mustChangePassword) {
      if (!senhaAtual) return res.status(400).json({ error: 'Informe a senha atual.' })
      if (!(await comparePassword(senhaAtual, user.password))) {
        return res.status(401).json({ error: 'Senha atual incorreta.' })
      }
    }

    const senhaOk = validarSenhaForte(novaSenha, { email: user.email, nome: `${user.firstName} ${user.lastName}` })
    if (!senhaOk.ok) {
      void registrarEvento({ tenantId: user.tenantId, tipo: 'senha_fraca', ip: ipDaRequisicao(req), detalhe: { rota: 'change-password' } })
      return res.status(400).json({ error: senhaOk.erro })
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(novaSenha), mustChangePassword: false } }),
      prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ])

    try {
      await writeAudit({
        clinicId: user.clinicId, tenantId: user.tenantId, actorId: user.id, module: 'auth', action: 'PASSWORD_CHANGE',
        entityType: 'User', entityId: user.id, summary: 'Senha alterada pelo próprio usuário.', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined,
      })
    } catch {}

    const token = generateToken({ id: user.id, email: user.email, clinicId: user.clinicId, tenantId: user.tenantId, role: user.role, accessExpiresAt: user.accessExpiresAt })
    return res.json({ message: 'Senha alterada com sucesso.', token })
  } catch (error) {
    console.error('Erro ao trocar senha:', error)
    return res.status(500).json({ error: 'Não foi possível trocar a senha.' })
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
    const senhaOk = validarSenhaForte(password)
    if (!senhaOk.ok) {
      void registrarEvento({ tipo: 'senha_fraca', ip: ipDaRequisicao(req), detalhe: { rota: 'password-reset' } })
      return res.status(400).json({ error: senhaOk.erro })
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


// Segundo passo do login: bilhete da senha + código do aplicativo (ou código reserva).
const secondFactorTries = new Map<string, { count: number; until: number }>()

export async function login2fa(req: Request, res: Response) {
  try {
    const userId = readLoginTicket(String(req.body?.ticket || ''))
    if (!userId) return res.status(401).json({ error: 'A confirmação expirou. Entre de novo com e-mail e senha.' })
    const lock = secondFactorTries.get(userId)
    if (lock && lock.until > Date.now()) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' })
    const user = await prisma.user.findFirst({ where: { id: userId, isActive: true } })
    if (!user) return res.status(401).json({ error: 'Usuário ou código inválidos.' })

    const how = await verifySecondFactor(user.id, String(req.body?.code || ''))
    if (!how) {
      const f = secondFactorTries.get(userId) || { count: 0, until: 0 }
      f.count += 1
      if (f.count >= 5) { f.until = Date.now() + 10 * 60 * 1000; f.count = 0 }
      secondFactorTries.set(userId, f)
      return res.status(401).json({ error: 'Código não confere. Digite o código que aparece agora no aplicativo.' })
    }
    secondFactorTries.delete(userId)

    const demo = await getDemoAccess(user.clinicId)
    if (demo.isDemo && demo.phase === 'ENDED') {
      return res.status(403).json({ code: 'DEMO_ENDED', error: 'A demonstração gratuita foi encerrada. Seus dados permanecem preservados. Solicite uma proposta para reativar o acesso.', demo })
    }
    if (how === 'backup') console.warn(`Login com código reserva de 2 etapas: usuário ${user.id}`)
    return finishLogin(req, res, user, demo)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro interno do servidor.' })
  }
}
