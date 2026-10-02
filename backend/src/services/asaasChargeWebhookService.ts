import { prisma } from '../lib/prisma'
import { writeAudit } from './auditService'

const METHOD: Record<string, string> = { PIX: 'PIX', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão', DEBIT_CARD: 'Cartão', UNDEFINED: 'PIX' }
const PAID_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']
const round2 = (n: number) => Math.round(n * 100) / 100

// Aplica um evento do Asaas às cobranças geradas pelo sistema (ReceivableCharge). Retorna true se o evento era de uma delas.
// clinicScope: quando o token do webhook é da própria clínica, só mexe nas cobranças dela.
export async function applyChargeEvent(clinicScope: string | null, eventType: string, payment: any): Promise<boolean> {
  const paymentId = String(payment?.id || '')
  if (!paymentId) return false
  const installmentId = payment?.installment ? String(payment.installment) : null
  const charge = await prisma.receivableCharge.findFirst({
    where: { ...(clinicScope ? { clinicId: clinicScope } : {}), OR: [{ externalId: paymentId }, ...(installmentId ? [{ installmentId }] : [])] },
    include: { splits: true }
  })
  if (!charge) return false

  if (PAID_EVENTS.includes(eventType)) {
    // Cartão parcelado envia confirmação e recebimento de cada parcela: conta cada parcela uma única vez.
    const paid = charge.paidPaymentIds.includes(paymentId) ? charge.paidPaymentIds : [...charge.paidPaymentIds, paymentId]
    const complete = paid.length >= Math.max(1, charge.installmentCount)
    const net = Number(payment?.netValue)
    await prisma.receivableCharge.update({
      where: { id: charge.id },
      data: {
        paidPaymentIds: paid,
        status: complete ? 'PAGO' : charge.status,
        ...(complete ? { paidAt: new Date() } : {}),
        ...(Number.isFinite(net) && charge.installmentCount === 1 ? { netValue: net } : {})
      }
    })
    if (complete) {
      const entry = await prisma.financialEntry.findFirst({ where: { id: charge.financialEntryId, clinicId: charge.clinicId } })
      if (entry && entry.status !== 'PAID') {
        await prisma.financialEntry.update({
          where: { id: entry.id },
          data: { status: 'PAID', paidAt: new Date(), settledByName: 'Asaas (automático)', paymentMethod: METHOD[String(payment?.billingType || charge.billingType)] || entry.paymentMethod, paymentReceipt: paymentId }
        })
      }
      for (const line of charge.splits) {
        if (line.status === 'CONFIRMADO') continue
        // Percentual do Asaas incide sobre o valor líquido recebido; valor fixo já era o final.
        const final = line.mode === 'PERCENT' && Number.isFinite(net) && charge.installmentCount === 1 && line.percent !== null
          ? round2((net * Number(line.percent)) / 100) : Number(line.plannedAmount)
        await prisma.paymentSplitLine.update({ where: { id: line.id }, data: { status: 'CONFIRMADO', confirmedAt: new Date(), finalAmount: final } })
      }
      await writeAudit({ clinicId: charge.clinicId, tenantId: charge.tenantId, module: 'finance', action: 'CHARGE_PAID', entityType: 'ReceivableCharge', entityId: charge.id, summary: `Cobrança paga (${paymentId}); lançamento baixado automaticamente.` }).catch((e: unknown) => console.error(e))
    }
    return true
  }

  if (eventType === 'PAYMENT_OVERDUE') {
    if (charge.status === 'PENDENTE') await prisma.receivableCharge.update({ where: { id: charge.id }, data: { status: 'VENCIDO' } })
    return true
  }

  if (eventType === 'PAYMENT_REFUNDED') {
    await prisma.receivableCharge.update({ where: { id: charge.id }, data: { status: 'ESTORNADO', paidAt: null } })
    await prisma.paymentSplitLine.updateMany({ where: { chargeId: charge.id }, data: { status: 'ESTORNADO' } })
    await prisma.financialEntry.updateMany({ where: { id: charge.financialEntryId, clinicId: charge.clinicId, status: 'PAID' }, data: { status: 'PENDING', paidAt: null, settledByName: null, paymentReceipt: null } })
    await writeAudit({ clinicId: charge.clinicId, tenantId: charge.tenantId, module: 'finance', action: 'CHARGE_REFUNDED', entityType: 'ReceivableCharge', entityId: charge.id, summary: 'Cobrança estornada no Asaas; lançamento voltou para pendente.' }).catch((e: unknown) => console.error(e))
    return true
  }

  if (eventType === 'PAYMENT_DELETED') {
    if (charge.status !== 'PAGO') {
      await prisma.receivableCharge.update({ where: { id: charge.id }, data: { status: 'CANCELADO' } })
      await prisma.paymentSplitLine.updateMany({ where: { chargeId: charge.id }, data: { status: 'CANCELADO' } })
    }
    return true
  }
  return true
}
