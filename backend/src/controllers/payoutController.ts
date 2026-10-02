import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { suggestRule } from '../services/splitRuleService'

const WALLET = /^[0-9a-f-]{32,40}$/i

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

const doctorName = (d: { user?: { firstName: string; lastName: string } | null }) => `${d.user?.firstName || ''} ${d.user?.lastName || ''}`.trim() || 'Dentista'

// Dentistas com a regra de repasse do cadastro e a carteira (walletId) do Asaas para o split.
export async function accounts(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const doctors = await prisma.doctor.findMany({ where: { clinicId, tenantId, isActive: true }, include: { user: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' } })
    const accts = await prisma.paymentAccount.findMany({ where: { clinicId, beneficiaryType: 'DENTISTA', doctorId: { in: doctors.map(d => d.id) } } })
    const byDoctor = new Map(accts.map(a => [a.doctorId, a]))
    return res.json(doctors.map(d => {
      const rule = suggestRule(d)
      const account = byDoctor.get(d.id)
      return {
        doctorId: d.id, name: doctorName(d), contractType: d.contractType, revenueModel: d.revenueModel,
        rule: rule.ok ? { ok: true, percent: rule.percent, base: rule.base, label: rule.label } : { ok: false, reason: rule.reason },
        walletId: account?.externalAccountId || '', ready: Boolean(account?.externalAccountId && WALLET.test(account.externalAccountId))
      }
    }))
  } catch (error) {
    console.error('Erro ao listar contas de repasse:', error)
    return res.status(500).json({ error: 'Erro ao listar contas de repasse.' })
  }
}

export async function saveAccount(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const doctorId = String(req.params.doctorId)
    const doctor = await prisma.doctor.findFirst({ where: { id: doctorId, clinicId, tenantId }, include: { user: { select: { firstName: true, lastName: true } } } })
    if (!doctor) return res.status(404).json({ error: 'Dentista não encontrado.' })
    const walletId = String(req.body?.walletId || '').trim()
    if (walletId && !WALLET.test(walletId)) return res.status(400).json({ error: 'Wallet ID inválido. Copie o identificador completo da carteira no painel Asaas do dentista.' })
    const holderDocument = String(doctor.cnpj || doctor.cpf || req.body?.holderDocument || '').replace(/\D/g, '')
    const data = {
      holderName: doctorName(doctor), holderDocument, holderType: doctor.cnpj ? 'PJ' : 'PF',
      externalAccountId: walletId || null, status: walletId ? 'ATIVO' : 'PENDENTE'
    }
    const existing = await prisma.paymentAccount.findFirst({ where: { clinicId, doctorId, beneficiaryType: 'DENTISTA' } })
    const row = existing
      ? await prisma.paymentAccount.update({ where: { id: existing.id }, data })
      : await prisma.paymentAccount.create({ data: { clinicId, tenantId, provider: 'ASAAS', beneficiaryType: 'DENTISTA', doctorId, ...data } })
    await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'PAYOUT_ACCOUNT_SAVE', entityType: 'PaymentAccount', entityId: row.id, summary: `Carteira de repasse de ${doctorName(doctor)} ${walletId ? 'cadastrada' : 'removida'}.` }).catch((e: unknown) => console.error(e))
    return res.json({ doctorId, walletId: row.externalAccountId || '', ready: Boolean(row.externalAccountId) })
  } catch (error) {
    console.error('Erro ao salvar conta de repasse:', error)
    return res.status(500).json({ error: 'Erro ao salvar conta de repasse.' })
  }
}

// Extrato de repasses por dentista (previsto, confirmado, estornado).
export async function statement(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const doctorId = String(req.query.doctorId || '').trim()
    const from = String(req.query.from || '').slice(0, 10)
    const to = String(req.query.to || '').slice(0, 10)
    const lines = await prisma.paymentSplitLine.findMany({
      where: {
        clinicId, tenantId, ...(doctorId ? { doctorId } : {}), status: { not: 'CANCELADO' },
        charge: { ...(from || to ? { dueDate: { ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59Z`) } : {}) } } : {}) }
      },
      include: { charge: true },
      orderBy: { createdAt: 'desc' },
      take: 3000
    })
    const entryIds = [...new Set(lines.map(l => l.charge.financialEntryId))]
    const entries = entryIds.length ? await prisma.financialEntry.findMany({ where: { id: { in: entryIds }, clinicId }, select: { id: true, description: true, personName: true } }) : []
    const entryById = new Map(entries.map(e => [e.id, e]))
    const doctors = await prisma.doctor.findMany({ where: { clinicId, tenantId }, include: { user: { select: { firstName: true, lastName: true } } } })
    const nameById = new Map(doctors.map(d => [d.id, doctorName(d)]))

    const rows = lines.map(l => ({
      id: l.id, doctorId: l.doctorId, doctorName: nameById.get(l.doctorId) || 'Dentista',
      description: entryById.get(l.charge.financialEntryId)?.description || '', customer: entryById.get(l.charge.financialEntryId)?.personName || '',
      chargeValue: Number(l.charge.value), dueDate: l.charge.dueDate, paidAt: l.charge.paidAt,
      mode: l.mode, percent: l.percent === null ? null : Number(l.percent),
      amount: Number(l.finalAmount ?? l.plannedAmount), planned: Number(l.plannedAmount), status: l.status
    }))
    const totals = new Map<string, { doctorId: string; doctorName: string; pending: number; confirmed: number; refunded: number }>()
    for (const r of rows) {
      const t = totals.get(r.doctorId) || { doctorId: r.doctorId, doctorName: r.doctorName, pending: 0, confirmed: 0, refunded: 0 }
      if (r.status === 'PENDENTE') t.pending += r.amount
      else if (r.status === 'CONFIRMADO') t.confirmed += r.amount
      else if (r.status === 'ESTORNADO') t.refunded += r.amount
      totals.set(r.doctorId, t)
    }
    return res.json({ rows, totals: [...totals.values()].map(t => ({ ...t, pending: Math.round(t.pending * 100) / 100, confirmed: Math.round(t.confirmed * 100) / 100, refunded: Math.round(t.refunded * 100) / 100 })) })
  } catch (error) {
    console.error('Erro no extrato de repasses:', error)
    return res.status(500).json({ error: 'Erro ao carregar o extrato de repasses.' })
  }
}
