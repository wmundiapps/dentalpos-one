import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import {
  createUser,
  getUserByEmail,
  comparePassword
} from '../services/userService'

const JWT_SECRET = process.env.JWT_SECRET || ''

function generateToken(user: {
  id: string
  email: string
  clinicId: string
  tenantId: string
  role: string
}) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      clinicId: user.clinicId,
      tenantId: user.tenantId,
      role: user.role
    },
    JWT_SECRET,
    {
      expiresIn: '7d'
    }
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

    if (
      !firstName ||
      !lastName ||
      !email ||
      !password ||
      !clinicId ||
      !tenantId
    ) {
      return res.status(400).json({
        error: 'Dados obrigatórios não informados.'
      })
    }

    const exists = await getUserByEmail(clinicId, email)

    if (exists) {
      return res.status(409).json({
        error: 'E-mail já cadastrado.'
      })
    }

    const user = await createUser({
      firstName,
      lastName,
      email,
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
      user
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro interno do servidor.'
    })
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { clinicId, email, password } = req.body

    if (!clinicId || !email || !password) {
      return res.status(400).json({
        error: 'Dados obrigatórios não informados.'
      })
    }

    const user = await getUserByEmail(clinicId, email)

    if (!user) {
      return res.status(401).json({
        error: 'Usuário ou senha inválidos.'
      })
    }

    if (!user.isActive) {
      return res.status(403).json({
        error: 'Usuário desativado.'
      })
    }

    const validPassword = await comparePassword(
      password,
      user.password
    )

    if (!validPassword) {
      return res.status(401).json({
        error: 'Usuário ou senha inválidos.'
      })
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      clinicId: user.clinicId,
      tenantId: user.tenantId,
      role: user.role
    })

    return res.json({
      token,
      user
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erro interno do servidor.'
    })
  }
}

export async function me(req: Request, res: Response) {
  return res.json({
    message: 'Autenticado.'
  })
}
