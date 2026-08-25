import { Request, Response } from 'express'
import jwt, { SignOptions } from 'jsonwebtoken'
import {
  createUser,
  getUserByEmail,
  comparePassword
} from '../services/userService'
import { writeAudit } from '../services/auditService'

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

    if (!clinicId || !email || !password) {
      return res.status(400).json({ error: 'Dados obrigatórios não informados.' })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const user = await getUserByEmail(String(clinicId), normalizedEmail)

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' })
    }

    const validPassword = await comparePassword(String(password), user.password)

    if (!validPassword) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' })
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

    return res.json({ token, user: safeUser(user) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro interno do servidor.' })
  }
}

export async function me(_req: Request, res: Response) {
  return res.json({ message: 'Autenticado.' })
}
