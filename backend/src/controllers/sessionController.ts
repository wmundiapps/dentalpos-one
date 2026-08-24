import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

export async function me(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, clinicId: true, tenantId: true, avatar: true, clinic: { select: { name: true, displayName: true, logo: true, primaryColor: true, secondaryColor: true, accentColor: true, themeMode: true, timezone: true } } }
  })
  return res.json(user)
}
