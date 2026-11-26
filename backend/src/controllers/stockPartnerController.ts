import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { defaultMonthlyFee, loadPartnerSettings, minimumWage, savePartnerSettings } from '../services/stockPartnerService'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STATUSES = ['PENDENTE', 'ATIVO', 'SUSPENSO']

// Clínica: situação e autorização (botão do dentista).
export async function clinicStatus(req: AuthRequest, res: Response) {
  const s = await loadPartnerSettings(req.user!.clinicId)
  const active = await prisma.stockPartner.count({ where: { status: 'ATIVO' } }).catch(() => 0)
  const recent = await prisma.stockPartnerNotice.count({ where: { clinicId: req.user!.clinicId, sentAt: { gte: new Date(Date.now() - 30 * 86400000) } } }).catch(() => 0)
  return res.json({ ...s, activePartners: active, noticesLast30Days: recent })
}

export async function authorize(req: AuthRequest, res: Response) {
  const { clinicId, tenantId, id } = { clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, id: req.user!.id }
  const value = req.body?.authorized === true
  const user = await prisma.user.findUnique({ where: { id }, select: { firstName: true, lastName: true, email: true } })
  const name = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : id
  await savePartnerSettings(clinicId, tenantId, { authorized: value, authorizedAt: value ? new Date().toISOString() : null, authorizedBy: value ? name : null })
  await writeAudit({ clinicId, tenantId, actorId: id, module: 'sales', action: value ? 'STOCK_PARTNERS_AUTHORIZED' : 'STOCK_PARTNERS_REVOKED', summary: value ? `${name} autorizou o aviso de estoque baixo a empresas parceiras.` : `${name} revogou a autorização de aviso a parceiros.`, ipAddress: req.ip, userAgent: req.get('user-agent') }).catch(() => undefined)
  return res.json({ ok: true })
}

// Equipe WMundi: cadastro dos parceiros e da contrapartida.
export async function listPartners(_req: AuthRequest, res: Response) {
  const rows = await prisma.stockPartner.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })
  return res.json({ partners: rows, suggestedFee: defaultMonthlyFee(), minimumWage: minimumWage() })
}

function clean(b: any, partial: boolean) {
  const data: Record<string, unknown> = {}
  if (!partial || b.name !== undefined) { const v = String(b.name ?? '').trim().slice(0, 120); if (!v) throw new Error('Informe o nome da empresa.'); data.name = v }
  if (!partial || b.email !== undefined) { const v = String(b.email ?? '').trim().toLowerCase(); if (!EMAIL_RE.test(v)) throw new Error('E-mail inválido.'); data.email = v }
  if (b.whatsapp !== undefined) data.whatsapp = String(b.whatsapp).replace(/[^\d+]/g, '').slice(0, 20) || null
  if (b.categories !== undefined) data.categories = (Array.isArray(b.categories) ? b.categories : String(b.categories).split(',')).map((c: unknown) => String(c).trim().slice(0, 40)).filter(Boolean).slice(0, 30)
  if (b.monthlyFee !== undefined) { const v = Number(b.monthlyFee); data.monthlyFee = Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : defaultMonthlyFee() }
  else if (!partial) data.monthlyFee = defaultMonthlyFee()
  if (b.status !== undefined) { const v = String(b.status).toUpperCase(); if (!STATUSES.includes(v)) throw new Error('Situação inválida.'); data.status = v }
  if (b.paidUntil !== undefined) data.paidUntil = b.paidUntil ? new Date(`${String(b.paidUntil).slice(0, 10)}T23:59:59-03:00`) : null
  if (b.notes !== undefined) data.notes = String(b.notes).slice(0, 500) || null
  return data
}

export async function createPartner(req: AuthRequest, res: Response) {
  try {
    const row = await prisma.stockPartner.create({ data: clean(req.body || {}, false) as never })
    return res.status(201).json(row)
  } catch (e) { return res.status(400).json({ error: e instanceof Error ? e.message : 'Dados inválidos.' }) }
}

export async function updatePartner(req: AuthRequest, res: Response) {
  try {
    const row = await prisma.stockPartner.update({ where: { id: String(req.params.id) }, data: clean(req.body || {}, true) as never })
    return res.json(row)
  } catch (e) { return res.status(400).json({ error: e instanceof Error ? e.message : 'Dados inválidos.' }) }
}
