import { prisma } from '../lib/prisma'

const STEP: Record<string, number> = { MONTHLY: 1, BIMONTHLY: 2, QUARTERLY: 3, SEMIANNUAL: 6, YEARLY: 12 }
export const FREQUENCIES = Object.keys(STEP)
const DAY = 24 * 60 * 60 * 1000
const BR = 3 * 60 * 60 * 1000
export const VARIABLE_NOTE = 'Valor vari\u00e1vel: confirmar o valor da conta deste m\u00eas.'
const AUTO_NAME = 'D\u00e9bito autom\u00e1tico'
const round = (n: number) => Math.round(n * 100) / 100

export const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth()
export const monthStart = (idx: number) => new Date(Date.UTC(Math.floor(idx / 12), idx % 12, 1, 3, 0, 0))
const ymKey = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
export function startOfTodayBR() { const b = new Date(Date.now() - BR); return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 3, 0, 0)) }
export const currentMonthIdxBR = () => monthIndex(new Date(Date.now() - BR))
export const nextMonthStartBR = () => monthStart(currentMonthIdxBR() + 1)
const idxOf = (d: Date) => monthIndex(new Date(new Date(d).getTime() - BR))

function dueDateFor(idx: number, day: number) {
  const y = Math.floor(idx / 12); const m = idx % 12
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(Math.max(day, 1), last), 15, 0, 0))
}

export function occurrencesBetween(bill: any, fromIdx: number, toIdx: number) {
  const step = STEP[bill.frequency] || 1
  const startIdx = idxOf(bill.startDate)
  const out: { seq: number; due: Date; key: string; idx: number }[] = []
  for (let m = Math.max(fromIdx, startIdx); m <= toIdx; m++) {
    const diff = m - startIdx
    if (diff % step !== 0) continue
    const seq = diff / step + 1
    if (bill.occurrences && seq > bill.occurrences) break
    const due = dueDateFor(m, bill.dueDay)
    if (bill.endDate && due.getTime() > new Date(bill.endDate).getTime() + DAY) break
    out.push({ seq, due, key: `${bill.id}:${ymKey(m)}`, idx: m })
  }
  return out
}

export async function ensureRecurringEntries(clinicId: string, tenantId: string) {
  const cur = currentMonthIdxBR()
  const bills = await prisma.recurringBill.findMany({ where: { clinicId, tenantId, isActive: true } })
  const data: any[] = []
  for (const b of bills) for (const o of occurrencesBetween(b, cur - 1, cur + 1)) data.push({
    clinicId, tenantId, type: b.type, description: b.description, category: b.category, personName: b.personName,
    supplierId: b.supplierId, amount: b.amount, netAmount: b.amount, dueDate: o.due, competenceDate: o.due, status: 'PENDING',
    paymentMethod: b.autoDebit ? 'DEBITO_AUTOMATICO' : b.paymentMethod, origin: 'RECURRING', originId: b.id,
    recurringBillId: b.id, recurrenceKey: o.key, autoDebit: b.autoDebit, recurrence: b.frequency,
    installment: b.occurrences ? o.seq : null, installments: b.occurrences || null,
    costCenterId: b.costCenterId, accountingAccountId: b.accountingAccountId,
    notes: b.amountIsVariable ? VARIABLE_NOTE : b.notes,
  })
  let created = 0
  if (data.length) created = (await prisma.financialEntry.createMany({ data, skipDuplicates: true })).count
  if (bills.length) await prisma.recurringBill.updateMany({ where: { id: { in: bills.map((b) => b.id) } }, data: { lastGeneratedAt: new Date() } })
  const autoSettled = await prisma.$executeRaw`UPDATE "FinancialEntry" SET "status" = 'PAID', "paidAt" = "dueDate", "settledByName" = ${AUTO_NAME}, "updatedAt" = NOW() WHERE "clinicId" = ${clinicId} AND "tenantId" = ${tenantId} AND "autoDebit" = true AND "status" = 'PENDING' AND "dueDate" < NOW()`
  return { created, autoSettled }
}

export async function forecast(clinicId: string, tenantId: string, months = 6) {
  await ensureRecurringEntries(clinicId, tenantId).catch((e) => console.error(e))
  const cur = currentMonthIdxBR(); const last = cur + months - 1
  const from = monthStart(cur); const to = monthStart(last + 1)
  const [entries, bills, history] = await Promise.all([
    prisma.financialEntry.findMany({ where: { clinicId, tenantId, dueDate: { gte: from, lt: to } }, select: { type: true, amount: true, dueDate: true, status: true, recurrenceKey: true } }),
    prisma.recurringBill.findMany({ where: { clinicId, tenantId, isActive: true } }),
    prisma.financialEntry.findMany({ where: { clinicId, tenantId, status: 'PAID', recurrenceKey: null, paidAt: { gte: monthStart(cur - 3), lt: from } }, select: { type: true, amount: true } }),
  ])
  const keys = new Set(entries.filter((e) => e.recurrenceKey).map((e) => e.recurrenceKey as string))
  const avg: Record<string, number> = { INCOME: 0, EXPENSE: 0 }
  for (const h of history) avg[h.type] = (avg[h.type] || 0) + Number(h.amount) / 3
  const blank = () => ({ realized: 0, open: 0, recurring: 0, estimated: 0, total: 0 } as any)
  const rows: any[] = []
  for (let m = cur; m <= last; m++) rows.push({ month: ymKey(m), income: blank(), expense: blank(), known: { INCOME: 0, EXPENSE: 0 } as Record<string, number> })
  for (const e of entries) {
    if (e.status === 'CANCELLED') continue
    const r = rows[idxOf(e.dueDate) - cur]; if (!r) continue
    const side = e.type === 'INCOME' ? r.income : e.type === 'EXPENSE' ? r.expense : null; if (!side) continue
    const v = Number(e.amount)
    if (e.status === 'PAID') side.realized += v; else side.open += v
    if (!e.recurrenceKey) r.known[e.type] += v
  }
  for (const b of bills) for (const o of occurrencesBetween(b, cur, last)) {
    if (keys.has(o.key)) continue
    const r = rows[o.idx - cur]; if (!r) continue
    const side = b.type === 'INCOME' ? r.income : r.expense
    side.recurring += Number(b.amount)
  }
  return {
    months,
    basis: 'M\u00e9dia dos 3 meses anteriores para valores n\u00e3o recorrentes',
    rows: rows.map((r) => {
      for (const t of ['INCOME', 'EXPENSE']) {
        const side = t === 'INCOME' ? r.income : r.expense
        side.estimated = Math.max(0, (avg[t] || 0) - r.known[t])
        side.total = side.realized + side.open + side.recurring + side.estimated
        for (const k of Object.keys(side)) side[k] = round(side[k])
      }
      return { month: r.month, income: r.income, expense: r.expense, balance: round(r.income.total - r.expense.total) }
    }),
  }
}

