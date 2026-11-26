import { prisma } from '../lib/prisma'
import { writeAudit } from './auditService'
import { createAsaasPayment, ensureAsaasCustomer, loadAsaasConn } from './asaasService'

// Assinatura do paciente.
// - A mensalidade é cobrada (Pix pelo Asaas, ou baixa manual). Pago, o valor do plano vira crédito (saldo) do paciente.
// - Usar o crédito num procedimento dá desconto (padrão 10%): o saldo cai pelo valor COM desconto.
// - O crédito já foi receita quando a mensalidade foi paga; usar o crédito não gera nova receita (só extrato).
const round2 = (n: number) => Math.round(n * 100) / 100
const brNow = () => new Date(Date.now() - 3 * 3600000)
export const competenceOf = (d: Date) => d.toISOString().slice(0, 7)
export const membershipOrigin = 'ASSINATURA'

export async function creditInvoice(invoiceId: string, actorId?: string | null) {
  const inv = await prisma.membershipInvoice.findUnique({ where: { id: invoiceId } })
  if (!inv || inv.creditedAt) return false
  const member = await prisma.membership.findUnique({ where: { id: inv.memberId } })
  if (!member) return false
  const claimed = await prisma.membershipInvoice.updateMany({ where: { id: inv.id, creditedAt: null }, data: { status: 'PAGO', paidAt: inv.paidAt || new Date(), creditedAt: new Date() } })
  if (!claimed.count) return false
  const amount = Number(inv.creditAmount)
  const updated = await prisma.membership.update({ where: { id: member.id }, data: { balance: { increment: amount }, status: member.status === 'CANCELADA' ? member.status : 'ATIVA' } })
  await prisma.membershipLedger.create({ data: { clinicId: inv.clinicId, tenantId: inv.tenantId, memberId: member.id, movement: 'CREDITO', amount, balanceAfter: Number(updated.balance), description: `Mensalidade ${inv.competence} paga: crédito liberado`, actorId: actorId || null, idempotencyKey: `membership-invoice-${inv.id}` } })
  await writeAudit({ clinicId: inv.clinicId, tenantId: inv.tenantId, actorId: actorId || undefined, module: 'finance', action: 'MEMBERSHIP_CREDIT', entityType: 'MembershipInvoice', entityId: inv.id, summary: `Assinatura: mensalidade ${inv.competence} paga, crédito de R$ ${amount.toFixed(2)}.` }).catch((e: unknown) => console.error(e))
  return true
}

// Chamado pelo webhook do Asaas: o lançamento da assinatura foi pago.
export async function onEntryPaid(entryId: string) {
  const inv = await prisma.membershipInvoice.findFirst({ where: { financialEntryId: entryId } })
  if (inv) await creditInvoice(inv.id)
}

export async function generateInvoice(memberId: string, clinicId: string, competence?: string) {
  const member = await prisma.membership.findFirst({ where: { id: memberId, clinicId } })
  if (!member) throw new Error('Assinante não encontrado.')
  if (member.status === 'CANCELADA') throw new Error('Assinatura cancelada.')
  const plan = await prisma.membershipPlan.findFirst({ where: { id: member.planId, clinicId } })
  if (!plan) throw new Error('Plano não encontrado.')
  const patient = await prisma.patient.findFirst({ where: { id: member.patientId, clinicId } })
  if (!patient) throw new Error('Paciente não encontrado.')
  const comp = competence || competenceOf(brNow())
  const existing = await prisma.membershipInvoice.findUnique({ where: { memberId_competence: { memberId, competence: comp } } })
  if (existing) return { invoice: existing, reused: true }

  const [y, m] = comp.split('-').map(Number)
  const day = Math.min(member.billingDay, 28)
  let due = new Date(Date.UTC(y, m - 1, day, 12))
  const today = brNow(); today.setUTCHours(12, 0, 0, 0)
  if (due < today) due = today
  const amount = round2(Number(plan.monthlyPrice))

  const entry = await prisma.financialEntry.create({ data: { clinicId, tenantId: member.tenantId, patientId: patient.id, type: 'INCOME', description: `Assinatura ${plan.name} • ${comp}`, category: 'ASSINATURA', personName: patient.fullName, amount, dueDate: due, status: 'PENDING', paymentMethod: 'PIX', origin: membershipOrigin, originId: member.id, issuerEntity: 'INSTITUTO_RAVEL' } })
  const invoice = await prisma.membershipInvoice.create({ data: { clinicId, tenantId: member.tenantId, memberId, competence: comp, amount, creditAmount: round2(Number(plan.monthlyCredit)), dueDate: due, financialEntryId: entry.id } })

  const conn = await loadAsaasConn(clinicId).catch(() => null)
  if (!conn) return { invoice, reused: false, manual: true }
  try {
    const customerId = await ensureAsaasCustomer(conn, { externalReference: patient.id, name: patient.fullName, email: patient.email, phone: patient.phone, cpfCnpj: patient.cpf })
    const created = await createAsaasPayment(conn, { customerId, billingType: 'PIX', value: amount, dueDate: due.toISOString().slice(0, 10), description: entry.description, externalReference: entry.id })
    await prisma.receivableCharge.create({ data: { clinicId, tenantId: member.tenantId, financialEntryId: entry.id, provider: 'ASAAS', externalId: created.externalId, billingType: 'PIX', installmentCount: 1, value: amount, dueDate: due, status: 'PENDENTE', invoiceUrl: created.invoiceUrl, pixCopyPaste: created.pixCopyPaste } })
    await prisma.financialEntry.update({ where: { id: entry.id }, data: { externalId: created.externalId, provider: 'Asaas', documentUrl: created.invoiceUrl || undefined } })
    const withPix = await prisma.membershipInvoice.update({ where: { id: invoice.id }, data: { invoiceUrl: created.invoiceUrl || null, pixCopyPaste: created.pixCopyPaste || null } })
    return { invoice: withPix, reused: false }
  } catch (e) {
    console.error('Assinatura: falha ao gerar Pix no Asaas', e)
    return { invoice, reused: false, manual: true, warning: e instanceof Error ? e.message : 'Falha ao gerar o Pix.' }
  }
}

