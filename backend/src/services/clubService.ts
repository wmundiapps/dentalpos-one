// Clube da clinica: campanha da equipe (vendas, origem do paciente, meta e premiacao),
// cashback (Cashbacksmart da clinica) e avaliacoes da equipe e do paciente.
// Regras definidas pelo Robson em 07/11/2026 (ver Regulamento da Campanha do Clube).
import { randomBytes, randomUUID, createHash } from 'crypto'
import { prisma } from '../lib/prisma'
import { sendMail } from './followUpService'

// ---------------- configuracao ----------------
export interface ClubConfig {
  planPrice: number
  contractsGoal: number
  treatmentsGoalCount: number
  treatmentsGoalAmount: number
  bandSize: number
  bandValueHit: number
  bandValueMiss: number
  delinquencyLimitPct: number
  delinquencyBonusPct: number
  cashbackPct: number
  cashbackMonths: number
  bestSellerPrize: string
  managerEmails: string[]
  splitCount: number
  peersPerWeek: number
}

export const DEFAULT_CONFIG: ClubConfig = {
  planPrice: 99,
  contractsGoal: 30,
  treatmentsGoalCount: 10,
  treatmentsGoalAmount: 50000,
  bandSize: 10000,
  bandValueHit: 100,
  bandValueMiss: 99,
  delinquencyLimitPct: 10,
  delinquencyBonusPct: 20,
  cashbackPct: 5,
  cashbackMonths: 6,
  bestSellerPrize: '',
  managerEmails: [],
  splitCount: 0,
  peersPerWeek: 2,
}

// Origem do paciente: so a campanha dos funcionarios entra na comissao de tratamentos.
export const ORIGINS: Record<string, { label: string; commission: boolean }> = {
  CAMPANHA_FUNCIONARIOS: { label: 'Campanha dos funcionários', commission: true },
  INDICACAO_PACIENTE: { label: 'Indicação de outro paciente (fora da ação)', commission: false },
  ESPONTANEO: { label: 'Espontâneo', commission: false },
  AGENCIA: { label: 'Marketing de agência', commission: false },
  RADIO: { label: 'Rádio', commission: false },
  PANFLETO: { label: 'Panfleto', commission: false },
  INTERNET: { label: 'Internet (site, Google, redes sociais)', commission: false },
  OUTRO_MARKETING: { label: 'Outra ação de marketing', commission: false },
}

// Mecanismo de captacao usado na venda.
export const CHANNELS: Record<string, string> = {
  PRESENCIAL: 'Presencial', WHATSAPP: 'WhatsApp', TELEFONE: 'Telefone', SMS: 'SMS', EMAIL: 'E-mail',
  TELEGRAM: 'Telegram', INDICACAO_MEMBRO: 'Indicação de membro do Clube', OUTRO: 'Outro',
}

// MANUTENCAO e ADESAO/MENSALIDADE ficam separados nos relatorios; ADESAO e MENSALIDADE nunca entram na meta.
export const KINDS: Record<string, string> = {
  MANUTENCAO: 'Contrato de manutenção (1ª parcela)',
  MENSALIDADE: 'Mensalidade de manutenção (parcelas seguintes)',
  ADESAO: 'Adesão (pagamento único)',
  TRATAMENTO: 'Contrato de tratamento',
}

export const RELATIONS: Record<string, { label: string; family: boolean }> = {
  PAI_OU_MAE: { label: 'Quem envia é pai ou mãe de quem recebe', family: true },
  FILHO_OU_FILHA: { label: 'Quem envia é filho(a) de quem recebe', family: true },
  OUTRO: { label: 'Outra pessoa', family: false },
}

const num = (v: unknown, d: number, min = 0, max = 10_000_000) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d
}
const round2 = (n: number) => Math.round(n * 100) / 100

