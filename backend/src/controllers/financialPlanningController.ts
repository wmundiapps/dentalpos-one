import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { FREQUENCIES, ensureRecurringEntries, forecast, debtors, reminders, startOfTodayBR, nextMonthStartBR } from '../services/financialPlanningService'

function context(req: AuthRequest) {
  if (!req.user) throw new Error('N\u00e3o autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}
const txt = (v: any) => (v === undefined ? undefined : v === null || String(v).trim() === '' ? null : String(v).trim())

function parseBill(b: any, partial: boolean): { data: any; error?: string } {
  const data: any = {}
  if (b.type !== undefined || !partial) data.type = b.type === 'INCOME' ? 'INCOME' : 'EXPENSE'
  for (const k of ['description', 'personName', 'category']) { const v = txt(b[k]); if (v !== undefined) { if (v === null && k !== 'category') return { data, error: 'Descri\u00e7\u00e3o e favorecido s\u00e3o obrigat\u00f3rios.' }; data[k] = v ?? 'GERAL' } }
  for (const k of ['paymentMethod', 'costCenterId', 'accountingAccountId', 'notes', 'supplierId']) { const v = txt(b[k]); if (v !== undefined) data[k] = v }
  if (b.amount !== undefined) { const n = Number(b.amount); if (!(n > 0)) return { data, error: 'Valor inv\u00e1lido.' }; data.amount = n }
  if (b.dueDay !== undefined) { const n = Number(b.dueDay); if (!Number.isInteger(n) || n < 1 || n > 31) return { data, error: 'Dia de vencimento deve ser de 1 a 31.' }; data.dueDay = n }
  if (b.frequency !== undefined) { const f = String(b.frequency).toUpperCase(); if (!FREQUENCIES.includes(f)) return { data, error: 'Periodicidade inv\u00e1lida.' }; data.frequency = f }
  if (b.startDate !== undefined) { const d = new Date(b.startDate); if (Number.isNaN(d.getTime())) return { data, error: 'Data de in\u00edcio inv\u00e1lida.' }; data.startDate = d }
  if (b.endDate !== undefined) { if (!b.endDate) data.endDate = null; else { const d = new Date(b.endDate); if (Number.isNaN(d.getTime())) return { data, error: 'Data final inv\u00e1lida.' }; data.endDate = d } }
  if (b.occurrences !== undefined) { if (b.occurrences === null || b.occurrences === '' || Number(b.occurrences) === 0) data.occurrences = null; else { const n = Number(b.occurrences); if (!Number.isInteger(n) || n < 1) return { data, error: 'Quantidade de vezes inv\u00e1lida.' }; data.occurrences = n } }
  if (b.autoDebit !== undefined) data.autoDebit = Boolean(b.autoDebit)
  if (b.amountIsVariable !== undefined) data.amountIsVariable = Boolean(b.amountIsVariable)
  if (!partial) {
    for (const k of ['description', 'personName', 'amount', 'dueDay', 'startDate']) if (data[k] === undefined) return { data, error: 'Descri\u00e7\u00e3o, favorecido, valor, dia de vencimento e in\u00edcio s\u00e3o obrigat\u00f3rios.' }
    if (!data.frequency) data.frequency = 'MONTHLY'
  }
  return { data }
}

export async function listBills(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    const rows = await prisma.recurringBill.findMany({ where: { clinicId, tenantId }, orderBy: [{ isActive: 'desc' }, { dueDay: 'asc' }], include: { _count: { select: { entries: true } } } })
    return res.json(rows)
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao listar contas recorrentes.' }) }
}

export async function createBill(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = context(req)
    const parsed = parseBill(req.body || {}, false)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    const row = await prisma.recurringBill.create({ data: { ...parsed.data, clinicId, tenantId, createdById: actorId } })
    const gen = await ensureRecurringEntries(clinicId, tenantId)
    await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'RECURRING_BILL_CREATE', entityType: 'RecurringBill', entityId: row.id, afterData: row, summary: `Conta recorrente: ${row.description}` })
    return res.status(201).json({ ...row, generated: gen.created })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao criar conta recorrente.' }) }
}

export async function updateBill(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = context(req); const id = String(req.params.id)
    const existing = await prisma.recurringBill.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Conta recorrente n\u00e3o encontrada.' })
    const parsed = parseBill(req.body || {}, true)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    const row = await prisma.recurringBill.update({ where: { id }, data: parsed.data })
    const prop: any = {}
    if (parsed.data.amount !== undefined) { prop.amount = row.amount; prop.netAmount = row.amount }
    for (const k of ['description', 'personName', 'category', 'supplierId', 'costCenterId', 'accountingAccountId']) if (parsed.data[k] !== undefined) prop[k] = (row as any)[k]
    if (parsed.data.autoDebit !== undefined) { prop.autoDebit = row.autoDebit; prop.paymentMethod = row.autoDebit ? 'DEBITO_AUTOMATICO' : row.paymentMethod }
    let updatedEntries = 0
    if (Object.keys(prop).length) updatedEntries = (await prisma.financialEntry.updateMany({ where: { clinicId, tenantId, recurringBillId: id, status: 'PENDING', dueDate: { gte: startOfTodayBR() } }, data: prop })).count
    await ensureRecurringEntries(clinicId, tenantId)
    await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'RECURRING_BILL_UPDATE', entityType: 'RecurringBill', entityId: id, beforeData: existing, afterData: row, summary: `Conta recorrente atualizada: ${row.description}` })
    return res.json({ ...row, updatedEntries })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao atualizar conta recorrente.' }) }
}

export async function deactivateBill(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = context(req); const id = String(req.params.id)
    const existing = await prisma.recurringBill.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Conta recorrente n\u00e3o encontrada.' })
    const row = await prisma.recurringBill.update({ where: { id }, data: { isActive: false, endDate: new Date() } })
    const cancelled = await prisma.financialEntry.updateMany({ where: { clinicId, tenantId, recurringBillId: id, status: 'PENDING', dueDate: { gte: nextMonthStartBR() } }, data: { status: 'CANCELLED' } })
    await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'RECURRING_BILL_DEACTIVATE', entityType: 'RecurringBill', entityId: id, beforeData: existing, afterData: row, summary: `Conta recorrente encerrada: ${row.description}` })
    return res.json({ ...row, cancelledEntries: cancelled.count })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao encerrar conta recorrente.' }) }
}

export async function forecastView(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    const months = Math.min(24, Math.max(1, Number(req.query.months) || 6))
    return res.json(await forecast(clinicId, tenantId, months))
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro na previs\u00e3o financeira.' }) }
}

export async function debtorsView(req: AuthRequest, res: Response) {
  try { const { clinicId, tenantId } = context(req); return res.json(await debtors(clinicId, tenantId)) }
  catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao listar inadimplentes.' }) }
}

export async function remindersView(req: AuthRequest, res: Response) {
  try { const { clinicId, tenantId } = context(req); return res.json(await reminders(clinicId, tenantId)) }
  catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao listar lembretes financeiros.' }) }
}