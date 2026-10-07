import { sendChargeEmail, EMAIL_RE, type ChargeEmailResult } from '../services/chargeEmailService'
import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { AsaasError, cancelAsaasPayment, createAsaasPayment, ensureAsaasCustomer, loadAsaasConn } from '../services/asaasService'
import { resolveSplit, type SplitRequest } from '../services/splitRuleService'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

const BILLING: Record<string, 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED'> = { PIX: 'PIX', BOLETO: 'BOLETO', CARTAO: 'CREDIT_CARD', CARTÃO: 'CREDIT_CARD', CREDIT_CARD: 'CREDIT_CARD', ESCOLHER: 'UNDEFINED', UNDEFINED: 'UNDEFINED' }
const WALLET = /^[0-9a-f-]{32,40}$/i
const todayBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
const ymd = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10)
const ACTIVE = ['PENDENTE', 'VENCIDO']

function publicCharge(c: any) {
  return {
    id: c.id, financialEntryId: c.financialEntryId, billingType: c.billingType, installmentCount: c.installmentCount,
    value: Number(c.value), dueDate: c.dueDate, status: c.status, invoiceUrl: c.invoiceUrl, pixCopyPaste: c.pixCopyPaste,
    barcode: c.barcode, digitableLine: c.digitableLine, paidAt: c.paidAt, createdAt: c.createdAt,
    splits: (c.splits || []).map((s: any) => ({ id: s.id, doctorId: s.doctorId, mode: s.mode, percent: s.percent === null ? null : Number(s.percent), plannedAmount: Number(s.plannedAmount), finalAmount: s.finalAmount === null ? null : Number(s.finalAmount), status: s.status }))
  }
}

// A clínica já pode cobrar? (conta Asaas conectada e ativa)
export async function readiness(req: AuthRequest, res: Response) {
  try {
    const { clinicId } = ctx(req)
    const conn = await loadAsaasConn(clinicId).catch(() => null)
    return res.json({ ready: Boolean(conn), environment: conn?.environment || null })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao verificar a conta de recebimento.' })
  }
}

export async function listCharges(req: AuthRequest, res: Response) {
  try {
    const { clinicId } = ctx(req)
    const ids = String(req.query.entryIds || '').split(',').map(s => s.trim()).filter(Boolean)
    const rows = await prisma.receivableCharge.findMany({
      where: { clinicId, ...(ids.length ? { financialEntryId: { in: ids } } : {}), status: { not: 'CANCELADO' } },
      include: { splits: true },
      orderBy: { createdAt: 'desc' },
      take: 2000
    })
    return res.json(rows.map(publicCharge))
  } catch (error) {
    console.error('Erro ao listar cobranças:', error)
    return res.status(500).json({ error: 'Erro ao listar cobranças.' })
  }
}