export async function debtors(clinicId: string, tenantId: string) {
  const today = startOfTodayBR()
  const rows = await prisma.financialEntry.findMany({ where: { clinicId, tenantId, type: 'INCOME', status: { notIn: ['PAID', 'CANCELLED'] }, dueDate: { lt: today } }, include: { patient: true }, orderBy: { dueDate: 'asc' } })
  const map = new Map<string, any>()
  for (const r of rows) {
    const key = r.patientId || `nome:${r.personName.trim().toLowerCase()}`
    const p: any = r.patient
    const g = map.get(key) || { key, patientId: r.patientId, name: p?.name || r.personName, phone: p?.phone || p?.whatsapp || p?.mobile || p?.cellphone || null, email: p?.email || null, total: 0, count: 0, oldestDueDate: r.dueDate, entries: [] as any[] }
    g.total += Number(r.amount); g.count += 1
    if (r.dueDate < g.oldestDueDate) g.oldestDueDate = r.dueDate
    g.entries.push({ id: r.id, description: r.description, amount: r.amount, dueDate: r.dueDate, installment: r.installment, installments: r.installments })
    map.set(key, g)
  }
  const list = Array.from(map.values()).map((g) => ({ ...g, total: round(g.total), daysOverdue: Math.floor((today.getTime() - new Date(g.oldestDueDate).getTime()) / DAY) + 1 })).sort((a, b) => b.total - a.total)
  return { totalOverdue: round(list.reduce((a, g) => a + g.total, 0)), debtors: list.length, list }
}

export async function reminders(clinicId: string, tenantId: string) {
  await ensureRecurringEntries(clinicId, tenantId).catch((e) => console.error(e))
  const today = startOfTodayBR(); const soon = new Date(today.getTime() + 4 * DAY)
  const cur = currentMonthIdxBR(); const from = monthStart(cur); const to = monthStart(cur + 1)
  const bills = await prisma.recurringBill.findMany({ where: { clinicId, tenantId, isActive: true } })
  const [monthEntries, pending] = await Promise.all([
    prisma.financialEntry.findMany({ where: { clinicId, tenantId, dueDate: { gte: from, lt: to }, OR: [{ recurrenceKey: { not: null } }, { notes: { contains: 'Valor vari' } }] }, select: { id: true, description: true, personName: true, amount: true, dueDate: true, status: true, recurrenceKey: true, notes: true } }),
    prisma.financialEntry.findMany({ where: { clinicId, tenantId, type: 'EXPENSE', autoDebit: false, status: { notIn: ['PAID', 'CANCELLED'] }, dueDate: { lt: soon } }, orderBy: { dueDate: 'asc' }, select: { id: true, description: true, personName: true, amount: true, dueDate: true } }),
  ])
  const byKey = new Map(monthEntries.filter((e) => e.recurrenceKey).map((e) => [e.recurrenceKey as string, e]))
  const items: any[] = []
  for (const b of bills) for (const o of occurrencesBetween(b, cur, cur)) {
    const e = byKey.get(o.key)
    if (!e || e.status === 'CANCELLED') items.push({ kind: 'RECORRENTE_NAO_LANCADA', severity: 'HIGH', title: 'Conta recorrente n\u00e3o lan\u00e7ada neste m\u00eas', detail: `${b.description} - ${b.personName}`, recurringBillId: b.id, entryId: e ? e.id : null, amount: b.amount, dueDate: o.due })
  }
  for (const e of pending) {
    const overdue = e.dueDate < today
    items.push({ kind: overdue ? 'CONTA_VENCIDA' : 'VENCE_EM_BREVE', severity: overdue ? 'HIGH' : 'MEDIUM', title: overdue ? 'Conta vencida sem baixa' : 'Conta vence em breve', detail: `${e.description} - ${e.personName}`, entryId: e.id, amount: e.amount, dueDate: e.dueDate })
  }
  for (const e of monthEntries) if (e.status !== 'CANCELLED' && e.notes && e.notes.includes('Valor vari')) items.push({ kind: 'CONFIRMAR_VALOR', severity: 'MEDIUM', title: 'Confirmar valor da conta vari\u00e1vel', detail: `${e.description} - ${e.personName}`, entryId: e.id, amount: e.amount, dueDate: e.dueDate })
  return { total: items.length, high: items.filter((i) => i.severity === 'HIGH').length, items }
}