import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { sendChargeEmail } from '../services/chargeEmailService'
import { creditInvoice, generateInvoice, previewUse, useCredit } from '../services/membershipService'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN }
const fail = (res: Response, error: unknown, fallback: string, code = 400) => res.status(code).json({ error: error instanceof Error ? error.message : fallback })
const audit = (c: { clinicId: string; tenantId: string; actorId: string }, action: string, entityId: string, summary: string) =>
  writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'finance', action, entityType: 'Membership', entityId, summary }).catch((e: unknown) => console.error(e))

export async function plans(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    return res.json(await prisma.membershipPlan.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId }, orderBy: { monthlyPrice: 'asc' } }))
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao listar os planos.' }) }
}

export async function savePlan(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req); const b = req.body || {}
    const name = String(b.name || '').trim(); const price = num(b.monthlyPrice)
    const credit = b.monthlyCredit === undefined || b.monthlyCredit === '' ? price : num(b.monthlyCredit)
    const pct = b.discountPct === undefined || b.discountPct === '' ? 10 : num(b.discountPct)
    if (!name) return res.status(400).json({ error: 'Informe o nome do plano.' })
    if (!(price > 0)) return res.status(400).json({ error: 'Informe a mensalidade.' })
    if (!(credit > 0)) return res.status(400).json({ error: 'Informe o crédito mensal.' })
    if (!(pct >= 0 && pct <= 50)) return res.status(400).json({ error: 'O desconto deve ficar entre 0% e 50%.' })
    const data = { name, description: b.description ? String(b.description).slice(0, 400) : null, monthlyPrice: price, monthlyCredit: credit, discountPct: pct, ...(b.active !== undefined ? { active: Boolean(b.active) } : {}) }
    if (req.params.id) {
      const done = await prisma.membershipPlan.updateMany({ where: { id: String(req.params.id), clinicId: c.clinicId, tenantId: c.tenantId }, data })
      if (!done.count) return res.status(404).json({ error: 'Plano não encontrado.' })
      return res.json(await prisma.membershipPlan.findUnique({ where: { id: String(req.params.id) } }))
    }
    return res.status(201).json(await prisma.membershipPlan.create({ data: { clinicId: c.clinicId, tenantId: c.tenantId, ...data } }))
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao salvar o plano.' }) }
}

export async function members(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const rows = await prisma.membership.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId }, orderBy: { createdAt: 'desc' }, take: 1000 })
    const ids = rows.map((r) => r.id)
    const [patients, planRows, invoices] = await Promise.all([
      prisma.patient.findMany({ where: { id: { in: rows.map((r) => r.patientId) } }, select: { id: true, fullName: true, phone: true, email: true } }),
      prisma.membershipPlan.findMany({ where: { clinicId: c.clinicId } }),
      prisma.membershipInvoice.findMany({ where: { memberId: { in: ids } }, orderBy: { competence: 'desc' } }),
    ])
    const pById = new Map(patients.map((p) => [p.id, p])); const planById = new Map(planRows.map((p) => [p.id, p]))
    const out = rows.map((m) => {
      const inv = invoices.filter((i) => i.memberId === m.id)
      const open = inv.find((i) => i.status === 'PENDENTE')
      const plan = planById.get(m.planId)
      return { ...m, balance: Number(m.balance), patient: pById.get(m.patientId) || null, plan: plan ? { id: plan.id, name: plan.name, monthlyPrice: Number(plan.monthlyPrice), discountPct: Number(plan.discountPct) } : null, openInvoice: open ? { ...open, amount: Number(open.amount), creditAmount: Number(open.creditAmount) } : null, paidInvoices: inv.filter((i) => i.status === 'PAGO').length }
    })
    const active = out.filter((m) => m.status === 'ATIVA')
    return res.json({ members: out, summary: { active: active.length, late: out.filter((m) => m.status === 'INADIMPLENTE').length, waiting: out.filter((m) => m.status === 'AGUARDANDO_PAGAMENTO').length, monthlyRevenue: active.reduce((s, m) => s + (m.plan?.monthlyPrice || 0), 0), creditBalance: out.reduce((s, m) => s + m.balance, 0) } })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao listar os assinantes.' }) }
}

