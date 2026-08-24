import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'
import { getUserPermissionCodes } from '../services/permissionService'

export function requirePermission(code: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    if (req.user.role === 'ADMIN') return next()
    const permissions = await getUserPermissionCodes(req.user.id)
    if (!permissions.includes(code)) return res.status(403).json({ error: 'Acesso não autorizado para esta funcionalidade.' })
    return next()
  }
}
