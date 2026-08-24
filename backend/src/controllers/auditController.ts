import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

export async function index(req: AuthRequest, res: Response) {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const logs = await prisma.auditLog.findMany({
    where: { clinicId: req.user!.clinicId },
    include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' }, take: limit
  })
  return res.json(logs)
}
