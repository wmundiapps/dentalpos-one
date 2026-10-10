// Visão contábil mensal derivada dos lançamentos reais. Não inventa números:
// sem lançamentos, tudo retorna zero.
export interface OverviewEntry {
  id: string
  type: string
  description: string
  personName: string
  amount: number
  netAmount?: number | null
  dueDate: Date
  competenceDate?: Date | null
  status: string
  paidAt?: Date | null
  documentNumber?: string | null
  fiscalDocumentType?: string | null
  accountingStatus: string
  issuerEntity?: string | null
}
export interface OverviewObligation {
  id: string
  name: string
  competence: string
  dueDate: Date
  estimatedValue: number
  finalValue?: number | null
  status: string
}

export function monthRange(month: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2])
  if (mo < 1 || mo > 12) return null
  return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)) }
}

const value = (e: OverviewEntry) => Number(e.netAmount ?? e.amount) || 0
const round = (n: number) => Math.round(n * 100) / 100

export function buildAccountingOverview(entries: OverviewEntry[], obligations: OverviewObligation[], month: string, now = new Date()) {
  const range = monthRange(month)
  if (!range) throw new Error('Mês inválido. Use AAAA-MM.')
  const inMonth = entries.filter((e) => {
    if (e.status === 'CANCELLED') return false
    const ref = e.competenceDate ?? e.dueDate
    return ref >= range.start && ref < range.end
  })
  const income = inMonth.filter((e) => e.type === 'INCOME')
  const expense = inMonth.filter((e) => e.type === 'EXPENSE')
  const revenue = round(income.reduce((t, e) => t + value(e), 0))
  const expenses = round(expense.reduce((t, e) => t + value(e), 0))
  const settled = inMonth.filter((e) => e.status === 'PAID')
  const needsDoc = (e: OverviewEntry) => !e.documentNumber && !e.fiscalDocumentType
  const pendingDocuments = settled.filter(needsDoc)
  const pendingReview = inMonth.filter((e) => e.accountingStatus !== 'REVIEWED')
  const overdue = inMonth.filter((e) => e.status !== 'PAID' && e.dueDate < now)
  const obs = obligations.filter((o) => o.competence === month)
  const open = obs.filter((o) => !['PAID', 'TRANSMITTED'].includes(o.status))
  const taxEstimated = round(obs.reduce((t, o) => t + Number(o.finalValue ?? o.estimatedValue ?? 0), 0))
  const taxOpen = round(open.reduce((t, o) => t + Number(o.finalValue ?? o.estimatedValue ?? 0), 0))
  const issuers = new Map<string, { issuerEntity: string; revenue: number; expense: number }>()
  for (const e of inMonth) {
    const k = e.issuerEntity || 'NAO_INFORMADO'
    const c = issuers.get(k) || { issuerEntity: k, revenue: 0, expense: 0 }
    if (e.type === 'INCOME') c.revenue = round(c.revenue + value(e))
    else if (e.type === 'EXPENSE') c.expense = round(c.expense + value(e))
    issuers.set(k, c)
  }
  const blockers: string[] = []
  if (inMonth.length === 0) blockers.push('Nenhum lançamento no mês.')
  if (pendingDocuments.length) blockers.push(`${pendingDocuments.length} lançamento(s) pago(s) sem documento fiscal.`)
  if (pendingReview.length) blockers.push(`${pendingReview.length} lançamento(s) sem conferência contábil.`)
  if (overdue.length) blockers.push(`${overdue.length} lançamento(s) vencido(s) em aberto.`)
  if (open.length) blockers.push(`${open.length} obrigação(ões) fiscal(is) em aberto.`)
  return {
    month,
    entryCount: inMonth.length,
    revenue,
    expenses,
    result: round(revenue - expenses),
    taxEstimated,
    taxOpen,
    pendingDocuments: pendingDocuments.length,
    pendingReview: pendingReview.length,
    overdue: overdue.length,
    openObligations: open.length,
    byIssuer: [...issuers.values()],
    readyToClose: blockers.length === 0,
    blockers,
    pendingDocumentList: pendingDocuments.slice(0, 20).map((e) => ({ id: e.id, description: e.description, personName: e.personName, amount: value(e), date: e.paidAt ?? e.dueDate })),
  }
}
