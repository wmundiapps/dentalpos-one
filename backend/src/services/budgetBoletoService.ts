import { PDFDocument } from 'pdf-lib'
import { prisma } from '../lib/prisma'
import { AsaasError, asaasCall, createAsaasPayment, ensureAsaasCustomer, loadAsaasConn } from './asaasService'

const todayBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const ACTIVE = ['PENDENTE', 'VENCIDO']

export type BoletoResult = { installment: number; amount: number; dueDate: string; bankSlipUrl: string | null; digitableLine: string | null; error?: string }

// Emite (ou reaproveita) o boleto de cada parcela em aberto de um orçamento aprovado e junta tudo num único PDF (sem e-mail ao paciente).
export async function issueBudgetBoletos(c: { clinicId: string; tenantId: string; actorId: string }, budgetId: string) {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, clinicId: c.clinicId, tenantId: c.tenantId }, include: { patient: true, payments: true } })
  if (!budget) throw Object.assign(new Error('Orçamento não encontrado.'), { status: 404 })
  if (budget.status !== 'APPROVED') throw Object.assign(new Error('Aprove o orçamento antes de emitir os boletos.'), { status: 409 })
  const conn = await loadAsaasConn(c.clinicId)
  if (!conn) throw Object.assign(new Error('Conecte a conta Asaas da clínica em Financeiro → Recebimentos online para emitir boletos.'), { status: 409 })
  const patient = budget.patient
  const doc = String(patient.cpf || '').replace(/\D/g, '')
  if (doc.length !== 11 && doc.length !== 14) throw Object.assign(new Error('O paciente precisa ter CPF ou CNPJ válido no cadastro para emitir boletos.'), { status: 422 })

  const pays = budget.payments.filter((p) => p.installment >= 1 && p.status !== 'PAID' && p.status !== 'RECEIVED' && !p.paidDate).sort((a, b) => a.installment - b.installment)
  if (!pays.length) throw Object.assign(new Error('Não há parcelas em aberto neste orçamento.'), { status: 409 })
  const customerId = await ensureAsaasCustomer(conn, { externalReference: patient.id, name: patient.fullName, email: patient.email, phone: patient.phone, cpfCnpj: doc })

  const results: BoletoResult[] = []
  for (const p of pays) {
    const base = { installment: p.installment, amount: Number(p.amount), dueDate: ymd(p.dueDate) }
    try {
      const entry = await prisma.financialEntry.findFirst({ where: { clinicId: c.clinicId, tenantId: c.tenantId, origin: 'BUDGET', originId: budget.id, installment: p.installment } })
      if (!entry) throw new Error('Lançamento financeiro da parcela não encontrado.')
      const existing = await prisma.receivableCharge.findFirst({ where: { clinicId: c.clinicId, financialEntryId: entry.id, status: { in: ACTIVE }, billingType: 'BOLETO' } })
      if (existing) {
        const remote = await asaasCall(conn, `/payments/${existing.externalId}`)
        results.push({ ...base, bankSlipUrl: remote?.bankSlipUrl || existing.invoiceUrl || null, digitableLine: existing.digitableLine })
        continue
      }
      const amount = Math.round(Number(p.amount) * 100) / 100
      const dueDate = ymd(p.dueDate) < todayBr() ? todayBr() : ymd(p.dueDate)
      const created = await createAsaasPayment(conn, { customerId, billingType: 'BOLETO', value: amount, dueDate, description: `${budget.description} • Parcela ${p.installment}/${budget.installments}`.slice(0, 500), externalReference: entry.id })
      await prisma.$transaction(async (tx) => {
        await tx.receivableCharge.create({ data: { clinicId: c.clinicId, tenantId: c.tenantId, financialEntryId: entry.id, provider: 'ASAAS', externalId: created.externalId, installmentId: created.installmentId, billingType: 'BOLETO', installmentCount: 1, value: amount, dueDate: new Date(`${dueDate}T12:00:00Z`), status: 'PENDENTE', invoiceUrl: created.invoiceUrl, pixCopyPaste: created.pixCopyPaste, barcode: created.barcode, digitableLine: created.digitableLine, createdById: c.actorId } })
        await tx.financialEntry.update({ where: { id: entry.id }, data: { externalId: created.externalId, provider: 'Asaas', documentUrl: created.invoiceUrl || undefined, barcode: created.barcode || undefined, digitableLine: created.digitableLine || undefined } })
      })
      results.push({ ...base, dueDate, bankSlipUrl: (created.raw as { bankSlipUrl?: string })?.bankSlipUrl || created.invoiceUrl || null, digitableLine: created.digitableLine || null })
    } catch (e) {
      results.push({ ...base, bankSlipUrl: null, digitableLine: null, error: e instanceof AsaasError || e instanceof Error ? e.message : 'Falha ao emitir.' })
    }
  }

  // Junta os PDFs dos boletos (um por parcela, na ordem).
  const merged = await PDFDocument.create()
  let pages = 0
  for (const r of results) {
    if (!r.bankSlipUrl) continue
    try {
      const resp = await fetch(r.bankSlipUrl, { redirect: 'follow' })
      const buf = new Uint8Array(await resp.arrayBuffer())
      if (!resp.ok || String(resp.headers.get('content-type') || '').indexOf('pdf') < 0) throw new Error('PDF indisponível')
      const src = await PDFDocument.load(buf)
      const copied = await merged.copyPages(src, src.getPageIndices())
      copied.forEach((pg) => merged.addPage(pg))
      pages += copied.length
    } catch { r.error = r.error || 'Boleto emitido, mas o PDF não pôde ser baixado agora. Use o link do financeiro.' }
  }
  const pdfBase64 = pages ? Buffer.from(await merged.save()).toString('base64') : null
  return { boletos: results, pdfBase64, patientName: patient.fullName }
}
