import { prisma } from '../lib/prisma'
import { type Clinic, ownerEmails, loadSettings as loadFollowUpSettings, sendMail } from './followUpService'

// Fechamento diário de caixa: entradas e saídas pagas no dia, por profissional.
// Como o lançamento financeiro não tem o campo "profissional", a atribuição segue esta ordem:
//  1) divisão de cobrança entre dentistas (Asaas), 2) profissional que atendeu o paciente no dia, 3) nome do profissional no lançamento (saídas), 4) "Sem profissional".
export const FLAG_KEY = 'CASH_CLOSE'
const SEND_HOUR_BRT = 19
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(dr|dra|dr\.|dra\.)\b/g, '').replace(/\s+/g, ' ').trim()
const brtDayOf = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10)
const brtHourOf = (d: Date) => new Date(d.getTime() - 3 * 3600000).getUTCHours()
// Nomes claros para a forma de pagamento (o sistema guarda varios jeitos de escrever).
export function methodLabel(raw: string | null | undefined) {
  const m = String(raw || '').trim().toLowerCase()
  if (!m) return 'Não informado'
  if (/dinheiro|cash|esp[eé]cie/.test(m)) return 'Dinheiro'
  if (/cart|card|cr[eé]dito|d[eé]bito/.test(m)) return /d[eé]bito|debit/.test(m) ? 'Cartão de débito' : /cr[eé]dito|credit/.test(m) ? 'Cartão de crédito' : 'Cartão'
  if (/boleto|bank_slip/.test(m)) return 'Boleto'
  if (/pix/.test(m)) return 'Pix'
  if (/transfer|ted|doc/.test(m)) return 'Transferência'
  if (/cheque|check/.test(m)) return 'Cheque'
  return String(raw).trim()
}
const hhmm = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(11, 16)

export type CashLine = { id: string; time: string; kind: 'ENTRADA' | 'SAIDA'; who: string; payer: string; receivedBy: string; description: string; method: string; destination: 'CAIXA' | 'CONTA'; destinationLabel: string; destinationInferred: boolean; amount: number }
export type CashGroup = { key: string; name: string; entries: number; exits: number; balance: number; lines: CashLine[] }
export type CashReport = { date: string; groups: CashGroup[]; entries: number; exits: number; balance: number; byMethod: Array<{ method: string; total: number }>; byDestination: Array<{ destination: string; total: number }>; count: number }

export type CashSettings = { enabled: boolean; emails: string[]; lastSent: string | null }

export async function loadCashSettings(clinicId: string): Promise<CashSettings> {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
  const m = (row?.metadata || {}) as Partial<CashSettings>
  return { enabled: m.enabled !== false, emails: Array.isArray(m.emails) ? m.emails.map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)).slice(0, 10) : [], lastSent: m.lastSent || null }
}

export async function saveCashSettings(clinicId: string, tenantId: string, s: CashSettings) {
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: FLAG_KEY } },
    update: { enabled: true, metadata: s as never },
    create: { clinicId, tenantId, key: FLAG_KEY, enabled: true, rolloutStage: 'GA', metadata: s as never },
  })
}

