import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'

export const tenantMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.tenantId || !req.user?.clinicId) {
    return res.status(401).json({ error: 'Contexto de clínica/tenant inválido.' })
  }

  const requestedTenant = req.headers['x-tenant-id'] as string | undefined
  const requestedClinic = req.headers['x-clinic-id'] as string | undefined

  if (requestedTenant && requestedTenant !== req.user.tenantId) {
    return res.status(403).json({ error: 'Tenant não autorizado.' })
  }

  if (requestedClinic && requestedClinic !== req.user.clinicId) {
    return res.status(403).json({ error: 'Clínica não autorizada.' })
  }

  return next()
}

export default tenantMiddleware
