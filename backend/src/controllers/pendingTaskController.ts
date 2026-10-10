import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { computeTaskPoints, TASK_PRIORITIES, TASK_STATUSES } from '../services/pendingTaskScore'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado.')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

const dateField = z.preprocess(v => (v === '' || v === undefined ? undefined : v), z.coerce.date().nullable().optional())
const baseSchema = z.object({
  title: z.string().trim().min(2, 'Informe o título.').max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  module: z.string().trim().max(60).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).default('MEDIA'),
  dueDate: dateField,
  assigneeId: z.string().min(1).nullable().optional()
})
const createSchema = baseSchema
const updateSchema = baseSchema.partial().extend({ status: z.enum(TASK_STATUSES).optional() })

function fail(res: Response, e: unknown) {
  if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || 'Dados inválidos.' })
  console.error('[pending-tasks]', e)
  return res.status(500).json({ error: 'Não foi possível processar a pendência.' })
}

function dayOnly(d: Date | null | undefined) {
  return d ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) : d
}

async function checkAssignee(clinicId: string, assigneeId?: string | null) {
  if (!assigneeId) return true
  return !!(await prisma.user.findFirst({ where: { id: assigneeId, clinicId, isActive: true }, select: { id: true } }))
}

export async function list(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const q = req.query
    const where: Record<string, unknown> = { clinicId, tenantId }
    if (typeof q.status === 'string' && (TASK_STATUSES as readonly string[]).includes(q.status)) where.status = q.status
    if (typeof q.priority === 'string' && (TASK_PRIORITIES as readonly string[]).includes(q.priority)) where.priority = q.priority
    if (typeof q.assigneeId === 'string' && q.assigneeId) where.assigneeId = q.assigneeId === 'none' ? null : q.assigneeId
    const rows = await prisma.pendingTask.findMany({
      where,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 500,
      include: { assignee: { select: { id: true, firstName: true, lastName: true } } }
    })
    return res.json(rows)
  } catch (e) { return fail(res, e) }
}

export async function assignees(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const users = await prisma.user.findMany({ where: { clinicId, tenantId, isActive: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } })
    return res.json(users.map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() })))
  } catch (e) { return fail(res, e) }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const b = createSchema.parse(req.body)
    if (!(await checkAssignee(clinicId, b.assigneeId))) return res.status(400).json({ error: 'Responsável inválido.' })
    const row = await prisma.pendingTask.create({
      data: { clinicId, tenantId, createdById: actorId, title: b.title, description: b.description || null, module: b.module || null, priority: b.priority, dueDate: dayOnly(b.dueDate) ?? null, assigneeId: b.assigneeId || null }
    })
    await writeAudit({ clinicId, tenantId, actorId, module: 'pendencias', action: 'PENDING_TASK_CREATE', entityType: 'PendingTask', entityId: row.id, afterData: row, ipAddress: req.ip, userAgent: req.get('user-agent') })
    return res.status(201).json(row)
  } catch (e) { return fail(res, e) }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const b = updateSchema.parse(req.body)
    const before = await prisma.pendingTask.findFirst({ where: { id, clinicId, tenantId } })
    if (!before) return res.status(404).json({ error: 'Pendência não encontrada.' })
    if (b.assigneeId !== undefined && !(await checkAssignee(clinicId, b.assigneeId))) return res.status(400).json({ error: 'Responsável inválido.' })
    if (before.status === 'CONCLUIDA' && b.status && b.status !== 'CONCLUIDA') return res.status(400).json({ error: 'Pendência concluída não pode ser reaberta.' })
    const data: Record<string, unknown> = {}
    for (const k of ['title', 'priority', 'status'] as const) if (b[k] !== undefined) data[k] = b[k]
    for (const k of ['description', 'module'] as const) if (b[k] !== undefined) data[k] = b[k] || null
    if (b.assigneeId !== undefined) data.assigneeId = b.assigneeId || null
    if (b.dueDate !== undefined) data.dueDate = dayOnly(b.dueDate) ?? null
    if (data.status === 'CONCLUIDA' && before.status !== 'CONCLUIDA') return res.status(400).json({ error: 'Use a ação de concluir.' })
    const row = await prisma.pendingTask.update({ where: { id }, data })
    await writeAudit({ clinicId, tenantId, actorId, module: 'pendencias', action: 'PENDING_TASK_UPDATE', entityType: 'PendingTask', entityId: id, beforeData: before, afterData: row, ipAddress: req.ip, userAgent: req.get('user-agent') })
    return res.json(row)
  } catch (e) { return fail(res, e) }
}