export async function buildCashReport(clinicId: string, tenantId: string, dayISO: string): Promise<CashReport> {
  const from = new Date(`${dayISO}T00:00:00-03:00`)
  const to = new Date(`${dayISO}T23:59:59.999-03:00`)
  const entries = await prisma.financialEntry.findMany({
    where: { clinicId, tenantId, status: 'PAID', paidAt: { gte: from, lte: to } },
    orderBy: { paidAt: 'asc' }, take: 2000,
  })
  const doctors = await prisma.doctor.findMany({ where: { clinicId, tenantId }, select: { id: true, user: { select: { firstName: true, lastName: true } } } })
  const doctorName = new Map(doctors.map((d) => [d.id, `${d.user.firstName} ${d.user.lastName}`.trim()]))
  const byNormName = new Map([...doctorName.entries()].map(([id, n]) => [norm(n), id]))

  const incomeIds = entries.filter((e) => e.type === 'INCOME').map((e) => e.id)
  const charges = incomeIds.length ? await prisma.receivableCharge.findMany({ where: { financialEntryId: { in: incomeIds } }, select: { financialEntryId: true, splits: { select: { doctorId: true, plannedAmount: true, finalAmount: true } } } }).catch(() => []) : []
  const splitsByEntry = new Map(charges.map((c) => [c.financialEntryId, c.splits]))
  const patientIds = [...new Set(entries.filter((e) => e.type === 'INCOME' && e.patientId).map((e) => e.patientId as string))]
  const appts = patientIds.length ? await prisma.appointment.findMany({ where: { clinicId, tenantId, patientId: { in: patientIds }, scheduledAt: { gte: from, lte: to }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } }, orderBy: { scheduledAt: 'asc' }, select: { patientId: true, doctorId: true } }) : []
  const doctorOfPatient = new Map<string, string>()
  for (const a of appts) doctorOfPatient.set(a.patientId, a.doctorId) // o último atendimento do dia vence

  const groups = new Map<string, CashGroup>()
  const group = (key: string, name: string) => { let g = groups.get(key); if (!g) { g = { key, name, entries: 0, exits: 0, balance: 0, lines: [] }; groups.set(key, g) } return g }
  const add = (key: string, name: string, line: CashLine) => {
    const g = group(key, name)
    if (line.kind === 'ENTRADA') g.entries += line.amount; else g.exits += line.amount
    g.balance = g.entries - g.exits
    g.lines.push(line)
  }
  const methods = new Map<string, number>()
  const destinations = new Map<string, number>()

  for (const e of entries) {
    const kind = e.type === 'INCOME' ? 'ENTRADA' : 'SAIDA'
    const method = methodLabel(e.paymentMethod)
    // Destino: o que foi registrado na baixa; em lancamentos antigos, dinheiro = caixa e o resto = conta (marcado como presumido).
    const inferred = !e.cashDestination
    const destination: 'CAIXA' | 'CONTA' = e.cashDestination === 'CAIXA' || e.cashDestination === 'CONTA' ? e.cashDestination : (method === 'Dinheiro' ? 'CAIXA' : 'CONTA')
    const destinationLabel = destination === 'CAIXA' ? 'Ficou no caixa' : `Enviado para ${e.destinationAccount || 'conta'}`
    const base = { id: e.id, time: hhmm(e.paidAt as Date), kind: kind as CashLine['kind'], who: e.personName, payer: kind === 'ENTRADA' ? e.personName : 'Clínica', receivedBy: kind === 'ENTRADA' ? (e.settledByName || 'Não informado') : (e.personName || 'Não informado'), description: e.description, method, destination, destinationLabel, destinationInferred: inferred }
    if (kind === 'ENTRADA') destinations.set(destination, (destinations.get(destination) || 0) + e.amount)
    if (kind === 'ENTRADA') methods.set(method, (methods.get(method) || 0) + e.amount)
    if (kind === 'ENTRADA') {
      const splits = splitsByEntry.get(e.id) || []
      const withDoctor = splits.filter((s) => doctorName.has(s.doctorId))
      if (withDoctor.length) {
        let given = 0
        for (const s of withDoctor) {
          const v = Number(s.finalAmount ?? s.plannedAmount)
          given += v
          add(s.doctorId, doctorName.get(s.doctorId) as string, { ...base, amount: v, description: `${e.description} (parte do profissional)` })
        }
        const rest = Math.round((e.amount - given) * 100) / 100
        if (rest > 0.004) add('clinic', 'Clínica (sem profissional)', { ...base, amount: rest, description: `${e.description} (parte da clínica)` })
        continue
      }
      const d = e.patientId ? doctorOfPatient.get(e.patientId) : undefined
      if (d && doctorName.has(d)) { add(d, doctorName.get(d) as string, { ...base, amount: e.amount }); continue }
      add('clinic', 'Clínica (sem profissional)', { ...base, amount: e.amount })
    } else {
      const d = byNormName.get(norm(e.personName))
      if (d) add(d, doctorName.get(d) as string, { ...base, amount: e.amount })
      else add('clinic', 'Clínica (sem profissional)', { ...base, amount: e.amount })
    }
  }

  const list = [...groups.values()].sort((a, b) => (a.key === 'clinic' ? 1 : b.key === 'clinic' ? -1 : a.name.localeCompare(b.name)))
  const total = (k: 'entries' | 'exits') => Math.round(list.reduce((s, g) => s + g[k], 0) * 100) / 100
  const ent = total('entries'), ex = total('exits')
  return { date: dayISO, groups: list, entries: ent, exits: ex, balance: Math.round((ent - ex) * 100) / 100, byMethod: [...methods.entries()].map(([method, t]) => ({ method, total: Math.round(t * 100) / 100 })).sort((a, b) => b.total - a.total), byDestination: [...destinations.entries()].map(([destination, t]) => ({ destination: destination === 'CAIXA' ? 'Ficou no caixa' : 'Enviado para conta', total: Math.round(t * 100) / 100 })), count: entries.length }
}

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export function cashEmailBody(clinicName: string, r: CashReport) {
  const lines: string[] = [`Fechamento de caixa de ${dmy(r.date)} — ${clinicName}`, '', `Entradas: ${brl(r.entries)}`, `Saídas:   ${brl(r.exits)}`, `Saldo do dia: ${brl(r.balance)}`, '']
  if (r.byMethod.length) { lines.push('Entradas por forma de pagamento:'); for (const m of r.byMethod) lines.push(`• ${m.method}: ${brl(m.total)}`); lines.push('') }
  if (r.byDestination.length) { lines.push('Destino do dinheiro recebido:'); for (const d of r.byDestination) lines.push(`• ${d.destination}: ${brl(d.total)}`); lines.push('') }
  lines.push('Por profissional:')
  for (const g of r.groups) {
    lines.push(`\n${g.name}: entradas ${brl(g.entries)} · saídas ${brl(g.exits)} · saldo ${brl(g.balance)}`)
    for (const l of g.lines.slice(0, 40)) lines.push(`  ${l.time} ${l.kind === 'ENTRADA' ? '+' : '-'} ${brl(l.amount)} · ${l.kind === 'ENTRADA' ? 'Pagou' : 'Pago a'}: ${l.who} · ${l.description} · ${l.method} · Recebido por: ${l.receivedBy} · ${l.destinationLabel}${l.destinationInferred ? ' (presumido)' : ''}`)
    if (g.lines.length > 40) lines.push(`  … e mais ${g.lines.length - 40} lançamentos (veja no sistema).`)
  }
  lines.push('', 'A divisão por profissional segue o atendimento do paciente no dia ou a divisão da cobrança; o que não tem profissional aparece em "Clínica".', 'Veja e imprima em Financeiro > Fechamento de caixa.')
  return lines.join('\n')
}

export async function sendCashClose(c: Clinic, opts: { force?: boolean; now?: Date; day?: string } = {}) {
  const now = opts.now || new Date()
  const s = await loadCashSettings(c.id)
  const today = brtDayOf(now)
  if (!opts.force && (!s.enabled || brtHourOf(now) < SEND_HOUR_BRT || s.lastSent === today)) return { skipped: true }
  const day = opts.day || today
  const report = await buildCashReport(c.id, c.tenantId, day)
  if (!opts.force && report.count === 0) return { skipped: true, reason: 'sem movimento' }
  const follow = await loadFollowUpSettings(c.id)
  const to = s.emails.length ? s.emails : await ownerEmails(c.id, c.tenantId, follow)
  if (!to.length) return { skipped: true, reason: 'sem e-mail de destino' }
  let sent = 0
  for (const address of to) if (await sendMail(address, `Fechamento de caixa ${dmy(day)}: saldo ${brl(report.balance)}`, cashEmailBody(c.name, report))) sent += 1
  if (sent && !opts.force) await saveCashSettings(c.id, c.tenantId, { ...s, lastSent: today })
  return { skipped: false, sent, count: report.count }
}
