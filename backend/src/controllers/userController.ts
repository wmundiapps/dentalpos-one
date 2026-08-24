import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { createUser, updateUser, deleteUser } from '../services/userService'
import { writeAudit } from '../services/auditService'

const publicUserSelect = {
  id: true, clinicId: true, tenantId: true, email: true, firstName: true, lastName: true,
  role: true, phone: true, avatar: true, isActive: true, createdAt: true, updatedAt: true
}

export async function index(req: AuthRequest, res: Response) {
  const users = await prisma.user.findMany({
    where: { clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, isActive: true },
    select: publicUserSelect,
    orderBy: { firstName: 'asc' }
  })
  return res.json(users)
}

export async function show(req: AuthRequest, res: Response) {
  const user = await prisma.user.findFirst({
    where: { id: String(req.params.id), clinicId: req.user!.clinicId, tenantId: req.user!.tenantId },
    select: publicUserSelect
  })
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
  return res.json(user)
}

export async function store(req: AuthRequest, res: Response) {
  const payload = { ...req.body, clinicId: req.user!.clinicId, tenantId: req.user!.tenantId }
  const user = await createUser(payload)
  await writeAudit({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, module: 'users', action: 'create', entityType: 'User', entityId: user.id, afterData: { ...user, password: undefined } })
  const { password, ...safe } = user
  return res.status(201).json(safe)
}

export async function update(req: AuthRequest, res: Response) {
  const id = String(req.params.id)
  const before = await prisma.user.findFirst({ where: { id, clinicId: req.user!.clinicId, tenantId: req.user!.tenantId } })
  if (!before) return res.status(404).json({ error: 'Usuário não encontrado.' })
  const allowed = ['firstName','lastName','email','phone','avatar','role','isActive','password']
  const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)))
  const user = await updateUser(id, data)
  await writeAudit({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, module: 'users', action: 'update', entityType: 'User', entityId: id, beforeData: { ...before, password: undefined }, afterData: { ...user, password: undefined } })
  const { password, ...safe } = user
  return res.json(safe)
}

export async function remove(req: AuthRequest, res: Response) {
  const id = String(req.params.id)
  if (id === req.user!.id) return res.status(400).json({ error: 'O usuário atual não pode desativar a própria conta.' })
  const before = await prisma.user.findFirst({ where: { id, clinicId: req.user!.clinicId, tenantId: req.user!.tenantId } })
  if (!before) return res.status(404).json({ error: 'Usuário não encontrado.' })
  await deleteUser(id)
  await writeAudit({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, module: 'users', action: 'deactivate', entityType: 'User', entityId: id, beforeData: { ...before, password: undefined } })
  return res.status(204).send()
}
