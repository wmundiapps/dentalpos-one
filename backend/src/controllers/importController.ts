import { Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { loadSettings, saveSettings } from '../services/followUpService'
import { IMPORTED_ORIGINS } from '../services/importedHold'

// Importação de agenda e financeiro vindos de outro sistema (ex.: Clinicorp).
// As linhas chegam já lidas da planilha e com as colunas escolhidas pelo usuário; "dryRun" só confere, sem gravar.
// Nunca cria lembretes nem envia mensagens.

type Skipped = { row: number; reason: string }
const MAX_ROWS = 2000

const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const nameKey = (v: unknown) => norm(v).replace(/^(dra?|dr)\s+/, '')
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const phoneKey = (v: unknown) => { const d = digits(v); return d.length >= 12 && d.startsWith('55') ? d.slice(2) : d }
const truthy = (v: unknown) => ['x', 'sim', 's', 'true', '1', 'yes'].includes(norm(v))

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

// Aceita 27/10/2026, 2026-10-27 e 2026-10-27T03:00:00.000Z (data do Clinicorp: meia-noite de Brasília).
function parseDay(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  let m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}
function parseTime(value: unknown): number | null {
  const m = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1]); const min = Number(m[2])
  return h > 23 || min > 59 ? null : h * 60 + min
}
// Horário de Brasília (UTC-3) para o instante gravado.
const brtToDate = (day: string, minutes: number) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), 0, minutes + 180))
const todayBrt = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)

function statusFrom(text: unknown): 'COMPLETED' | 'NO_SHOW' | 'CONFIRMED' | 'CANCELLED' | null {
  const s = norm(text)
  if (!s) return null
  if (/(cancel|desmarc)/.test(s)) return 'CANCELLED'
  if (/(missed|faltou|falta|no show|noshow|ausent)/.test(s)) return 'NO_SHOW'
  if (/(checkout|atendid|finaliz|conclu|complet|arrived|compareceu|realizad)/.test(s)) return 'COMPLETED'
  if (/(confirm)/.test(s)) return 'CONFIRMED'
  return null
}

export async function importAppointments(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const rows: Array<Record<string, string>> = Array.isArray(req.body?.rows) ? req.body.rows : []
    const dryRun = req.body?.dryRun === true
    const pastNoStatus: 'COMPLETED' | 'SKIP' = req.body?.pastWithoutStatus === 'SKIP' ? 'SKIP' : 'COMPLETED'
    if (!rows.length) return res.status(400).json({ error: 'Nenhuma linha para importar.' })
    if (rows.length > MAX_ROWS) return res.status(400).json({ error: `Máximo de ${MAX_ROWS} linhas por envio.` })

    const patients = await prisma.patient.findMany({ where: { clinicId, tenantId }, select: { id: true, fullName: true, phone: true, createdAt: true }, orderBy: { createdAt: 'asc' } })
    const byName = new Map<string, typeof patients>()
    for (const p of patients) { const k = nameKey(p.fullName); byName.set(k, [...(byName.get(k) || []), p]) }
    const doctors = await prisma.doctor.findMany({ where: { clinicId, tenantId, isActive: true }, select: { id: true, userId: true, user: { select: { firstName: true, lastName: true } } } })
    const doctorKeys = doctors.map((d) => ({ d, key: nameKey(`${d.user.firstName} ${d.user.lastName}`) }))
    const findDoctor = (name: string) => {
      const k = nameKey(name)
      if (!k) return null
      return doctorKeys.find((x) => x.key === k)?.d || doctorKeys.find((x) => x.key.includes(k) || k.includes(x.key))?.d || null
    }

    const windowStart = new Date(Date.now() - 400 * 86400000)
    const existing = await prisma.appointment.findMany({ where: { clinicId, tenantId, scheduledAt: { gte: windowStart } }, select: { patientId: true, scheduledAt: true } })
    const taken = new Set(existing.map((a) => `${a.patientId}|${a.scheduledAt.toISOString().slice(0, 16)}`))

    const skipped: Skipped[] = []
    const toCreate: Prisma.AppointmentCreateManyInput[] = []
    const today = todayBrt()
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {}
      const day = parseDay(r.date)
      const start = parseTime(r.start)
      if (!day || start === null) { skipped.push({ row: i + 1, reason: 'Data ou horário inválido.' }); continue }
      const st = statusFrom(r.status)
      if (st === 'CANCELLED') { skipped.push({ row: i + 1, reason: 'Consulta cancelada ou desmarcada no sistema de origem.' }); continue }
      const candidates = byName.get(nameKey(r.patientName)) || []
      if (!candidates.length) { skipped.push({ row: i + 1, reason: 'Paciente não encontrado no cadastro (importe os pacientes antes).' }); continue }
      const phone = phoneKey(r.patientPhone)
      const patient = (phone && candidates.find((p) => phoneKey(p.phone) === phone)) || candidates[0]
      const doctor = findDoctor(String(r.dentist || ''))
      if (!doctor) { skipped.push({ row: i + 1, reason: `Dentista "${r.dentist || ''}" não cadastrado na equipe.` }); continue }
      const past = day < today
      let status: string = st || 'SCHEDULED'
      if (!st && past) { if (pastNoStatus === 'SKIP') { skipped.push({ row: i + 1, reason: 'Consulta passada sem situação informada.' }); continue } status = 'COMPLETED' }
      const end = parseTime(r.end)
      const duration = end !== null && end > start ? Math.min(480, end - start) : 30
      const scheduledAt = brtToDate(day, start)
      const key = `${patient.id}|${scheduledAt.toISOString().slice(0, 16)}`
      if (taken.has(key)) { skipped.push({ row: i + 1, reason: 'Já existe consulta deste paciente neste horário.' }); continue }
      taken.add(key)
      toCreate.push({
        clinicId, tenantId, patientId: patient.id, doctorId: doctor.id, userId: doctor.userId,
        procedure: String(r.procedure || '').trim().slice(0, 200) || 'Consulta',
        scheduledAt, durationMinutes: duration, status,
        notes: String(r.notes || '').trim().slice(0, 500) || null,
        confirmation: status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING', source: 'INTERNAL',
      })
    }

    let createdCount = 0
    if (!dryRun) {
      for (let i = 0; i < toCreate.length; i += 500) createdCount += (await prisma.appointment.createMany({ data: toCreate.slice(i, i + 500) })).count
      await writeAudit({ clinicId, tenantId, actorId, module: 'agenda', action: 'APPOINTMENT_BULK_IMPORT', entityType: 'Appointment', entityId: 'bulk', summary: `Importação de agenda: ${createdCount} consulta(s), ${skipped.length} ignorada(s).` }).catch((e: unknown) => console.error(e))
    }
    return res.status(dryRun ? 200 : 201).json({ dryRun, createdCount: dryRun ? toCreate.length : createdCount, skipped })
  } catch (error) {
    console.error('Erro na importação de agenda:', error)
    return res.status(500).json({ error: 'Erro ao importar a agenda.' })
  }
}

