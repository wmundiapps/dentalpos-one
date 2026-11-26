import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { buildCashReport, loadCashSettings, saveCashSettings, sendCashClose } from '../services/dailyCashService'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const todayBrt = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)

export async function report(req: AuthRequest, res: Response) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : todayBrt()
  const [r, s] = await Promise.all([buildCashReport(req.user!.clinicId, req.user!.tenantId, date), loadCashSettings(req.user!.clinicId)])
  return res.json({ report: r, settings: { enabled: s.enabled, emails: s.emails } })
}

export async function updateSettings(req: AuthRequest, res: Response) {
  const { clinicId, tenantId } = { clinicId: req.user!.clinicId, tenantId: req.user!.tenantId }
  const cur = await loadCashSettings(clinicId)
  const b = req.body || {}
  const raw = Array.isArray(b.emails) ? b.emails : String(b.emails ?? cur.emails.join(',')).split(/[\s,;]+/)
  const emails = [...new Set(raw.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean))] as string[]
  const bad = emails.find((e) => !EMAIL_RE.test(e))
  if (bad) return res.status(400).json({ error: `E-mail inválido: ${bad}` })
  await saveCashSettings(clinicId, tenantId, { ...cur, enabled: b.enabled === undefined ? cur.enabled : Boolean(b.enabled), emails: emails.slice(0, 10) })
  await writeAudit({ clinicId, tenantId, actorId: req.user!.id, module: 'finance', action: 'CASH_CLOSE_SETTINGS', summary: 'Envio diário do fechamento de caixa atualizado.' }).catch(() => undefined)
  return res.json({ ok: true })
}

export async function sendNow(req: AuthRequest, res: Response) {
  const clinic = await prisma.clinic.findFirst({ where: { id: req.user!.clinicId }, select: { id: true, tenantId: true, name: true, displayName: true, phone: true, email: true } })
  if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.date || '')) ? String(req.body.date) : todayBrt()
  const r = await sendCashClose({ id: clinic.id, tenantId: clinic.tenantId, name: clinic.displayName || clinic.name, phone: clinic.phone, email: clinic.email }, { force: true, day: date })
  return res.json(r)
}