export async function complete(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const before = await prisma.pendingTask.findFirst({ where: { id, clinicId, tenantId } })
    if (!before) return res.status(404).json({ error: 'Pendência não encontrada.' })
    if (before.status === 'CONCLUIDA') return res.status(400).json({ error: 'Pendência já concluída.' })
    if (before.status === 'CANCELADA') return res.status(400).json({ error: 'Pendência cancelada não pode ser concluída.' })
    const completedAt = new Date()
    const { points } = computeTaskPoints(before.priority, before.dueDate, completedAt)
    const row = await prisma.pendingTask.update({ where: { id }, data: { status: 'CONCLUIDA', completedAt, points, completedById: actorId } })
    await writeAudit({ clinicId, tenantId, actorId, module: 'pendencias', action: 'PENDING_TASK_COMPLETE', entityType: 'PendingTask', entityId: id, beforeData: before, afterData: row, ipAddress: req.ip, userAgent: req.get('user-agent') })
    return res.json(row)
  } catch (e) { return fail(res, e) }
}

export async function cancel(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const before = await prisma.pendingTask.findFirst({ where: { id, clinicId, tenantId } })
    if (!before) return res.status(404).json({ error: 'Pendência não encontrada.' })
    if (before.status === 'CONCLUIDA') return res.status(400).json({ error: 'Pendência concluída não pode ser cancelada.' })
    const row = await prisma.pendingTask.update({ where: { id }, data: { status: 'CANCELADA' } })
    await writeAudit({ clinicId, tenantId, actorId, module: 'pendencias', action: 'PENDING_TASK_CANCEL', entityType: 'PendingTask', entityId: id, beforeData: before, afterData: row, ipAddress: req.ip, userAgent: req.get('user-agent') })
    return res.json(row)
  } catch (e) { return fail(res, e) }
}

// Ranking por responsável: pontos das pendências concluídas na semana (segunda a domingo) ou no mês corrente.
export async function ranking(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const period = req.query.period === 'week' ? 'week' : 'month'
    const brt = new Date(Date.now() - 3 * 3600 * 1000)
    let startUtc: number
    if (period === 'month') startUtc = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), 1)
    else {
      const dow = (brt.getUTCDay() + 6) % 7
      startUtc = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() - dow)
    }
    const since = new Date(startUtc + 3 * 3600 * 1000)
    const rows = await prisma.pendingTask.findMany({
      where: { clinicId, tenantId, status: 'CONCLUIDA', completedAt: { gte: since }, assigneeId: { not: null } },
      select: { assigneeId: true, points: true, dueDate: true, completedAt: true, assignee: { select: { firstName: true, lastName: true } } }
    })
    const map = new Map<string, { assigneeId: string; name: string; points: number; completed: number; onTime: number; late: number }>()
    for (const r of rows) {
      const key = r.assigneeId as string
      const cur = map.get(key) || { assigneeId: key, name: `${r.assignee?.firstName || ''} ${r.assignee?.lastName || ''}`.trim(), points: 0, completed: 0, onTime: 0, late: 0 }
      cur.points += r.points
      cur.completed += 1
      if (r.points > 0 || !r.dueDate) cur.onTime += 1
      else cur.late += 1
      map.set(key, cur)
    }
    const ranking = [...map.values()].sort((a, b) => b.points - a.points || b.completed - a.completed)
    return res.json({ period, since, ranking })
  } catch (e) { return fail(res, e) }
}