export async function subscribe(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req); const b = req.body || {}
    const patient = await prisma.patient.findFirst({ where: { id: String(b.patientId || ''), clinicId: c.clinicId, tenantId: c.tenantId }, select: { id: true } })
    if (!patient) return res.status(404).json({ error: 'Paciente não encontrado.' })
    const plan = await prisma.membershipPlan.findFirst({ where: { id: String(b.planId || ''), clinicId: c.clinicId, tenantId: c.tenantId, active: true } })
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado.' })
    const dup = await prisma.membership.findFirst({ where: { clinicId: c.clinicId, patientId: patient.id, status: { not: 'CANCELADA' } } })
    if (dup) return res.status(409).json({ error: 'Este paciente já tem uma assinatura.' })
    const day = Math.min(28, Math.max(1, Math.floor(num(b.billingDay)) || new Date(Date.now() - 3 * 3600000).getUTCDate()))
    const member = await prisma.membership.create({ data: { clinicId: c.clinicId, tenantId: c.tenantId, patientId: patient.id, planId: plan.id, billingDay: day } })
    await audit(c, 'MEMBERSHIP_SUBSCRIBE', member.id, `Assinatura: novo assinante no plano ${plan.name}.`)
    // A primeira mensalidade já sai com o Pix, para mandar ao paciente na hora.
    const first = await generateInvoice(member.id, c.clinicId).catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'Falha ao gerar a cobrança.' }))
    return res.status(201).json({ member, first })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao criar a assinatura.' }) }
}

export async function charge(req: AuthRequest, res: Response) {
  try {
    const r = await generateInvoice(String(req.params.id), ctx(req).clinicId, req.body?.competence ? String(req.body.competence) : undefined)
    return res.status(r.reused ? 200 : 201).json(r)
  } catch (e) { return fail(res, e, 'Erro ao gerar a cobrança.') }
}

// Envia o Pix da mensalidade em aberto ao paciente (e-mail) e devolve o texto pronto para WhatsApp.
export async function sendPix(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const member = await prisma.membership.findFirst({ where: { id: String(req.params.id), clinicId: c.clinicId } })
    if (!member) return res.status(404).json({ error: 'Assinante não encontrado.' })
    const inv = await prisma.membershipInvoice.findFirst({ where: { memberId: member.id, status: 'PENDENTE' }, orderBy: { dueDate: 'asc' } })
    if (!inv) return res.status(409).json({ error: 'Não há mensalidade em aberto.' })
    const patient = await prisma.patient.findFirst({ where: { id: member.patientId } })
    const email = await sendChargeEmail({ clinicId: c.clinicId, tenantId: c.tenantId, patientName: patient?.fullName || '', email: patient?.email, charge: { value: Number(inv.amount), dueDate: inv.dueDate, billingType: 'PIX', invoiceUrl: inv.invoiceUrl, pixCopyPaste: inv.pixCopyPaste, digitableLine: null } }).catch((e: unknown) => ({ sent: false, to: null, reason: e instanceof Error ? e.message : 'Falha no envio.' }))
    const first = (patient?.fullName || '').split(/\s+/)[0] || 'tudo bem'
    const iso = inv.dueDate.toISOString()
    const text = `Olá, ${first}! Sua mensalidade da assinatura (R$ ${Number(inv.amount).toFixed(2).replace('.', ',')}) vence em ${iso.slice(8, 10)}/${iso.slice(5, 7)}.${inv.pixCopyPaste ? `\n\nPix copia e cola:\n${inv.pixCopyPaste}` : ''}${inv.invoiceUrl ? `\n\nPagar pelo link: ${inv.invoiceUrl}` : ''}`
    return res.json({ email, text, phone: String(patient?.phone || '').replace(/\D/g, ''), hasPix: Boolean(inv.pixCopyPaste || inv.invoiceUrl) })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao enviar o Pix.' }) }
}

