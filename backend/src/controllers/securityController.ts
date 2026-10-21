import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { clientInfo, describeDevice, describePlace, forgetSession } from '../services/securityService'

const isManager = async (userId: string, role: string) => {
  if (role === 'ADMIN') return true
  const rows = await prisma.userAccessProfile.findMany({ where: { userId, profile: { isActive: true, code: 'GESTOR' } }, select: { userId: true }, take: 1 }).catch(() => [])
  return rows.length > 0
}

// Sessões ativas: cada pessoa vê as suas e pode encerrar; gestor e administrador veem e encerram as de toda a clínica.
export async function list(req: AuthRequest, res: Response) {
  try {
    const manager = await isManager(req.user!.id, req.user!.role)
    const all = manager && req.query.all === '1'
    const rows = await prisma.userSession.findMany({
      where: { revokedAt: null, lastSeenAt: { gte: new Date(Date.now() - 30 * 86400000) }, ...(all ? { clinicId: req.user!.clinicId } : { userId: req.user!.id }) },
      orderBy: { lastSeenAt: 'desc' }, take: 200,
    })
    const users = all ? await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, firstName: true, lastName: true, email: true } }) : []
    const name = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]))
    return res.json({
      canManage: manager,
      sessions: rows.map((r) => ({
        id: r.id, userName: name.get(r.userId) || null, current: r.id === req.user!.sid,
        device: describeDevice(r.userAgent), place: describePlace(r), ip: r.lastIp || r.ip,
        createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, anomaly: Boolean(r.anomalyAt),
      })),
    })
  } catch {
    return res.json({ canManage: false, sessions: [], unavailable: true })
  }
}

async function revokeWhere(req: AuthRequest, where: Record<string, unknown>, summary: string) {
  const r = await prisma.userSession.updateMany({ where: { revokedAt: null, ...where }, data: { revokedAt: new Date(), revokedBy: req.user!.id } })
  const info = clientInfo(req)
  await writeAudit({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, module: 'auth', action: 'SESSION_REVOKED', summary, ipAddress: info.ip || undefined, userAgent: info.userAgent || undefined }).catch(() => undefined)
  return r.count
}

export async function revoke(req: AuthRequest, res: Response) {
  const id = String(req.params.id)
  const s = await prisma.userSession.findUnique({ where: { id } })
  if (!s || s.clinicId !== req.user!.clinicId) return res.status(404).json({ error: 'Sessão não encontrada.' })
  if (s.userId !== req.user!.id && !(await isManager(req.user!.id, req.user!.role))) return res.status(403).json({ error: 'Só o gestor ou o administrador encerram a sessão de outra pessoa.' })
  const n = await revokeWhere(req, { id }, `Sessão encerrada (${describeDevice(s.userAgent)}, ${describePlace(s)}).`)
  forgetSession(id)
  return res.json({ ok: true, revoked: n })
}

export async function revokeOthers(req: AuthRequest, res: Response) {
  const n = await revokeWhere(req, { userId: req.user!.id, ...(req.user!.sid ? { id: { not: req.user!.sid } } : {}) }, 'Todas as outras sessões da própria conta foram encerradas.')
  return res.json({ ok: true, revoked: n })
}
