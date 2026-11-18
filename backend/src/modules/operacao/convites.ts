import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { enviarConviteAcesso } from '../seguranca/convite'
import { HR, Req, asyncHandler, audit, getTenantId, getUserId, requireRole, txt } from './util'

// Enviar (ou reenviar) o convite para definir a senha: a usuários escolhidos ou a todos os que ainda não entraram. /api/edu/convites
const router = Router()
router.post('/', requireRole(HR, 'SECRETARY', 'SUPPORT'), asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req)
  const ids: string[] = Array.isArray(req.body?.userIds) ? req.body.userIds.map((x: unknown) => txt(x, 60)) : []
  const users = await prisma.user.findMany({ where: { tenantId, isActive: true, ...(ids.length ? { id: { in: ids } } : { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }) }, take: 500 })
  for (const u of users) await enviarConviteAcesso(u, req.body?.instituicao ? txt(req.body.instituicao, 80) : undefined)
  await audit({ tenantId, userId: getUserId(req), modulo: 'convites', acao: 'ENVIO', detalhes: { total: users.length } })
  res.json({ enviados: users.length })
}))
export default router