// Gera a cobrança real no Asaas da clínica para um lançamento a receber, com divisão automática (split) opcional.
export async function createForEntry(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const entryId = String(req.params.id)
    const b = req.body || {}
    const entry = await prisma.financialEntry.findFirst({ where: { id: entryId, clinicId, tenantId }, include: { patient: true } })
    if (!entry) return res.status(404).json({ error: 'Lançamento não encontrado.' })
    if (entry.type !== 'INCOME') return res.status(400).json({ error: 'Só lançamentos a receber podem gerar cobrança.' })
    if (entry.status === 'PAID' || entry.status === 'CANCELLED') return res.status(409).json({ error: 'Este lançamento já foi pago ou cancelado.' })

    const existing = await prisma.receivableCharge.findFirst({ where: { clinicId, financialEntryId: entryId, status: { in: ACTIVE } }, include: { splits: true } })
    if (existing) return res.status(200).json({ ...publicCharge(existing), reused: true })

    const conn = await loadAsaasConn(clinicId)
    if (!conn) return res.status(409).json({ error: 'Conecte a conta Asaas da clínica em Financeiro → Recebimentos online antes de gerar cobranças.' })

    const billingType = BILLING[String(b.billingType || 'ESCOLHER').toUpperCase()]
    if (!billingType) return res.status(400).json({ error: 'Forma de cobrança inválida.' })
    const installments = billingType === 'CREDIT_CARD' ? Math.min(12, Math.max(1, Math.floor(Number(b.installments) || 1))) : 1
    const amount = Math.round(Number(entry.amount) * 100) / 100
    if (!(amount > 0)) return res.status(400).json({ error: 'Valor do lançamento inválido.' })

    const today = todayBr()
    const entryDue = ymd(entry.dueDate)
    const requested = b.dueDate ? String(b.dueDate).slice(0, 10) : entryDue
    const dueDate = requested < today ? today : requested

    const patient = entry.patient
    const name = (patient?.fullName || entry.personName || '').trim()
    if (!name) return res.status(400).json({ error: 'Informe o nome do cliente.' })
    const customer = { externalReference: patient?.id || `entry-${entry.id}`, name, email: b.customer?.email || patient?.email, phone: b.customer?.phone || patient?.phone, cpfCnpj: b.customer?.cpfCnpj || patient?.cpf }

    const typedDoc = String(b.customer?.cpfCnpj || '').replace(/\D/g, '')
    if (b.customer?.cpfCnpj && typedDoc.length !== 11 && typedDoc.length !== 14) return res.status(400).json({ error: 'CPF ou CNPJ inválido: informe 11 dígitos (CPF) ou 14 (CNPJ).' })
    if (b.customer?.email && !EMAIL_RE.test(String(b.customer.email).trim())) return res.status(400).json({ error: 'E-mail inválido.' })

    // Divisão automática com o dentista (carteira Asaas dele cadastrada em Recebimentos online).
    let splitPlan: ReturnType<typeof resolveSplit> | null = null
    let walletId = ''
    let doctorId = ''
    if (b.split?.doctorId) {
      const split = b.split as SplitRequest
      doctorId = String(split.doctorId)
      const doctor = await prisma.doctor.findFirst({ where: { id: doctorId, clinicId, tenantId, isActive: true }, include: { user: { select: { firstName: true, lastName: true } } } })
      if (!doctor) return res.status(404).json({ error: 'Dentista não encontrado.' })
      const account = await prisma.paymentAccount.findFirst({ where: { clinicId, doctorId, beneficiaryType: 'DENTISTA' } })
      walletId = String(account?.externalAccountId || '')
      if (!WALLET.test(walletId)) return res.status(409).json({ error: 'Este dentista ainda não tem a carteira (walletId) do Asaas cadastrada em Recebimentos online.' })
      splitPlan = resolveSplit(split, doctor, amount, installments)
      if (!splitPlan.ok) return res.status(400).json({ error: splitPlan.error })
    }

    let created
    try {
      const customerId = await ensureAsaasCustomer(conn, customer)
      created = await createAsaasPayment(conn, {
        customerId, billingType, value: amount, dueDate,
        description: `${entry.description}`.slice(0, 500), externalReference: entry.id, installmentCount: installments,
        ...(splitPlan && splitPlan.ok ? { split: [{ walletId, ...splitPlan.split.asaas }] } : {})
      })
    } catch (error) {
      const status = error instanceof AsaasError && error.status >= 400 && error.status < 500 ? 422 : 502
      return res.status(status).json({ error: error instanceof Error ? error.message : 'Falha ao criar cobrança no Asaas.' })
    }

    try {
      const charge = await prisma.$transaction(async tx => {
        const row = await tx.receivableCharge.create({
          data: {
            clinicId, tenantId, financialEntryId: entry.id, provider: 'ASAAS', externalId: created.externalId, installmentId: created.installmentId,
            billingType, installmentCount: installments, value: amount, dueDate: new Date(`${dueDate}T12:00:00Z`), status: 'PENDENTE',
            invoiceUrl: created.invoiceUrl, pixCopyPaste: created.pixCopyPaste, barcode: created.barcode, digitableLine: created.digitableLine, createdById: actorId
          }
        })
        if (splitPlan && splitPlan.ok) {
          await tx.paymentSplitLine.create({
            data: { clinicId, tenantId, chargeId: row.id, doctorId, walletId, mode: splitPlan.split.line.mode, percent: splitPlan.split.line.percent, plannedAmount: splitPlan.split.line.plannedAmount }
          })
        }
        await tx.financialEntry.update({ where: { id: entry.id }, data: { externalId: created.externalId, provider: 'Asaas', documentUrl: created.invoiceUrl || undefined, barcode: created.barcode || undefined, digitableLine: created.digitableLine || undefined } })
        return tx.receivableCharge.findUniqueOrThrow({ where: { id: row.id }, include: { splits: true } })
      })
      await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'CHARGE_CREATE', entityType: 'ReceivableCharge', entityId: charge.id, summary: `Cobrança ${billingType} de R$ ${amount.toFixed(2)} para ${name}${splitPlan?.ok ? ' com repasse automático' : ''}.`, metadata: { entryId: entry.id, externalId: created.externalId } }).catch((e: unknown) => console.error(e))
      // Guarda no cadastro do paciente o que faltava (CPF/CNPJ, e-mail, telefone) para as próximas cobranças.
      if (patient) {
        const patch: Record<string, string> = {}
        if (!patient.cpf && typedDoc) patch.cpf = typedDoc
        if (!patient.email && b.customer?.email) patch.email = String(b.customer.email).trim().toLowerCase()
        if (Object.keys(patch).length) await prisma.patient.update({ where: { id: patient.id }, data: patch }).catch((e: unknown) => console.error(e))
      }
      // O paciente recebe SEMPRE a cobrança por e-mail (link, Pix e linha digitável).
      const email = await sendChargeEmail({
        clinicId, tenantId, patientName: name, email: String(b.customer?.email || patient?.email || '').trim(),
        charge: { value: amount, dueDate: new Date(`${dueDate}T12:00:00Z`), billingType, invoiceUrl: created.invoiceUrl, pixCopyPaste: created.pixCopyPaste, digitableLine: created.digitableLine },
      }).catch((e: unknown): ChargeEmailResult => ({ sent: false, to: null, reason: e instanceof Error ? e.message : 'Falha no envio.' }))
      return res.status(201).json({ ...publicCharge(charge), email })
    } catch (error) {
      // A cobrança existe no Asaas mas não foi gravada: cancela lá para não ficar uma cobrança "fantasma" para o paciente.
      console.error('Erro ao gravar cobrança; cancelando no Asaas:', error)
      await cancelAsaasPayment(conn, created.externalId, created.installmentId).catch((e: unknown) => console.error(e))
      return res.status(500).json({ error: 'A cobrança não pôde ser registrada no sistema e foi cancelada no Asaas. Tente de novo.' })
    }
  } catch (error) {
    console.error('Erro ao gerar cobrança:', error)
    return res.status(500).json({ error: 'Erro ao gerar cobrança.' })
  }
}

