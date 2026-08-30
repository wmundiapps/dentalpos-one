import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { getDemoAccess } from '../services/demoAccessService'

export async function me(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      clinicId: true,
      tenantId: true,
      avatar: true,
      clinic: {
        select: {
          name: true,
          displayName: true,
          logo: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          themeMode: true,
          timezone: true,
          plan: true,
        },
      },
    },
  })

  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

  const demo = await getDemoAccess(user.clinicId)
  return res.json({ ...user, demo })
}