// Baixa manual: o paciente pagou direto na clínica.
export async function markPaid(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const inv = await prisma.membershipInvoice.findFirst({ where: { id: String(req.params.invoiceId), clinicId: c.clinicId } })
    if (!inv) return res.status(404).json({ error: 'Mensalidade não encontrada.' })
    if (inv.financialEntryId) await prisma.financialEntry.updateMany({ where: { id: inv.financialEntryId, clinicId: c.clinicId, status: { not: 'PAID' } }, data: { status: 'PAID', paidAt: new Date(), settledById: c.actorId, settledByName: 'Baixa manual (assinatura)', cashDestination: 'CAIXA' } })
    return res.json({ credited: await creditInvoice(inv.id, c.actorId) })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao dar baixa.' }) }
}

export async function preview(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const member = await prisma.membership.findFirst({ where: { id: String(req.params.id), clinicId: c.clinicId } })
    if (!member) return res.status(404).json({ error: 'Assinante não encontrado.' })
    const plan = await prisma.membershipPlan.findFirst({ where: { id: member.planId } })
    const pct = Number(plan?.discountPct ?? 10)
    const p = previewUse(num(req.query.value) || 0, pct)
    return res.json({ ...p, discountPct: pct, balance: Number(member.balance), enough: Number(member.balance) >= p.debit })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao calcular.' }) }
}

export async function use(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req); const b = req.body || {}
    return res.status(201).json(await useCredit({ memberId: String(req.params.id), clinicId: c.clinicId, procedureValue: num(b.value), description: String(b.description || 'Procedimento').slice(0, 200), actorId: c.actorId }))
  } catch (e) { return fail(res, e, 'Erro ao usar o crédito.', 409) }
}

export async function adjust(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req); const amount = num(req.body?.amount); const reason = String(req.body?.reason || '').trim()
    if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'Informe o valor do ajuste.' })
    if (!reason) return res.status(400).json({ error: 'Informe o motivo do ajuste.' })
    const member = await prisma.membership.findFirst({ where: { id: String(req.params.id), clinicId: c.clinicId } })
    if (!member) return res.status(404).json({ error: 'Assinante não encontrado.' })
    const done = await prisma.membership.updateMany({ where: { id: member.id, ...(amount < 0 ? { balance: { gte: -amount } } : {}) }, data: { balance: { increment: amount } } })
    if (!done.count) return res.status(409).json({ error: 'O ajuste deixaria o saldo negativo.' })
    const after = await prisma.membership.findUniqueOrThrow({ where: { id: member.id } })
    await prisma.membershipLedger.create({ data: { clinicId: c.clinicId, tenantId: c.tenantId, memberId: member.id, movement: 'AJUSTE', amount, balanceAfter: Number(after.balance), description: reason.slice(0, 200), actorId: c.actorId } })
    await audit(c, 'MEMBERSHIP_ADJUST', member.id, `Assinatura: ajuste de R$ ${amount.toFixed(2)} (${reason}).`)
    return res.json({ balance: Number(after.balance) })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao ajustar o saldo.' }) }
}

export async function setStatus(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req); const status = String(req.body?.status || '')
    if (!['ATIVA', 'PAUSADA', 'CANCELADA'].includes(status)) return res.status(400).json({ error: 'Situação inválida.' })
    const done = await prisma.membership.updateMany({ where: { id: String(req.params.id), clinicId: c.clinicId, tenantId: c.tenantId }, data: { status, cancelledAt: status === 'CANCELADA' ? new Date() : null } })
    if (!done.count) return res.status(404).json({ error: 'Assinante não encontrado.' })
    await audit(c, 'MEMBERSHIP_STATUS', String(req.params.id), `Assinatura marcada como ${status}.`)
    return res.json({ ok: true })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao alterar a situação.' }) }
}

export async function ledger(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const rows = await prisma.membershipLedger.findMany({ where: { memberId: String(req.params.id), clinicId: c.clinicId }, orderBy: { createdAt: 'desc' }, take: 200 })
    const n = (v: unknown) => (v === null ? null : Number(v))
    return res.json(rows.map((r) => ({ ...r, amount: Number(r.amount), balanceAfter: Number(r.balanceAfter), procedureValue: n(r.procedureValue), discountAmount: n(r.discountAmount) })))
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao carregar o extrato.' }) }
}
