import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado')
  return req.user
}

async function snapshotBudget(input: {
  budget: any
  reason: string
  clinicId: string
  tenantId: string
  actorId: string
  tx?: any
}) {
  const db = input.tx || prisma
  await db.budgetRevision.create({
    data: {
      clinicId: input.clinicId,
      tenantId: input.tenantId,
      budgetId: input.budget.id,
      version: input.budget.version,
      reason: input.reason,
      snapshot: input.budget,
      createdById: input.actorId,
    },
  })
}

export async function index(req: AuthRequest, res: Response) {
  try {
    const u = ctx(req)
    const rows = await prisma.budget.findMany({
      where: { clinicId: u.clinicId, tenantId: u.tenantId },
      include: { patient: true, payments: true },
      orderBy: { createdAt: 'desc' },
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar orçamentos.' })
  }
}

export async function show(req: AuthRequest, res: Response) {
  try {
    const u = ctx(req)
    const row = await prisma.budget.findFirst({
      where: { id: String(req.params.id), clinicId: u.clinicId, tenantId: u.tenantId },
      include: { patient: true, payments: true, revisions: { orderBy: { version: 'desc' } } },
    })
    if (!row) return res.status(404).json({ error: 'Orçamento não encontrado.' })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao buscar orçamento.' })
  }
}

export async function store(req: AuthRequest, res: Response) {
  try {
    const u = ctx(req)
    const b = req.body
    if (!b.patientId || !b.description || !b.totalAmount || !b.validUntil) {
      return res.status(400).json({ error: 'Paciente, descrição, valor e validade são obrigatórios.' })
    }
    const patient = await prisma.patient.findFirst({ where: { id: String(b.patientId), clinicId: u.clinicId, tenantId: u.tenantId } })
    if (!patient) return res.status(404).json({ error: 'Paciente não encontrado.' })
    const installments = Math.max(1, Number(b.installments || 1))
    const total = Number(b.totalAmount)
    const row = await prisma.budget.create({
      data: {
        clinicId: u.clinicId,
        tenantId: u.tenantId,
        patientId: String(b.patientId),
        description: String(b.description),
        totalAmount: total,
        installments,
        installmentValue: Number(b.installmentValue || total / installments),
        status: String(b.status || 'PENDING'),
        discountPercent: Number(b.discountPercent || 0),
        entryAmount: Number(b.entryAmount || 0),
        monthlyRatePercent: Number(b.monthlyRatePercent || 0),
        paymentMethod: String(b.paymentMethod || 'PIX'),
        paymentProvider: String(b.paymentProvider || 'MANUAL'),
        validUntil: new Date(b.validUntil),
        optionsJson: b.optionsJson || undefined,
        simulaClinicJson: b.simulaClinicJson || undefined,
      },
    })
    await writeAudit({ clinicId: u.clinicId, tenantId: u.tenantId, actorId: u.id, module: 'finance', action: 'BUDGET_CREATE', entityType: 'Budget', entityId: row.id, afterData: row, summary: `Orçamento ${row.description} criado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar orçamento.' })
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const u = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.budget.findFirst({ where: { id, clinicId: u.clinicId, tenantId: u.tenantId } })
    if (!existing) return res.status(404).json({ error: 'Orçamento não encontrado.' })
    if (existing.status === 'CANCELLED') return res.status(409).json({ error: 'Orçamento cancelado não pode ser alterado.' })
    const b = req.body
    const data: any = { version: existing.version + 1 }
    for (const k of ['description', 'status', 'paymentMethod', 'paymentProvider', 'optionsJson', 'simulaClinicJson']) if (b[k] !== undefined) data[k] = b[k]
    for (const k of ['totalAmount', 'installmentValue', 'discountPercent', 'entryAmount', 'monthlyRatePercent']) if (b[k] !== undefined) data[k] = Number(b[k])
    if (b.installments !== undefined) data.installments = Math.max(1, Number(b.installments))
    if (b.validUntil !== undefined) data.validUntil = new Date(b.validUntil)
    const row = await prisma.$transaction(async tx => {
      await snapshotBudget({ budget: existing, reason: String(b.changeReason || 'BUDGET_UPDATE'), clinicId: u.clinicId, tenantId: u.tenantId, actorId: u.id, tx })
      return tx.budget.update({ where: { id }, data })
    })
    await writeAudit({ clinicId: u.clinicId, tenantId: u.tenantId, actorId: u.id, module: 'finance', action: 'BUDGET_UPDATE', entityType: 'Budget', entityId: id, beforeData: existing, afterData: row, summary: `Orçamento ${row.description} atualizado.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar orçamento.' })
  }
}

export async function approve(req: AuthRequest, res: Response) {
  try {
    const u = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.budget.findFirst({ where: { id, clinicId: u.clinicId, tenantId: u.tenantId }, include: { patient: true, payments: true } })
    if (!existing) return res.status(404).json({ error: 'Orçamento não encontrado.' })
    if (existing.status === 'APPROVED') return res.json(existing)
    if (existing.status === 'CANCELLED') return res.status(409).json({ error: 'Orçamento cancelado não pode ser aprovado.' })

    const financed = Math.max(0, existing.totalAmount - existing.entryAmount)
    const count = Math.max(1, existing.installments)
    const corrected = financed * Math.pow(1 + existing.monthlyRatePercent / 100, count)
    const installmentValue = count ? corrected / count : 0
    const provider = existing.paymentProvider
    const method = existing.paymentMethod
    const now = new Date()
    const acceptedByName = req.body?.acceptedByName ? String(req.body.acceptedByName) : existing.patient.fullName
    const acceptedByDocument = req.body?.acceptedByDocument ? String(req.body.acceptedByDocument) : null
    const acceptanceEvidence = req.body?.acceptanceEvidence || { source: 'authenticated-clinic-session', acceptedAt: now.toISOString() }

    await prisma.$transaction(async tx => {
      await snapshotBudget({ budget: existing, reason: 'BUDGET_APPROVE', clinicId: u.clinicId, tenantId: u.tenantId, actorId: u.id, tx })
      await tx.budget.update({
        where: { id },
        data: { status: 'APPROVED', installmentValue, version: existing.version + 1, acceptedAt: now, acceptedByName, acceptedByDocument, acceptanceEvidence },
      })
      if (existing.entryAmount > 0) {
        await tx.payment.create({ data: { clinicId: u.clinicId, tenantId: u.tenantId, budgetId: id, amount: existing.entryAmount, grossAmount: existing.entryAmount, netAmount: existing.entryAmount, method, provider, installment: 0, dueDate: now, status: 'PENDING' } })
        await tx.financialEntry.create({ data: { clinicId: u.clinicId, tenantId: u.tenantId, patientId: existing.patientId, type: 'INCOME', description: `${existing.description} • Entrada`, category: 'TRATAMENTO', personName: existing.patient.fullName, amount: existing.entryAmount, dueDate: now, status: 'PENDING', paymentMethod: method, provider, origin: 'BUDGET', originId: id, installment: 0, installments: count } })
      }
      for (let i = 1; i <= count && financed > 0; i++) {
        const due = new Date(now)
        due.setMonth(due.getMonth() + i - (existing.entryAmount > 0 ? 0 : 1))
        await tx.payment.create({ data: { clinicId: u.clinicId, tenantId: u.tenantId, budgetId: id, amount: installmentValue, grossAmount: installmentValue, netAmount: installmentValue, method, provider, installment: i, dueDate: due, status: 'PENDING' } })
        await tx.financialEntry.create({ data: { clinicId: u.clinicId, tenantId: u.tenantId, patientId: existing.patientId, type: 'INCOME', description: `${existing.description} • Parcela ${i}/${count}`, category: 'TRATAMENTO', personName: existing.patient.fullName, amount: installmentValue, dueDate: due, status: 'PENDING', paymentMethod: method, provider, origin: 'BUDGET', originId: id, installment: i, installments: count } })
      }
    })
    const row = await prisma.budget.findUnique({ where: { id }, include: { patient: true, payments: true } })
    await writeAudit({ clinicId: u.clinicId, tenantId: u.tenantId, actorId: u.id, module: 'finance', action: 'BUDGET_APPROVE', entityType: 'Budget', entityId: id, beforeData: existing, afterData: row || undefined, summary: 'Orçamento aprovado com aceite registrado e contas a receber geradas.' })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao aprovar orçamento.' })
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const u = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.budget.findFirst({ where: { id, clinicId: u.clinicId, tenantId: u.tenantId } })
    if (!existing) return res.status(404).json({ error: 'Orçamento não encontrado.' })
    const row = await prisma.$transaction(async tx => {
      await snapshotBudget({ budget: existing, reason: String(req.body?.reason || 'BUDGET_CANCEL'), clinicId: u.clinicId, tenantId: u.tenantId, actorId: u.id, tx })
      return tx.budget.update({ where: { id }, data: { status: 'CANCELLED', version: existing.version + 1 } })
    })
    await writeAudit({ clinicId: u.clinicId, tenantId: u.tenantId, actorId: u.id, module: 'finance', action: 'BUDGET_CANCEL', entityType: 'Budget', entityId: id, beforeData: existing, afterData: row, summary: 'Orçamento cancelado sem exclusão física.' })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cancelar orçamento.' })
  }
}
