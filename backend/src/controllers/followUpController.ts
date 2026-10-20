import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { debtors, groupUnscheduled, loadSettings, ownerEmails, saveSettings, sendDailyDebtors, sendWeeklyList, unscheduledPatients } from '../services/followUpService'

const ctx = (req: AuthRequest) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId })

// Lista dos painéis da recepção e clínico: pacientes sem consulta marcada, por motivo.
export async function unscheduled(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const list = await unscheduledPatients(clinicId, tenantId)
    const limit = Math.min(200, Math.max(5, Math.round(Number(req.query.limit) || 30)))
    const groups = groupUnscheduled(list).map((g) => ({ kind: g.kind, label: g.label, total: g.total, patients: g.patients.slice(0, limit) }))
    return res.json({ total: list.length, groups })
  } catch (error) {
    console.error('Erro ao listar pacientes sem agendar:', error)
    return res.status(500).json({ error: 'Não foi possível carregar a lista.' })
  }
}

export async function show(req: AuthRequest, res: Response) {
  const { clinicId, tenantId } = ctx(req)
  const s = await loadSettings(clinicId)
  const [owners, debt] = await Promise.all([ownerEmails(clinicId, tenantId, s), debtors(clinicId, tenantId).catch(() => [])])
  return res.json({ weeklyList: s.weeklyList, dailyDebtors: s.dailyDebtors, debtorNotice: s.debtorNotice, emails: s.emails, effectiveEmails: owners, debtorCount: debt.length })
}

export async function update(req: AuthRequest, res: Response) {
  const { clinicId, tenantId } = ctx(req)
  const cur = await loadSettings(clinicId)
  const b = req.body || {}
  const emails = Array.isArray(b.emails) ? b.emails : String(b.emails ?? cur.emails.join(',')).split(/[\s,;]+/)
  const clean = [...new Set(emails.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean))] as string[]
  const bad = clean.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  if (bad) return res.status(400).json({ error: `E-mail inválido: ${bad}` })
  await saveSettings(clinicId, tenantId, {
    ...cur,
    weeklyList: b.weeklyList === undefined ? cur.weeklyList : Boolean(b.weeklyList),
    dailyDebtors: b.dailyDebtors === undefined ? cur.dailyDebtors : Boolean(b.dailyDebtors),
    debtorNotice: b.debtorNotice === undefined ? cur.debtorNotice : Boolean(b.debtorNotice),
    emails: clean.slice(0, 10),
  })
  await writeAudit({ clinicId, tenantId, actorId: req.user!.id, module: 'settings', action: 'FOLLOWUP_SETTINGS', summary: 'Resumos e avisos automáticos atualizados.' }).catch(() => undefined)
  return res.json({ ok: true })
}

// Manda agora, só para o responsável, as listas de teste (não avisa nenhum paciente).
export async function sendNow(req: AuthRequest, res: Response) {
  const { clinicId, tenantId } = ctx(req)
  const clinic = await prisma.clinic.findFirst({ where: { id: clinicId }, select: { id: true, tenantId: true, name: true, displayName: true, phone: true, email: true } })
  if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })
  const c = { id: clinic.id, tenantId, name: clinic.displayName || clinic.name, phone: clinic.phone, email: clinic.email }
  const weekly = await sendWeeklyList(c, { force: true })
  const daily = await sendDailyDebtors(c, { force: true })
  return res.json({ weekly, daily })
}