// Desconto do crédito: o paciente paga o procedimento com o saldo e o valor debitado já vem com o desconto do plano.
export function previewUse(procedureValue: number, discountPct: number) {
  const value = round2(procedureValue)
  const discount = round2(value * (discountPct / 100))
  return { procedureValue: value, discountAmount: discount, debit: round2(value - discount) }
}

export async function useCredit(input: { memberId: string; clinicId: string; procedureValue: number; description: string; actorId?: string; idempotencyKey?: string }) {
  const member = await prisma.membership.findFirst({ where: { id: input.memberId, clinicId: input.clinicId } })
  if (!member) throw new Error('Assinante não encontrado.')
  if (member.status === 'CANCELADA') throw new Error('Assinatura cancelada.')
  const plan = await prisma.membershipPlan.findFirst({ where: { id: member.planId } })
  const pct = Number(plan?.discountPct ?? 10)
  const p = previewUse(input.procedureValue, pct)
  if (!(p.procedureValue > 0)) throw new Error('Informe o valor do procedimento.')
  const done = await prisma.membership.updateMany({ where: { id: member.id, balance: { gte: p.debit } }, data: { balance: { decrement: p.debit } } })
  if (!done.count) throw new Error(`Saldo insuficiente: o procedimento com ${pct}% de desconto custa R$ ${p.debit.toFixed(2)} e o saldo é R$ ${Number(member.balance).toFixed(2)}.`)
  const after = await prisma.membership.findUniqueOrThrow({ where: { id: member.id } })
  const row = await prisma.membershipLedger.create({ data: { clinicId: input.clinicId, tenantId: member.tenantId, memberId: member.id, movement: 'USO', amount: -p.debit, balanceAfter: Number(after.balance), procedureValue: p.procedureValue, discountAmount: p.discountAmount, description: `${input.description} (desconto de ${pct}% pelo crédito da assinatura)`, actorId: input.actorId || null, idempotencyKey: input.idempotencyKey || null } })
  await writeAudit({ clinicId: input.clinicId, tenantId: member.tenantId, actorId: input.actorId, module: 'finance', action: 'MEMBERSHIP_USE', entityType: 'Membership', entityId: member.id, summary: `Assinatura: ${input.description}, valor R$ ${p.procedureValue.toFixed(2)}, desconto R$ ${p.discountAmount.toFixed(2)}, debitado R$ ${p.debit.toFixed(2)}.` }).catch((e: unknown) => console.error(e))
  return { ...p, discountPct: pct, balance: Number(after.balance), ledgerId: row.id }
}

// Cron: gera a cobrança do mês 3 dias antes do vencimento e marca inadimplentes (fatura vencida há mais de 5 dias).
export async function processMembershipBilling() {
  const today = brNow()
  const members = await prisma.membership.findMany({ where: { status: { in: ['ATIVA', 'INADIMPLENTE'] } } })
  for (const m of members) {
    try {
      if (today.getUTCDate() >= Math.min(m.billingDay, 28) - 3) await generateInvoice(m.id, m.clinicId)
    } catch (e) { console.error('Assinatura: cobrança mensal', m.id, e) }
  }
  const limit = new Date(today.getTime() - 5 * 86400000)
  const late = await prisma.membershipInvoice.findMany({ where: { status: 'PENDENTE', dueDate: { lt: limit } }, select: { memberId: true } })
  if (late.length) await prisma.membership.updateMany({ where: { id: { in: [...new Set(late.map((l) => l.memberId))] }, status: 'ATIVA' }, data: { status: 'INADIMPLENTE' } })
}