export async function importFinancial(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const rows: Array<Record<string, string>> = Array.isArray(req.body?.rows) ? req.body.rows : []
    const dryRun = req.body?.dryRun === true
    const onlyOpen = req.body?.mode !== 'ALL'
    if (!rows.length) return res.status(400).json({ error: 'Nenhuma linha para importar.' })
    if (rows.length > MAX_ROWS) return res.status(400).json({ error: `Máximo de ${MAX_ROWS} linhas por envio.` })

    // Baixa pela planilha: parcelas já importadas que o sistema de origem mostra como pagas passam a recebidas aqui.
    if (req.body?.mode === 'SETTLE') {
      const wanted = [...new Set(rows.map((r) => String(r.sourceId || '').trim().replace(/^IMP:/, '')).filter(Boolean))]
      const found = wanted.length ? await prisma.financialEntry.findMany({
        where: { clinicId, tenantId, origin: { in: IMPORTED_ORIGINS }, originId: { in: [...wanted, ...wanted.map((w) => `IMP:${w}`)] } },
        select: { id: true, originId: true, status: true, amount: true, notes: true, paymentMethod: true }
      }) : []
      const byId = new Map(found.map((f) => [String(f.originId).replace(/^IMP:/, ''), f]))
      const skippedSettle: Skipped[] = []
      const updates: Array<{ id: string; paidAt: Date; paymentMethod: string | null; notes: string | null; amount: number }> = []
      const seen = new Set<string>()
      let sum = 0
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {}
        const paidDay = parseDay(r.paidDate)
        if (!(truthy(r.paid) || paidDay)) { skippedSettle.push({ row: i + 1, reason: 'Parcela ainda em aberto no sistema de origem.' }); continue }
        const sourceId = String(r.sourceId || '').trim().replace(/^IMP:/, '')
        if (!sourceId) { skippedSettle.push({ row: i + 1, reason: 'Linha sem código da parcela para localizar no sistema.' }); continue }
        const entry = byId.get(sourceId)
        if (!entry) { skippedSettle.push({ row: i + 1, reason: 'Parcela não encontrada aqui (importe antes).' }); continue }
        if (entry.status !== 'PENDING' || seen.has(entry.id)) { skippedSettle.push({ row: i + 1, reason: 'Parcela já baixada ou cancelada aqui.' }); continue }
        seen.add(entry.id)
        const day = paidDay || todayBrt()
        const note = `Baixa pela planilha do sistema anterior (pago em ${day.split('-').reverse().join('/')}).`
        updates.push({ id: entry.id, paidAt: new Date(`${day}T12:00:00.000Z`), paymentMethod: String(r.paymentMethod || '').trim().slice(0, 40) || entry.paymentMethod, notes: entry.notes ? `${entry.notes}\n${note}` : note, amount: entry.amount })
        sum += entry.amount
      }
      let settled = 0
      if (!dryRun) {
        for (let i = 0; i < updates.length; i += 100) {
          const batch = updates.slice(i, i + 100)
          await prisma.$transaction(batch.map((u) => prisma.financialEntry.update({ where: { id: u.id }, data: { status: 'PAID', paidAt: u.paidAt, paymentMethod: u.paymentMethod, notes: u.notes } })))
          settled += batch.length
        }
        if (settled) await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'FINANCIAL_BULK_SETTLE', entityType: 'FinancialEntry', entityId: 'bulk', summary: `Baixa pela planilha: ${settled} parcela(s) marcadas como recebidas.` }).catch((e: unknown) => console.error(e))
      }
      return res.status(dryRun ? 200 : 201).json({ dryRun, createdCount: dryRun ? updates.length : settled, total: Math.round(sum * 100) / 100, overdue: 0, skipped: skippedSettle })
    }

    const patients = await prisma.patient.findMany({ where: { clinicId, tenantId }, select: { id: true, fullName: true, phone: true }, orderBy: { createdAt: 'asc' } })
    const byName = new Map<string, typeof patients>()
    for (const p of patients) { const k = nameKey(p.fullName); byName.set(k, [...(byName.get(k) || []), p]) }

    const originIds = rows.map((r) => String(r.sourceId || '').trim()).filter(Boolean).map((id) => `IMP:${id}`)
    const found = originIds.length ? await prisma.financialEntry.findMany({ where: { clinicId, tenantId, origin: 'IMPORTACAO', originId: { in: originIds } }, select: { originId: true } }) : []
    const known = new Set(found.map((f) => f.originId))

    const skipped: Skipped[] = []
    const toCreate: Prisma.FinancialEntryCreateManyInput[] = []
    let overdue = 0
    let total = 0
    const today = todayBrt()
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {}
      const rawAmount = String(r.amount ?? '').replace(/[^\d.,-]/g, '')
      const amount = Number(rawAmount.includes(',') ? rawAmount.replace(/\./g, '').replace(',', '.') : rawAmount)
      const day = parseDay(r.dueDate)
      if (!(amount > 0)) { skipped.push({ row: i + 1, reason: 'Valor inválido.' }); continue }
      if (!day) { skipped.push({ row: i + 1, reason: 'Data de vencimento inválida.' }); continue }
      const paidDay = parseDay(r.paidDate)
      const paid = truthy(r.paid) || Boolean(paidDay)
      if (paid && onlyOpen) { skipped.push({ row: i + 1, reason: 'Parcela já paga (importando só o que está a receber).' }); continue }
      const candidates = byName.get(nameKey(r.patientName)) || []
      if (!candidates.length) { skipped.push({ row: i + 1, reason: 'Paciente não encontrado no cadastro (importe os pacientes antes).' }); continue }
      const phone = phoneKey(r.patientPhone)
      const patient = (phone && candidates.find((p) => phoneKey(p.phone) === phone)) || candidates[0]
      const sourceId = String(r.sourceId || '').trim()
      const originId = sourceId ? `IMP:${sourceId}` : null
      if (originId && known.has(originId)) { skipped.push({ row: i + 1, reason: 'Parcela já importada antes.' }); continue }
      if (originId) known.add(originId)
      const installment = Number(r.installment) > 0 ? Math.floor(Number(r.installment)) : null
      const installments = Number(r.installments) > 1 ? Math.floor(Number(r.installments)) : null
      const base = String(r.description || '').trim() || 'Tratamento odontológico (importado)'
      toCreate.push({
        clinicId, tenantId, patientId: patient.id, type: 'INCOME', category: 'Tratamento', personName: patient.fullName,
        description: installment && installments ? `${base} - parcela ${installment}/${installments}` : base,
        amount, dueDate: new Date(`${day}T12:00:00.000Z`), status: paid ? 'PAID' : 'PENDING',
        paidAt: paid ? new Date(`${paidDay || day}T12:00:00.000Z`) : null,
        paymentMethod: String(r.paymentMethod || '').trim().slice(0, 40) || null,
        origin: 'IMPORTACAO', originId, installment, installments, updatedAt: new Date(),
      } as Prisma.FinancialEntryCreateManyInput)
      total += amount
      if (!paid && day < today) overdue += amount
    }

    let createdCount = 0
    if (!dryRun) {
      // Parcelas vencidas passam a contar como inadimplência: pausa os avisos automáticos para o usuário conferir antes de ligá-los de novo.
      if (req.body?.pauseDebtorNotices !== false && toCreate.length) {
        const s = await loadSettings(clinicId)
        await saveSettings(clinicId, tenantId, { ...s, dailyDebtors: false, debtorNotice: false })
      }
      for (let i = 0; i < toCreate.length; i += 500) createdCount += (await prisma.financialEntry.createMany({ data: toCreate.slice(i, i + 500) })).count
      await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'FINANCIAL_BULK_IMPORT', entityType: 'FinancialEntry', entityId: 'bulk', summary: `Importação financeira: ${createdCount} lançamento(s), ${skipped.length} ignorado(s).` }).catch((e: unknown) => console.error(e))
    }
    return res.status(dryRun ? 200 : 201).json({ dryRun, createdCount: dryRun ? toCreate.length : createdCount, total: Math.round(total * 100) / 100, overdue: Math.round(overdue * 100) / 100, skipped })
  } catch (error) {
    console.error('Erro na importação financeira:', error)
    return res.status(500).json({ error: 'Erro ao importar o financeiro.' })
  }
}
