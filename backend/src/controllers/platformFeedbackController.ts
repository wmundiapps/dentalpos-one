import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

const TYPES = ['Bug', 'Bot\u00e3o n\u00e3o funciona', 'Corre\u00e7\u00e3o', 'Sugest\u00e3o', 'Nova funcionalidade', 'D\u00favida']
const PRIORITIES = ['Baixa', 'M\u00e9dia', 'Alta', 'Cr\u00edtica']
const STATUSES = ['Enviado', 'Em an\u00e1lise', 'Em desenvolvimento', 'Resolvido', 'Arquivado']
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function audit(data: Parameters<typeof writeAudit>[0]) {
  try { await writeAudit(data) } catch (e) { console.error(e) }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'N\u00e3o autenticado.' })
    const { id: userId, clinicId, tenantId, email } = req.user
    const b = req.body || {}
    const type = txt(b.type, 40)
    const title = txt(b.title, 160)
    const description = txt(b.description, 5000)
    if (!TYPES.includes(type)) return res.status(400).json({ error: 'Tipo de relato inv\u00e1lido.' })
    if (title.length < 3) return res.status(400).json({ error: 'Informe um t\u00edtulo.' })
    if (description.length < 5) return res.status(400).json({ error: 'Descreva o relato.' })
    const pr = txt(b.priority, 20)
    const priority = PRIORITIES.includes(pr) ? pr : 'M\u00e9dia'
    const user = await prisma.user.findFirst({ where: { id: userId, clinicId }, select: { firstName: true, lastName: true, email: true } })
    const userName = user ? (`${user.firstName} ${user.lastName}`.trim() || user.email) : email
    const row = await prisma.platformFeedback.create({ data: {
      clinicId, tenantId, userId, userName, userEmail: user?.email || email, type, title, description, priority,
      module: txt(b.module, 80) || null, pagePath: txt(b.pagePath, 300) || null, userAgent: txt(req.get('user-agent'), 300) || null,
    } })
    await audit({ clinicId, tenantId, actorId: userId, module: 'feedback', action: 'PLATFORM_FEEDBACK_CREATE', entityType: 'PlatformFeedback', entityId: row.id, afterData: row, summary: `${type}: ${title}` })
    return res.status(201).json(row)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao enviar relato.' }) }
}

export async function listMine(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'N\u00e3o autenticado.' })
    const rows = await prisma.platformFeedback.findMany({ where: { clinicId: req.user.clinicId, tenantId: req.user.tenantId }, orderBy: { createdAt: 'desc' }, take: 300 })
    return res.json(rows)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao listar relatos.' }) }
}

export async function listAll(_req: AuthRequest, res: Response) {
  try {
    const rows = await prisma.platformFeedback.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 })
    return res.json(rows)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao listar relatos.' }) }
}

export async function updateStatus(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'N\u00e3o autenticado.' })
    const status = txt(req.body?.status, 40)
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Status inv\u00e1lido.' })
    const id = String(req.params.id)
    const existing = await prisma.platformFeedback.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Relato n\u00e3o encontrado.' })
    const row = await prisma.platformFeedback.update({ where: { id }, data: { status } })
    await audit({ clinicId: existing.clinicId, tenantId: existing.tenantId, actorId: req.user.id, module: 'feedback', action: 'PLATFORM_FEEDBACK_STATUS', entityType: 'PlatformFeedback', entityId: id, beforeData: existing, afterData: row, summary: `Relato ${existing.title}: ${status}` })
    return res.json(row)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao atualizar relato.' }) }
}