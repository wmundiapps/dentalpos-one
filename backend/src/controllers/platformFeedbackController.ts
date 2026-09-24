import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { dispatchRevah } from '../services/revahProviderService'

const ADMIN_EMAIL = 'contato@dentalpos.com.br'

const TYPES = ['Bug', 'Bot\u00e3o n\u00e3o funciona', 'Corre\u00e7\u00e3o', 'Sugest\u00e3o', 'Nova funcionalidade', 'D\u00favida', 'Avalia\u00e7\u00e3o']
const PRIORITIES = ['Baixa', 'M\u00e9dia', 'Alta', 'Cr\u00edtica']
const STATUSES = ['Enviado', 'Em an\u00e1lise', 'Em desenvolvimento', 'Resolvido', 'Arquivado']
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function audit(data: Parameters<typeof writeAudit>[0]) {
  try { await writeAudit(data) } catch (e) { console.error(e) }
}

async function notifyAdmin(row: { id: string; clinicId: string; type: string; title: string; description: string; priority: string; rating: number | null; userName: string | null; userEmail: string | null; pagePath: string | null; module: string | null }) {
  try {
    const apiKey = process.env.RESEND_API_KEY || ''
    if (!apiKey) { console.error('RESEND_API_KEY n\u00e3o configurada \u2014 aviso de feedback n\u00e3o enviado.'); return }
    const clinic = await prisma.clinic.findFirst({ where: { id: row.clinicId }, select: { name: true, phone: true } }).catch(() => null)
    const isEvaluation = row.type === 'Avalia\u00e7\u00e3o'
    const stars = row.rating ? `${'\u2605'.repeat(row.rating)}${'\u2606'.repeat(5 - row.rating)} (${row.rating}/5)` : null
    const content = [
      isEvaluation ? 'Nova avalia\u00e7\u00e3o do sistema DentalPos One:' : `Novo relato no DentalPos One (${row.type}):`,
      '',
      `Cl\u00ednica: ${clinic?.name || row.clinicId}`,
      clinic?.phone ? `Telefone da cl\u00ednica: ${clinic.phone}` : null,
      `Usu\u00e1rio: ${row.userName || '-'}${row.userEmail ? ` <${row.userEmail}>` : ''}`,
      `Tipo: ${row.type}`,
      stars ? `Nota: ${stars}` : null,
      !isEvaluation ? `Prioridade: ${row.priority}` : null,
      !isEvaluation ? `T\u00edtulo: ${row.title}` : null,
      row.module ? `M\u00f3dulo: ${row.module}` : null,
      row.pagePath ? `Tela: ${row.pagePath}` : null,
      '',
      isEvaluation ? 'Sugest\u00e3o:' : 'Descri\u00e7\u00e3o:',
      row.description || '(sem texto)',
      '',
      'Ver todos: https://app.dentalpos.com.br/sugestoes-problemas',
    ].filter((line): line is string => line !== null).join('\n')
    const subject = isEvaluation
      ? `Avalia\u00e7\u00e3o ${row.rating}/5 \u2014 ${clinic?.name || 'cl\u00ednica'}`
      : `${row.type} \u2014 ${row.title} \u2014 ${clinic?.name || 'cl\u00ednica'}`
    await dispatchRevah('EMAIL', ADMIN_EMAIL, content, {
      apiKey,
      from: 'DentalPos One <contato@dentalpos.com.br>',
      subject,
    })
  } catch (error) {
    console.error('Falha ao enviar aviso de feedback por e-mail:', error)
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'N\u00e3o autenticado.' })
    const { id: userId, clinicId, tenantId, email } = req.user
    const b = req.body || {}
    const type = txt(b.type, 40)
    const ratingRaw = Number(b.rating)
    const rating = Number.isFinite(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? Math.round(ratingRaw) : null
    const title = txt(b.title, 160)
    const description = txt(b.description, 5000)
    if (!TYPES.includes(type)) return res.status(400).json({ error: 'Tipo de relato inv\u00e1lido.' })
    const isEvaluation = type === 'Avalia\u00e7\u00e3o'
    if (!isEvaluation && title.length < 3) return res.status(400).json({ error: 'Informe um t\u00edtulo.' })
    if (!isEvaluation && description.length < 5) return res.status(400).json({ error: 'Descreva o relato.' })
    if (isEvaluation && !rating) return res.status(400).json({ error: 'Informe uma nota.' })
    const pr = txt(b.priority, 20)
    const priority = PRIORITIES.includes(pr) ? pr : 'M\u00e9dia'
    const user = await prisma.user.findFirst({ where: { id: userId, clinicId }, select: { firstName: true, lastName: true, email: true } })
    const userName = user ? (`${user.firstName} ${user.lastName}`.trim() || user.email) : email
    const row = await prisma.platformFeedback.create({ data: {
      clinicId, tenantId, userId, userName, userEmail: user?.email || email, type, title: title || 'Avalia\u00e7\u00e3o do sistema', description: description || '', priority, rating,
      module: txt(b.module, 80) || null, pagePath: txt(b.pagePath, 300) || null, userAgent: txt(req.get('user-agent'), 300) || null,
    } })
    await audit({ clinicId, tenantId, actorId: userId, module: 'feedback', action: 'PLATFORM_FEEDBACK_CREATE', entityType: 'PlatformFeedback', entityId: row.id, afterData: row, summary: `${type}: ${title}` })
    await notifyAdmin(row)
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