export function todayBR(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}
export function monthOf(dateISO: string) { return dateISO.slice(0, 7) }
function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Informe o mês no formato AAAA-MM.')
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  return { start, end, days: Math.round((end.getTime() - start.getTime()) / 86400_000) }
}
function addMonthsISO(dateISO: string, months: number) {
  const d = new Date(`${dateISO}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

export async function getSettings(clinicId: string, tenantId: string) {
  let row = await prisma.clubSettings.findUnique({ where: { clinicId } })
  if (!row) {
    row = await prisma.clubSettings.create({ data: { id: randomUUID(), clinicId, tenantId, data: {}, surveyToken: randomBytes(16).toString('hex') } })
  }
  const data = (row.data || {}) as unknown as Partial<ClubConfig>
  const config: ClubConfig = { ...DEFAULT_CONFIG, ...data, managerEmails: Array.isArray(data.managerEmails) ? data.managerEmails : [] }
  return { config, surveyToken: row.surveyToken }
}

export async function saveSettings(clinicId: string, tenantId: string, body: Partial<ClubConfig>) {
  const { config } = await getSettings(clinicId, tenantId)
  const emails = Array.isArray(body.managerEmails) ? body.managerEmails : config.managerEmails
  const next: ClubConfig = {
    planPrice: num(body.planPrice, config.planPrice),
    contractsGoal: Math.round(num(body.contractsGoal, config.contractsGoal, 1, 10000)),
    treatmentsGoalCount: Math.round(num(body.treatmentsGoalCount, config.treatmentsGoalCount, 1, 10000)),
    treatmentsGoalAmount: num(body.treatmentsGoalAmount, config.treatmentsGoalAmount, 1),
    bandSize: num(body.bandSize, config.bandSize, 1),
    bandValueHit: num(body.bandValueHit, config.bandValueHit),
    bandValueMiss: num(body.bandValueMiss, config.bandValueMiss),
    delinquencyLimitPct: num(body.delinquencyLimitPct, config.delinquencyLimitPct, 0, 100),
    delinquencyBonusPct: num(body.delinquencyBonusPct, config.delinquencyBonusPct, 0, 100),
    cashbackPct: num(body.cashbackPct, config.cashbackPct, 0, 100),
    cashbackMonths: Math.round(num(body.cashbackMonths, config.cashbackMonths, 1, 60)),
    bestSellerPrize: String(body.bestSellerPrize ?? config.bestSellerPrize).slice(0, 200),
    managerEmails: emails.map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).slice(0, 10),
    splitCount: Math.round(num(body.splitCount, config.splitCount, 0, 500)),
    peersPerWeek: Math.round(num(body.peersPerWeek, config.peersPerWeek, 0, 10)),
  }
  await prisma.clubSettings.update({ where: { clinicId }, data: { data: next as unknown as object, updatedAt: new Date() } })
  return next
}

async function teamUsers(clinicId: string) {
  return prisma.user.findMany({ where: { clinicId, isActive: true }, select: { id: true, firstName: true, lastName: true, role: true, email: true }, orderBy: { firstName: 'asc' } })
}
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim()

export async function listTeam(clinicId: string) {
  return (await teamUsers(clinicId)).map((u) => ({ id: u.id, name: fullName(u) }))
}

// E-mails que recebem avaliacoes e alertas: os configurados ou, sem configuracao, ADMIN e GESTOR da clinica.
async function managerEmails(clinicId: string, tenantId: string) {
  const { config } = await getSettings(clinicId, tenantId)
  if (config.managerEmails.length) return config.managerEmails
  const users = await teamUsers(clinicId)
  return users.filter((u) => u.role === 'ADMIN' || u.role === 'GESTOR').map((u) => u.email).filter(Boolean)
}

async function mailManagers(clinicId: string, tenantId: string, subject: string, body: string) {
  const to = await managerEmails(clinicId, tenantId)
  for (const email of to) await sendMail(email, subject, body)
  return to.length
}

// ---------------- origem do paciente ----------------
async function patientOf(clinicId: string, patientId: string) {
  const p = await prisma.patient.findFirst({ where: { id: patientId, clinicId }, select: { id: true, fullName: true, phone: true } })
  if (!p) throw new Error('Paciente não encontrado nesta clínica.')
  return p
}

export async function getOrigin(clinicId: string, patientId: string) {
  await patientOf(clinicId, patientId)
  const row = await prisma.patientOrigin.findUnique({ where: { patientId } })
  return row && row.clinicId === clinicId ? { origin: row.origin, label: ORIGINS[row.origin]?.label || row.origin, commission: !!ORIGINS[row.origin]?.commission, detail: row.detail, updatedAt: row.updatedAt } : null
}

export async function setOrigin(clinicId: string, tenantId: string, userId: string, isManager: boolean, patientId: string, body: { origin?: string; detail?: string }) {
  await patientOf(clinicId, patientId)
  const origin = String(body.origin || '')
  if (!ORIGINS[origin]) throw new Error('Informe uma origem válida.')
  const detail = body.detail ? String(body.detail).slice(0, 300) : null
  const current = await prisma.patientOrigin.findUnique({ where: { patientId } })
  if (current && current.clinicId !== clinicId) throw new Error('Paciente não encontrado nesta clínica.')
  if (current && current.origin !== origin && !isManager) throw new Error('A origem já registrada só pode ser mudada pelo gestor.')
  if (current) {
    await prisma.patientOrigin.update({ where: { patientId }, data: { origin, detail, setByUserId: userId, updatedAt: new Date() } })
  } else {
    await prisma.patientOrigin.create({ data: { id: randomUUID(), clinicId, tenantId, patientId, origin, detail, setByUserId: userId } })
  }
  return getOrigin(clinicId, patientId)
}

// ---------------- vendas do Clube ----------------
export async function createSale(clinicId: string, tenantId: string, userId: string, body: Record<string, unknown>) {
  const patientId = String(body.patientId || '')
  await patientOf(clinicId, patientId)
  const kind = String(body.kind || '')
  if (!KINDS[kind]) throw new Error('Informe o tipo de venda.')
  const amount = round2(Number(body.amount))
  if (!(amount > 0)) throw new Error('Informe o valor pago pelo paciente.')
  const channel = String(body.captureChannel || '')
  if (!CHANNELS[channel]) throw new Error('Informe o mecanismo de captação.')
  const saleDate = String(body.saleDate || todayBR()).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) throw new Error('Informe a data da venda.')
  const team = new Set((await teamUsers(clinicId)).map((u) => u.id))
  const sellerIds = [...new Set((Array.isArray(body.sellerIds) ? body.sellerIds : []).map(String))].filter((id) => team.has(id))
  if (!sellerIds.length) throw new Error('Informe quem participou da venda.')
  const main = String(body.mainSellerId || sellerIds[0])
  const mainSellerId = sellerIds.includes(main) ? main : sellerIds[0]
  // Tratamento: a origem do paciente precisa estar registrada para saber se entra na comissao.
  if (kind === 'TRATAMENTO' && body.origin) await setOrigin(clinicId, tenantId, userId, false, patientId, { origin: String(body.origin) })
  if (kind === 'TRATAMENTO' && !(await getOrigin(clinicId, patientId))) throw new Error('Informe a origem do paciente antes de registrar o tratamento.')
  const row = await prisma.clubSale.create({
    data: { id: randomUUID(), clinicId, tenantId, patientId, kind, amount, saleDate: new Date(`${saleDate}T00:00:00Z`), captureChannel: channel, sellerIds, mainSellerId, notes: body.notes ? String(body.notes).slice(0, 500) : null, createdBy: userId },
  })
  return row.id
}

export async function listSales(clinicId: string, month: string) {
  const { start, end } = monthRange(month)
  const rows = await prisma.clubSale.findMany({ where: { clinicId, saleDate: { gte: start, lt: end } }, orderBy: { saleDate: 'desc' } })
  const patients = await prisma.patient.findMany({ where: { clinicId, id: { in: [...new Set(rows.map((r) => r.patientId))] } }, select: { id: true, fullName: true } })
  const origins = await prisma.patientOrigin.findMany({ where: { clinicId, patientId: { in: patients.map((p) => p.id) } } })
  const users = await teamUsers(clinicId)
  const pName = new Map(patients.map((p) => [p.id, p.fullName]))
  const oMap = new Map(origins.map((o) => [o.patientId, o.origin]))
  const uName = new Map(users.map((u) => [u.id, fullName(u)]))
  return rows.map((r) => ({
    id: r.id, patientId: r.patientId, patientName: pName.get(r.patientId) || '—', kind: r.kind, kindLabel: KINDS[r.kind] || r.kind,
    amount: r.amount, saleDate: r.saleDate.toISOString().slice(0, 10), captureChannel: CHANNELS[r.captureChannel] || r.captureChannel,
    sellers: r.sellerIds.map((id) => uName.get(id) || '—'), mainSeller: r.mainSellerId ? uName.get(r.mainSellerId) || '—' : '—',
    origin: ORIGINS[oMap.get(r.patientId) || '']?.label || 'Não informada', paymentConfirmed: r.paymentConfirmed, cancelled: !!r.cancelledAt,
    countsForTeam: countsForTeam(r.kind, oMap.get(r.patientId)), notes: r.notes,
  }))
}

// O que entra na meta e no Caixa da Equipe.
export function countsForTeam(kind: string, origin?: string | null) {
  if (kind === 'MANUTENCAO') return true
  if (kind === 'TRATAMENTO') return !!(origin && ORIGINS[origin]?.commission)
  return false
}

export async function confirmPayment(clinicId: string, tenantId: string, userId: string, saleId: string) {
  const sale = await prisma.clubSale.findFirst({ where: { id: saleId, clinicId } })
  if (!sale) throw new Error('Venda não encontrada.')
  if (sale.cancelledAt) throw new Error('Venda cancelada não pode ser confirmada.')
  if (sale.paymentConfirmed) return { cashback: 0 }
  await prisma.clubSale.update({ where: { id: sale.id }, data: { paymentConfirmed: true, paymentConfirmedAt: new Date(), paymentConfirmedBy: userId } })
  // Cashback: todo tratamento pago por participante do Cashbacksmart gera credito.
  let cashback = 0
  if (sale.kind === 'TRATAMENTO') {
    const member = await prisma.cashbackMember.findUnique({ where: { patientId: sale.patientId } })
    if (member && member.active && member.clinicId === clinicId) {
      const { config } = await getSettings(clinicId, tenantId)
      cashback = round2(sale.amount * config.cashbackPct / 100)
      if (cashback > 0) {
        const expiresAt = addMonthsISO(todayBR(), config.cashbackMonths)
        await prisma.cashbackLot.create({ data: { id: randomUUID(), clinicId, tenantId, patientId: sale.patientId, origin: 'TRATAMENTO', amount: cashback, remaining: cashback, expiresAt: new Date(`${expiresAt}T00:00:00Z`), saleId: sale.id } })
        await prisma.cashbackMove.create({ data: { id: randomUUID(), clinicId, tenantId, patientId: sale.patientId, kind: 'CREDITO', amount: cashback, saleId: sale.id, note: `${config.cashbackPct}% do tratamento, válido até ${expiresAt.split('-').reverse().join('/')}`, createdBy: userId } })
      }
    }
  }
  return { cashback }
}

export async function cancelSale(clinicId: string, tenantId: string, userId: string, saleId: string) {
  const sale = await prisma.clubSale.findFirst({ where: { id: saleId, clinicId } })
  if (!sale) throw new Error('Venda não encontrada.')
  if (sale.cancelledAt) return
  await prisma.clubSale.update({ where: { id: sale.id }, data: { cancelledAt: new Date() } })
  // Cashback ainda nao usado desta venda e estornado.
  const lots = await prisma.cashbackLot.findMany({ where: { clinicId, saleId: sale.id, remaining: { gt: 0 } } })
  for (const lot of lots) {
    await prisma.cashbackLot.update({ where: { id: lot.id }, data: { remaining: 0 } })
    await prisma.cashbackMove.create({ data: { id: randomUUID(), clinicId, tenantId, patientId: lot.patientId, kind: 'ESTORNO', amount: -lot.remaining, saleId: sale.id, note: 'Venda cancelada', createdBy: userId } })
  }
}

// ---------------- meta, premiacao e painel ----------------
async function delinquencyPct(clinicId: string, month: string) {
  const { start, end } = monthRange(month)
  const today = new Date(`${todayBR()}T00:00:00Z`)
  const until = end < today ? end : today
  const rows = await prisma.financialEntry.findMany({ where: { clinicId, type: 'INCOME', status: { not: 'CANCELLED' }, dueDate: { gte: start, lt: until } }, select: { amount: true, status: true } })
  const total = rows.reduce((a, r) => a + r.amount, 0)
  const unpaid = rows.filter((r) => r.status !== 'PAID').reduce((a, r) => a + r.amount, 0)
  return total > 0 ? round2(unpaid / total * 100) : 0
}

export async function computeMonth(clinicId: string, tenantId: string, month: string) {
  const { config } = await getSettings(clinicId, tenantId)
  const { start, end, days } = monthRange(month)
  const sales = await prisma.clubSale.findMany({ where: { clinicId, cancelledAt: null, paymentConfirmed: true, saleDate: { gte: start, lt: end } } })
  const origins = await prisma.patientOrigin.findMany({ where: { clinicId, patientId: { in: [...new Set(sales.map((s) => s.patientId))] } } })
  const oMap = new Map(origins.map((o) => [o.patientId, o.origin]))

  const contracts = sales.filter((s) => s.kind === 'MANUTENCAO')
  const teamTreatments = sales.filter((s) => s.kind === 'TRATAMENTO' && countsForTeam(s.kind, oMap.get(s.patientId)))
  const firstParcels = round2(contracts.reduce((a, s) => a + s.amount, 0))
  const treatAmount = round2(teamTreatments.reduce((a, s) => a + s.amount, 0))

  const contractsHit = contracts.length >= config.contractsGoal
  const treatmentsHit = treatAmount >= config.treatmentsGoalAmount
  const goalHit = contractsHit && treatmentsHit
  const delinquency = await delinquencyPct(clinicId, month)
  const delinquencyOk = delinquency < config.delinquencyLimitPct

  const bands = Math.floor(treatAmount / config.bandSize)
  const bandsValue = round2(bands * (goalHit ? config.bandValueHit : config.bandValueMiss))
  const subtotal = round2(firstParcels + bandsValue)
  const bonus = goalHit && delinquencyOk ? round2(subtotal * config.delinquencyBonusPct / 100) : 0
  const total = round2(subtotal + bonus)
  const team = await teamUsers(clinicId)
  const split = config.splitCount > 0 ? config.splitCount : team.length
  const perPerson = split > 0 ? round2(total / split) : 0

  // Ranking do melhor vendedor: contratos pagos; desempate pelo valor de tratamentos da campanha.
  const uName = new Map(team.map((u) => [u.id, fullName(u)]))
  const rank = new Map<string, { contracts: number; treatments: number; treatmentAmount: number }>()
  for (const s of [...contracts, ...teamTreatments]) {
    const id = s.mainSellerId || s.sellerIds[0]
    if (!id) continue
    const cur = rank.get(id) || { contracts: 0, treatments: 0, treatmentAmount: 0 }
    if (s.kind === 'MANUTENCAO') cur.contracts += 1
    else { cur.treatments += 1; cur.treatmentAmount += s.amount }
    rank.set(id, cur)
  }
  const ranking = [...rank.entries()].map(([id, r]) => ({ userId: id, name: uName.get(id) || '—', ...r, treatmentAmount: round2(r.treatmentAmount) }))
    .sort((a, b) => b.contracts - a.contracts || b.treatmentAmount - a.treatmentAmount)

  const today = todayBR()
  const daysLeft = monthOf(today) === month ? Math.max(0, days - Number(today.slice(8, 10))) : (month > monthOf(today) ? days : 0)

  return {
    month, config, goalHit, contractsHit, treatmentsHit, delinquency, delinquencyOk, daysLeft,
    contracts: contracts.length, firstParcels, teamTreatments: teamTreatments.length, treatAmount,
    bands, bandsValue, subtotal, bonus, total, split, perPerson, ranking,
  }
}

// O que a equipe ve: so numeros e percentuais, nunca valores em reais.
export async function panel(clinicId: string, tenantId: string, month: string) {
  const m = await computeMonth(clinicId, tenantId, month)
  const pct = (done: number, goal: number) => goal > 0 ? Math.round(done / goal * 100) : 0
  return {
    month, daysLeft: m.daysLeft, goalHit: m.goalHit,
    contracts: { done: m.contracts, goal: m.config.contractsGoal, pct: pct(m.contracts, m.config.contractsGoal), missing: Math.max(0, m.config.contractsGoal - m.contracts), over: Math.max(0, m.contracts - m.config.contractsGoal) },
    treatments: { done: m.teamTreatments, goal: m.config.treatmentsGoalCount, pct: pct(m.treatAmount, m.config.treatmentsGoalAmount), hit: m.treatmentsHit },
    delinquencyOk: m.delinquencyOk,
    ranking: m.ranking.map((r, i) => ({ position: i + 1, name: r.name, contracts: r.contracts, treatments: r.treatments })),
  }
}

// Relatorio do gestor: faturamento separado em pagamento unico (adesao), recorrencia e tratamentos, por origem e canal.
export async function managerReport(clinicId: string, tenantId: string, month: string) {
  const m = await computeMonth(clinicId, tenantId, month)
  const { start, end } = monthRange(month)
  const sales = await prisma.clubSale.findMany({ where: { clinicId, cancelledAt: null, paymentConfirmed: true, saleDate: { gte: start, lt: end } } })
  const origins = await prisma.patientOrigin.findMany({ where: { clinicId, patientId: { in: [...new Set(sales.map((s) => s.patientId))] } } })
  const oMap = new Map(origins.map((o) => [o.patientId, o.origin]))
  const sum = (f: (s: typeof sales[number]) => boolean) => round2(sales.filter(f).reduce((a, s) => a + s.amount, 0))
  const byOrigin: Record<string, number> = {}
  const byChannel: Record<string, number> = {}
  for (const s of sales.filter((x) => x.kind === 'TRATAMENTO')) {
    const o = ORIGINS[oMap.get(s.patientId) || '']?.label || 'Não informada'
    byOrigin[o] = round2((byOrigin[o] || 0) + s.amount)
  }
  for (const s of sales) { const c = CHANNELS[s.captureChannel] || s.captureChannel; byChannel[c] = round2((byChannel[c] || 0) + s.amount) }
  const pendingConfirmation = await prisma.clubSale.count({ where: { clinicId, cancelledAt: null, paymentConfirmed: false, saleDate: { gte: start, lt: end } } })
  return {
    ...m,
    revenue: {
      adesao: sum((s) => s.kind === 'ADESAO'),
      recorrencia: sum((s) => s.kind === 'MANUTENCAO' || s.kind === 'MENSALIDADE'),
      tratamentosCampanha: sum((s) => s.kind === 'TRATAMENTO' && countsForTeam(s.kind, oMap.get(s.patientId))),
      tratamentosOutrasOrigens: sum((s) => s.kind === 'TRATAMENTO' && !countsForTeam(s.kind, oMap.get(s.patientId))),
    },
    byOrigin, byChannel, pendingConfirmation,
  }
}

// ---------------- cashback (Cashbacksmart da clinica) ----------------
export async function addMember(clinicId: string, tenantId: string, userId: string, body: { patientId?: string; consent?: boolean; freeMonths?: number }) {
  const patientId = String(body.patientId || '')
  await patientOf(clinicId, patientId)
  if (body.consent !== true) throw new Error('Informe que o paciente autorizou a participação no cashback.')
  const freeMonths = Math.round(num(body.freeMonths, 0, 0, 24))
  const freeUntil = freeMonths ? new Date(`${addMonthsISO(todayBR(), freeMonths)}T00:00:00Z`) : null
  const current = await prisma.cashbackMember.findUnique({ where: { patientId } })
  if (current) {
    if (current.clinicId !== clinicId) throw new Error('Paciente não encontrado nesta clínica.')
    await prisma.cashbackMember.update({ where: { patientId }, data: { active: true, ...(freeUntil ? { freeUntil } : {}) } })
  } else {
    await prisma.cashbackMember.create({ data: { id: randomUUID(), clinicId, tenantId, patientId, consentAt: new Date(), freeUntil, createdBy: userId } })
  }
}

async function liveLots(clinicId: string, patientId: string) {
  return prisma.cashbackLot.findMany({ where: { clinicId, patientId, remaining: { gt: 0 }, expiresAt: { gte: new Date(`${todayBR()}T00:00:00Z`) } }, orderBy: { expiresAt: 'asc' } })
}

export async function listMembers(clinicId: string) {
  const members = await prisma.cashbackMember.findMany({ where: { clinicId }, orderBy: { createdAt: 'desc' } })
  const patients = await prisma.patient.findMany({ where: { clinicId, id: { in: members.map((m) => m.patientId) } }, select: { id: true, fullName: true, phone: true } })
  const pMap = new Map(patients.map((p) => [p.id, p]))
  const lots = await prisma.cashbackLot.findMany({ where: { clinicId, patientId: { in: members.map((m) => m.patientId) }, remaining: { gt: 0 }, expiresAt: { gte: new Date(`${todayBR()}T00:00:00Z`) } } })
  return members.map((m) => {
    const mine = lots.filter((l) => l.patientId === m.patientId)
    const next = mine.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())[0]
    return {
      patientId: m.patientId, name: pMap.get(m.patientId)?.fullName || '—', phone: pMap.get(m.patientId)?.phone || '', active: m.active,
      freeUntil: m.freeUntil ? m.freeUntil.toISOString().slice(0, 10) : null,
      balance: round2(mine.reduce((a, l) => a + l.remaining, 0)), nextExpiry: next ? next.expiresAt.toISOString().slice(0, 10) : null,
    }
  })
}

export async function statement(clinicId: string, patientId: string) {
  await patientOf(clinicId, patientId)
  const lots = await liveLots(clinicId, patientId)
  const moves = await prisma.cashbackMove.findMany({ where: { clinicId, patientId }, orderBy: { createdAt: 'desc' }, take: 100 })
  return {
    balance: round2(lots.reduce((a, l) => a + l.remaining, 0)),
    lots: lots.map((l) => ({ remaining: l.remaining, expiresAt: l.expiresAt.toISOString().slice(0, 10), origin: l.origin })),
    moves: moves.map((m) => ({ kind: m.kind, amount: m.amount, note: m.note, relation: m.relation, createdAt: m.createdAt.toISOString() })),
  }
}

// Consome os lotes que vencem primeiro. Devolve as partes consumidas (para a transferencia manter a validade).
async function consume(clinicId: string, patientId: string, amount: number) {
  const lots = await liveLots(clinicId, patientId)
  const balance = lots.reduce((a, l) => a + l.remaining, 0)
  if (amount > balance + 0.001) throw new Error(`Saldo de cashback insuficiente (disponível: R$ ${balance.toFixed(2).replace('.', ',')}).`)
  let left = amount
  const parts: Array<{ amount: number; expiresAt: Date }> = []
  for (const lot of lots) {
    if (left <= 0) break
    const take = round2(Math.min(lot.remaining, left))
    await prisma.cashbackLot.update({ where: { id: lot.id }, data: { remaining: round2(lot.remaining - take) } })
    parts.push({ amount: take, expiresAt: lot.expiresAt })
    left = round2(left - take)
  }
  return parts
}

export async function useCashback(clinicId: string, tenantId: string, userId: string, body: { patientId?: string; amount?: number; note?: string }) {
  const patientId = String(body.patientId || '')
  await patientOf(clinicId, patientId)
  const amount = round2(Number(body.amount))
  if (!(amount > 0)) throw new Error('Informe o valor a usar.')
  await consume(clinicId, patientId, amount)
  await prisma.cashbackMove.create({ data: { id: randomUUID(), clinicId, tenantId, patientId, kind: 'USO', amount: -amount, note: body.note ? String(body.note).slice(0, 200) : 'Abatimento em tratamento', createdBy: userId } })
}

// Transferencia: cada paciente so recebe de 1 pessoa e cada pessoa so envia para 1 paciente,
// exceto entre pais e filhos (1o grau em linha reta), que podem juntar cashback entre si.
export async function transferCashback(clinicId: string, tenantId: string, userId: string, body: { fromPatientId?: string; toPatientId?: string; amount?: number; relation?: string }) {
  const from = String(body.fromPatientId || '')
  const to = String(body.toPatientId || '')
  if (!from || !to || from === to) throw new Error('Informe quem envia e quem recebe (pessoas diferentes).')
  await patientOf(clinicId, from)
  const receiver = await patientOf(clinicId, to)
  const relation = String(body.relation || '')
  if (!RELATIONS[relation]) throw new Error('Informe o parentesco entre quem envia e quem recebe.')
  const amount = round2(Number(body.amount))
  if (!(amount > 0)) throw new Error('Informe o valor a transferir.')
  const member = await prisma.cashbackMember.findUnique({ where: { patientId: to } })
  if (!member || member.clinicId !== clinicId || !member.active) throw new Error(`${receiver.fullName} precisa estar cadastrado(a) no cashback para receber.`)

  if (!RELATIONS[relation].family) {
    const received = await prisma.cashbackMove.findMany({ where: { clinicId, patientId: to, kind: 'TRANSFERENCIA_RECEBIDA', relation: 'OUTRO' }, select: { counterpartPatientId: true } })
    if (received.some((r) => r.counterpartPatientId && r.counterpartPatientId !== from)) throw new Error('Este paciente já recebeu cashback de outra pessoa. Fora de pais e filhos, cada paciente só recebe de uma pessoa.')
    const sent = await prisma.cashbackMove.findMany({ where: { clinicId, patientId: from, kind: 'TRANSFERENCIA_ENVIADA', relation: 'OUTRO' }, select: { counterpartPatientId: true } })
    if (sent.some((r) => r.counterpartPatientId && r.counterpartPatientId !== to)) throw new Error('Quem envia já transferiu cashback para outra pessoa. Fora de pais e filhos, a transferência é de uma pessoa para uma pessoa.')
  }

  const parts = await consume(clinicId, from, amount)
  for (const p of parts) {
    await prisma.cashbackLot.create({ data: { id: randomUUID(), clinicId, tenantId, patientId: to, origin: 'TRANSFERENCIA', amount: p.amount, remaining: p.amount, expiresAt: p.expiresAt, fromPatientId: from } })
  }
  const note = RELATIONS[relation].label
  await prisma.cashbackMove.create({ data: { id: randomUUID(), clinicId, tenantId, patientId: from, kind: 'TRANSFERENCIA_ENVIADA', amount: -amount, counterpartPatientId: to, relation, note, createdBy: userId } })
  await prisma.cashbackMove.create({ data: { id: randomUUID(), clinicId, tenantId, patientId: to, kind: 'TRANSFERENCIA_RECEBIDA', amount, counterpartPatientId: from, relation, note, createdBy: userId } })
}

// ---------------- avaliacao semanal da equipe ----------------
export const TEAM_QUESTIONS: Array<{ id: string; text: string; expected: 'SIM' | 'NAO' }> = [
  { id: 'q1', text: 'Chegou no horário todos os dias da semana?', expected: 'SIM' },
  { id: 'q2', text: 'Recebeu os pacientes com cordialidade e pelo nome?', expected: 'SIM' },
  { id: 'q3', text: 'Cumpriu as tarefas combinadas na semana?', expected: 'SIM' },
  { id: 'q4', text: 'Registrou no sistema os contatos e vendas que fez?', expected: 'SIM' },
  { id: 'q5', text: 'Ofereceu o plano de manutenção a todos os pacientes em alta que atendeu?', expected: 'SIM' },
  { id: 'q6', text: 'Ajudou um colega quando foi preciso?', expected: 'SIM' },
  { id: 'q7', text: 'Manteve o ambiente de trabalho limpo e organizado?', expected: 'SIM' },
  { id: 'q8', text: 'Seguiu os protocolos de biossegurança?', expected: 'SIM' },
  { id: 'q9', text: 'Resolveu ou encaminhou as reclamações que recebeu?', expected: 'SIM' },
  { id: 'q10', text: 'Teve alguma atitude que prejudicou o trabalho da equipe?', expected: 'NAO' },
]
export const SCALE = ['Muito baixo', 'Baixo', 'Normal', 'Alto', 'Muito alto']

// Semana ISO no horario de Brasilia, ex.: 2026-W45. A avaliacao abre toda segunda-feira.
export function weekKey(dateISO = todayBR()) {
  const d = new Date(`${dateISO}T12:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// Colegas sorteados da semana para cada pessoa (sorteio fixo por semana, sem banco).
function peersFor(userId: string, team: string[], week: string, count: number) {
  const others = team.filter((id) => id !== userId)
  const score = (id: string) => createHash('sha256').update(`${week}:${userId}:${id}`).digest('hex')
  return others.sort((a, b) => score(a).localeCompare(score(b))).slice(0, count)
}

export async function myWeek(clinicId: string, tenantId: string, userId: string) {
  const { config } = await getSettings(clinicId, tenantId)
  const week = weekKey()
  const team = await teamUsers(clinicId)
  const peers = peersFor(userId, team.map((u) => u.id), week, config.peersPerWeek)
  const done = await prisma.teamEvaluation.findMany({ where: { clinicId, weekKey: week, evaluatorUserId: userId }, select: { evaluatedUserId: true } })
  const doneSet = new Set(done.map((d) => d.evaluatedUserId))
  const uName = new Map(team.map((u) => [u.id, fullName(u)]))
  return {
    week, questions: TEAM_QUESTIONS.map(({ id, text }) => ({ id, text })), scale: SCALE,
    tasks: [
      { kind: 'SELF', evaluatedUserId: userId, name: 'Autoavaliação', done: doneSet.has(userId) },
      ...peers.map((id) => ({ kind: 'PEER', evaluatedUserId: id, name: uName.get(id) || '—', done: doneSet.has(id) })),
    ],
  }
}

export async function submitTeamEvaluation(clinicId: string, tenantId: string, userId: string, body: { kind?: string; evaluatedUserId?: string; answers?: Record<string, string>; score?: number; comment?: string }) {
  const { config } = await getSettings(clinicId, tenantId)
  const week = weekKey()
  const kind = body.kind === 'PEER' ? 'PEER' : 'SELF'
  const team = await teamUsers(clinicId)
  const evaluated = kind === 'SELF' ? userId : String(body.evaluatedUserId || '')
  if (kind === 'PEER' && !peersFor(userId, team.map((u) => u.id), week, config.peersPerWeek).includes(evaluated)) throw new Error('Este colega não está na sua lista desta semana.')
  const answers: Record<string, string> = {}
  for (const q of TEAM_QUESTIONS) {
    const a = String(body.answers?.[q.id] || '').toUpperCase()
    if (a !== 'SIM' && a !== 'NAO') throw new Error('Responda todas as perguntas com SIM ou NÃO.')
    answers[q.id] = a
  }
  const score = Math.round(Number(body.score))
  if (!(score >= 1 && score <= 5)) throw new Error('Escolha a nota geral de 1 a 5.')
  const exists = await prisma.teamEvaluation.findUnique({ where: { clinicId_weekKey_evaluatorUserId_evaluatedUserId: { clinicId, weekKey: week, evaluatorUserId: userId, evaluatedUserId: evaluated } } })
  if (exists) throw new Error('Você já enviou esta avaliação nesta semana.')
  const comment = body.comment ? String(body.comment).slice(0, 1000) : null
  await prisma.teamEvaluation.create({ data: { id: randomUUID(), clinicId, tenantId, weekKey: week, kind, evaluatorUserId: userId, evaluatedUserId: evaluated, answers, score, comment } })

  // Vai so para o gestor, por e-mail.
  const uName = new Map(team.map((u) => [u.id, fullName(u)]))
  const hits = TEAM_QUESTIONS.filter((q) => answers[q.id] === q.expected).length
  const lines = [
    `${kind === 'SELF' ? 'Autoavaliação' : 'Avaliação de colega'} — semana ${week}`,
    `Quem avaliou: ${uName.get(userId) || '—'}`,
    `Avaliado(a): ${uName.get(evaluated) || '—'}`,
    `Nota geral: ${score} (${SCALE[score - 1]}) · respostas positivas: ${hits} de ${TEAM_QUESTIONS.length}`,
    '',
    ...TEAM_QUESTIONS.map((q) => `${answers[q.id] === q.expected ? '✔' : '✖'} ${q.text} ${answers[q.id] === 'SIM' ? 'SIM' : 'NÃO'}`),
    '',
    comment ? `Comentário: ${comment}` : 'Sem comentário.',
  ]
  await mailManagers(clinicId, tenantId, `Avaliação da equipe — ${uName.get(evaluated) || ''} (${week})`, lines.join('\n'))
}

export async function teamEvaluations(clinicId: string, week: string) {
  const rows = await prisma.teamEvaluation.findMany({ where: { clinicId, weekKey: week }, orderBy: { createdAt: 'asc' } })
  const team = await teamUsers(clinicId)
  const uName = new Map(team.map((u) => [u.id, fullName(u)]))
  const byPerson = new Map<string, { name: string; self: number | null; peers: number[]; positives: number[] }>()
  for (const r of rows) {
    const cur = byPerson.get(r.evaluatedUserId) || { name: uName.get(r.evaluatedUserId) || '—', self: null, peers: [], positives: [] }
    const ans = r.answers as unknown as Record<string, string>
    cur.positives.push(TEAM_QUESTIONS.filter((q) => ans[q.id] === q.expected).length)
    if (r.kind === 'SELF') cur.self = r.score; else cur.peers.push(r.score)
    byPerson.set(r.evaluatedUserId, cur)
  }
  const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null
  return {
    week,
    summary: [...byPerson.values()].map((p) => ({ name: p.name, self: p.self, peersAvg: avg(p.peers), peersCount: p.peers.length, positivesAvg: avg(p.positives) })),
    answered: new Set(rows.map((r) => r.evaluatorUserId)).size,
    teamSize: team.length,
    details: rows.map((r) => ({ kind: r.kind, evaluator: uName.get(r.evaluatorUserId) || '—', evaluated: uName.get(r.evaluatedUserId) || '—', score: r.score, answers: r.answers, comment: r.comment })),
  }
}

// ---------------- avaliacao do paciente (link publico) ----------------
export const PATIENT_RATINGS: Array<{ id: string; text: string }> = [
  { id: 'infraestrutura', text: 'Infraestrutura (conforto, limpeza, equipamentos)' },
  { id: 'organizacao', text: 'Organização (agenda, informações, documentos)' },
  { id: 'atendimento', text: 'Atendimento da recepção e da equipe' },
  { id: 'pontualidade', text: 'Pontualidade' },
  { id: 'servico', text: 'Impressão sobre o serviço executado' },
]
export const PATIENT_YESNO: Array<{ id: string; text: string }> = [
  { id: 'peloNome', text: 'Foi atendido(a) pelo nome e com atenção?' },
  { id: 'explicacao', text: 'Recebeu explicação clara sobre o tratamento e os valores?' },
]

async function clinicByToken(token: string) {
  const s = await prisma.clubSettings.findUnique({ where: { surveyToken: String(token || '') } })
  if (!s) throw new Error('Link de avaliação não encontrado.')
  const clinic = await prisma.clinic.findUnique({ where: { id: s.clinicId }, select: { id: true, name: true, tenantId: true } })
  if (!clinic) throw new Error('Link de avaliação não encontrado.')
  return clinic
}

export async function publicSurveyForm(token: string) {
  const clinic = await clinicByToken(token)
  return { clinicName: clinic.name, ratings: PATIENT_RATINGS, yesNo: PATIENT_YESNO, scale: SCALE }
}

export async function submitPatientSurvey(token: string, body: Record<string, unknown>) {
  const clinic = await clinicByToken(token)
  const raw = (body.answers || {}) as Record<string, unknown>
  const answers: Record<string, number | string> = {}
  for (const r of PATIENT_RATINGS) {
    const v = Math.round(Number(raw[r.id]))
    if (!(v >= 1 && v <= 5)) throw new Error('Responda todas as notas de 1 a 5.')
    answers[r.id] = v
  }
  for (const q of PATIENT_YESNO) {
    const v = String(raw[q.id] || '').toUpperCase()
    if (v !== 'SIM' && v !== 'NAO') throw new Error('Responda as perguntas de SIM ou NÃO.')
    answers[q.id] = v
  }
  const recommend = Math.round(Number(body.recommend))
  if (!(recommend >= 1 && recommend <= 5)) throw new Error('Escolha de 1 a 5 a chance de indicar a clínica.')
  const anonymous = body.anonymous !== false
  const name = anonymous ? null : String(body.name || '').trim().slice(0, 120) || null
  const phone = anonymous ? null : String(body.phone || '').replace(/\D/g, '').slice(0, 15) || null
  const highlightStaff = body.highlightStaff ? String(body.highlightStaff).slice(0, 120) : null
  const comment = body.comment ? String(body.comment).slice(0, 1500) : null
  await prisma.patientSurvey.create({ data: { id: randomUUID(), clinicId: clinic.id, tenantId: clinic.tenantId, anonymous, name, phone, answers, recommend, highlightStaff, comment } })

  // Nota 1 ou 2 em qualquer item: aviso imediato ao gestor.
  const low = [...PATIENT_RATINGS.filter((r) => Number(answers[r.id]) <= 2).map((r) => `${r.text}: ${answers[r.id]}`), ...(recommend <= 2 ? [`Chance de indicar: ${recommend}`] : [])]
  if (low.length) {
    const who = anonymous ? 'Paciente anônimo' : `${name || 'Sem nome'}${phone ? ` — ${phone}` : ''}`
    await mailManagers(clinic.id, clinic.tenantId, `Avaliação de paciente com nota baixa — ${clinic.name}`, [`${who} deu nota baixa:`, ...low.map((l) => `• ${l}`), '', comment ? `Comentário: ${comment}` : 'Sem comentário.'].join('\n'))
  }
}

export async function patientSurveys(clinicId: string, month: string) {
  const { start, end } = monthRange(month)
  const rows = await prisma.patientSurvey.findMany({ where: { clinicId, createdAt: { gte: start, lt: end } }, orderBy: { createdAt: 'desc' } })
  const avg = (key: string) => rows.length ? Math.round(rows.reduce((a, r) => a + Number((r.answers as unknown as Record<string, unknown>)[key] || 0), 0) / rows.length * 10) / 10 : null
  return {
    count: rows.length,
    averages: Object.fromEntries([...PATIENT_RATINGS.map((r) => [r.text, avg(r.id)]), ['Chance de indicar', rows.length ? Math.round(rows.reduce((a, r) => a + r.recommend, 0) / rows.length * 10) / 10 : null]]),
    rows: rows.map((r) => ({ createdAt: r.createdAt.toISOString(), anonymous: r.anonymous, name: r.name, phone: r.phone, answers: r.answers, recommend: r.recommend, highlightStaff: r.highlightStaff, comment: r.comment })),
  }
}
