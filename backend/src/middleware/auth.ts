import { Request, Response, NextFunction } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { logSensitiveAccess, sessionRevoked } from '../services/securityService'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    clinicId: string
    tenantId: string
    role: string
    sid?: string
  }
}

interface TokenPayload extends JwtPayload {
  id: string
  email: string
  clinicId: string
  tenantId: string
  role: string
  sid?: string
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Token não fornecido'
    })
  }

  const token = authHeader.split(' ')[1]

  try {
    const secret = process.env.JWT_SECRET

    if (!secret) {
      return res.status(500).json({
        error: 'JWT_SECRET não configurado'
      })
    }

    const decoded = jwt.verify(token, secret) as TokenPayload

    req.user = {
      id: decoded.id,
      email: decoded.email,
      clinicId: decoded.clinicId,
      tenantId: decoded.tenantId,
      role: decoded.role,
      sid: decoded.sid
    }

    if (decoded.sid && (await sessionRevoked(decoded.sid, req, decoded.id))) {
      return res.status(401).json({ error: 'Sessão encerrada. Entre novamente.' })
    }
    logSensitiveAccess(req, req.user)

    return next()
  } catch {
    return res.status(401).json({
      error: 'Token inválido ou expirado'
    })
  }
}