export async function cancelCharge(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const charge = await prisma.receivableCharge.findFirst({ where: { id: String(req.params.id), clinicId } })
    if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada.' })
    if (charge.status === 'PAGO') return res.status(409).json({ error: 'Cobrança já paga: não pode ser cancelada.' })
    if (charge.status === 'CANCELADO') return res.json({ ok: true })
    const conn = await loadAsaasConn(clinicId)
    if (!conn) return res.status(409).json({ error: 'Conta Asaas não está conectada.' })
    try { await cancelAsaasPayment(conn, charge.externalId, charge.installmentId) }
    catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha ao cancelar no Asaas.'
      // Já removida no Asaas: segue e marca como cancelada aqui também.
      if (!(error instanceof AsaasError && error.status === 404)) return res.status(422).json({ error: msg })
    }
    await prisma.$transaction([
      prisma.receivableCharge.update({ where: { id: charge.id }, data: { status: 'CANCELADO' } }),
      prisma.paymentSplitLine.updateMany({ where: { chargeId: charge.id }, data: { status: 'CANCELADO' } })
    ])
    await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'CHARGE_CANCEL', entityType: 'ReceivableCharge', entityId: charge.id, summary: 'Cobrança cancelada.' }).catch((e: unknown) => console.error(e))
    return res.json({ ok: true })
  } catch (error) {
    console.error('Erro ao cancelar cobrança:', error)
    return res.status(500).json({ error: 'Erro ao cancelar cobrança.' })
  }
}

// Reenvia (ou envia pela primeira vez) a cobrança por e-mail ao paciente. Se o paciente não tem e-mail, o informado aqui é salvo no cadastro.
export async function sendEmail(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const charge = await prisma.receivableCharge.findFirst({ where: { id: String(req.params.id), clinicId, tenantId } })
    if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada.' })
    const entry = await prisma.financialEntry.findFirst({ where: { id: charge.financialEntryId, clinicId, tenantId }, include: { patient: true } })
    const patient = entry?.patient || null
    const typed = String(req.body?.email || '').trim().toLowerCase()
    if (typed && !EMAIL_RE.test(typed)) return res.status(400).json({ error: 'E-mail inválido.' })
    const email = typed || String(patient?.email || '').trim()
    if (typed && patient && !patient.email) await prisma.patient.update({ where: { id: patient.id }, data: { email: typed } }).catch((e: unknown) => console.error(e))
    const result = await sendChargeEmail({
      clinicId, tenantId, patientName: patient?.fullName || entry?.personName || 'paciente', email,
      charge: { value: Number(charge.value), dueDate: charge.dueDate, billingType: charge.billingType, invoiceUrl: charge.invoiceUrl, pixCopyPaste: charge.pixCopyPaste, digitableLine: charge.digitableLine },
    })
    return res.json(result)
  } catch (error) {
    console.error('Erro ao enviar cobrança por e-mail:', error)
    return res.status(500).json({ error: 'Erro ao enviar a cobrança por e-mail.' })
  }
}
