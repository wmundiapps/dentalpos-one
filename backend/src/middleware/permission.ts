import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'
import { getUserPermissionCodes } from '../services/permissionService'
import {
  evaluateDemoPermission,
  getDemoAccess,
} from '../services/demoAccessService'

export function requirePermission(code: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })

      const demo = await getDemoAccess(req.user.clinicId)
      const demoDecision = evaluateDemoPermission(demo, code)

      if (!demoDecision.allowed) {
        return res.status(403).json({
          code: demoDecision.code,
          error: demoDecision.error,
          demo,
        })
      }

      if (req.user.role === 'ADMIN') return next()

      const permissions = await getUserPermissionCodes(req.user.id)
      if (!permissions.includes(code)) {
        return res.status(403).json({ error: 'Acesso não autorizado para esta funcionalidade.' })
      }

      return next()
    } catch (error) {
      return next(error)
    }
  }
}
