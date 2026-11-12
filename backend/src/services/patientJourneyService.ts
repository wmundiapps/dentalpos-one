import { prisma } from '../lib/prisma'

// Jornada do paciente: relatório diário ao gestor, um bloco por paciente que teve movimento no período
// (orçamento, consulta, procedimento, financeiro, laboratório, evolução). Só leitura: não altera nada.
const DAY = 86400000
const MAX_PATIENTS = 60
const LONG_AWAY_DAYS = 90

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brtDayOf = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10)
const dmy = (d: Date | string) => { const iso = typeof d === 'string' ? d : brtDayOf(d); return `${iso.slice(8, 10)}/${iso.slice(5, 7)}` }
const hm = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(11, 16)
const norm = (v: string) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export const APPOINTMENT_LABEL: Record<string, string> = {
  SCHEDULED: 'agendado', CONFIRMED: 'confirmado', WAITING: 'na recepção', ROOM_PREPARATION: 'preparando sala', IN_PROGRESS: 'em atendimento',
  COMPLETED: 'atendido', CANCELLED: 'cancelado', NO_SHOW: 'faltou',
}
export const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'dinheiro', DINHEIRO: 'dinheiro', PIX: 'Pix', CREDIT_CARD: 'cartão de crédito', DEBIT_CARD: 'cartão de débito', CARD: 'cartão', CARTAO: 'cartão',
  BOLETO: 'boleto', BOLETO_BANCARIO: 'boleto', PERMUTA: 'permuta', TRANSFER: 'transferência', CHEQUE: 'cheque',
}
export const paymentLabel = (m?: string | null) => { const k = String(m || '').trim(); return k ? PAYMENT_LABEL[k.toUpperCase().replace(/[ -]/g, '_')] || k : 'forma não informada' }

// O procedimento anotado na evolução corresponde ao que foi orçado/planejado? Compara por palavras (sem acento) com os itens do plano e a descrição dos orçamentos.
export function matchesPlan(procedure: string, planned: string[]) {
  const p = norm(procedure)
  if (!p) return true
  const words = p.split(' ').filter(w => w.length >= 5)
  return planned.some(item => {
    const t = norm(item)
    if (!t) return false
    if (t.includes(p) || p.includes(t)) return true
    return words.some(w => t.includes(w))
  })
}

export type JourneyPatient = {
  name: string; phone?: string | null; isNew: boolean
  budget: { status: string; total: number; method: string; acceptedAt: Date | null; createdAt: Date } | null
  appointments: Array<{ at: Date; procedure: string; status: string; doctor: string; rescheduled: boolean }>
  nextAppointment: { at: Date; procedure: string } | null
  evolutions: Array<{ procedure: string; professional: string; matchesPlan: boolean }>
  missingEvolution: Array<{ at: Date; procedure: string; doctor: string }>
  paid: Array<{ amount: number; method: string; description: string }>
  overdue: { total: number; count: number; days: number } | null
  lab: Array<{ workType: string; status: string; due: Date | null; late: boolean }>
  lastVisit: Date | null; hasPlanOrBudget: boolean
}

export function patientAlerts(p: JourneyPatient) {
  const a: string[] = []
  if (p.missingEvolution.length) a.push('procedimento NÃO anotado no atendimento')
  if (p.evolutions.some(e => !e.matchesPlan)) a.push('procedimento fora do orçamento: passar novo orçamento')
  if (p.overdue) a.push(`pagamento em atraso (${brl(p.overdue.total)})`)
  if (p.lab.some(l => l.late)) a.push('trabalho do laboratório atrasado')
  if (p.isNew && !p.budget) a.push('paciente novo sem orçamento')
  if (p.lastVisit && !p.nextAppointment && Date.now() - p.lastVisit.getTime() > LONG_AWAY_DAYS * DAY) a.push(`não vem há mais de ${LONG_AWAY_DAYS} dias e não tem retorno marcado`)
  else if (!p.nextAppointment && p.appointments.some(x => x.status === 'COMPLETED')) a.push('sem próximo horário marcado')
  return a
}

export function journeyLines(p: JourneyPatient) {
  const L: string[] = []
  L.push(`${p.isNew ? '🆕 ' : ''}${p.name}${p.phone ? ` — ${p.phone}` : ''}`)
  if (p.budget) L.push(`  Orçamento: ${p.budget.status === 'ACCEPTED' ? `APROVADO em ${p.budget.acceptedAt ? dmy(p.budget.acceptedAt) : '—'}` : p.budget.status === 'PENDING' ? 'enviado, aguardando aprovação' : p.budget.status.toLowerCase()} · ${brl(p.budget.total)} · ${paymentLabel(p.budget.method)}`)
  else L.push('  Orçamento: nenhum cadastrado')
  for (const x of p.appointments) L.push(`  Consulta ${dmy(x.at)} ${hm(x.at)}: ${x.procedure} com ${x.doctor} — ${APPOINTMENT_LABEL[x.status] || x.status.toLowerCase()}${x.rescheduled ? ' (remarcada)' : ''}`)
  for (const e of p.evolutions) L.push(`  Procedimento anotado: ${e.procedure}${e.professional ? ` (${e.professional})` : ''} — ${p.hasPlanOrBudget ? (e.matchesPlan ? 'está no orçamento/plano' : 'NÃO está no orçamento: passar novo orçamento ao paciente') : 'paciente sem orçamento/plano'}`)
  for (const m of p.missingEvolution) L.push(`  ⚠ Atendido em ${dmy(m.at)} (${m.procedure}, ${m.doctor}) e NINGUÉM anotou o procedimento feito.`)
  if (p.paid.length) L.push(`  Financeiro: recebeu ${p.paid.map(x => `${brl(x.amount)} em ${paymentLabel(x.method)}`).join('; ')}`)
  else L.push('  Financeiro: nenhum pagamento no período')
  if (p.overdue) L.push(`  ⚠ Em atraso: ${brl(p.overdue.total)} em ${p.overdue.count} lançamento(s), o mais antigo há ${p.overdue.days} dia(s)`)
  for (const l of p.lab) L.push(`  Laboratório: ${l.workType} — ${l.status}${l.due ? `, entrega ${dmy(l.due)}` : ''}${l.late ? ' (ATRASADO)' : ''}`)
  L.push(p.nextAppointment ? `  Próximo horário: ${dmy(p.nextAppointment.at)} ${hm(p.nextAppointment.at)} — ${p.nextAppointment.procedure}` : `  Próximo horário: não marcado${p.lastVisit ? ` (última vinda em ${dmy(p.lastVisit)})` : ''}`)
  const alerts = patientAlerts(p)
  if (alerts.length) L.push(`  → ATENÇÃO: ${alerts.join('; ')}.`)
  return L
}

export function journeyBody(clinicName: string, from: Date, to: Date, patients: JourneyPatient[], truncated = 0) {
  const withAlerts = patients.filter(p => patientAlerts(p).length)
  const count = (pred: (p: JourneyPatient) => boolean) => patients.filter(pred).length
  const head = [
    `Jornada dos pacientes — ${clinicName}`,
    `Período: ${dmy(from)}${brtDayOf(from) === brtDayOf(new Date(to.getTime() - 1)) ? '' : ` a ${dmy(new Date(to.getTime() - 1))}`} · ${patients.length} paciente(s) com movimento${truncated ? ` (mostrando os ${MAX_PATIENTS} primeiros; mais ${truncated} no sistema)` : ''}.`,
    '',
    'Resumo:',
    `• Pacientes novos: ${count(p => p.isNew)}`,
    `• Atendimentos sem o procedimento anotado: ${count(p => p.missingEvolution.length > 0)}`,
    `• Procedimentos fora do orçamento (passar novo orçamento): ${count(p => p.evolutions.some(e => !e.matchesPlan))}`,
    `• Pacientes com pagamento em atraso: ${count(p => !!p.overdue)}`,
    `• Trabalhos de laboratório atrasados: ${count(p => p.lab.some(l => l.late))}`,
    `• Pacientes sem próximo horário marcado: ${count(p => !p.nextAppointment)}`,
    '',
  ]
  const out = [...head]
  if (withAlerts.length) {
    out.push('PRECISAM DE ATENÇÃO:', ...withAlerts.map(p => `• ${p.name}: ${patientAlerts(p).join('; ')}`), '')
  }
  out.push('Detalhe por paciente:', '')
  for (const p of patients) out.push(...journeyLines(p), '')
  out.push('Contratos e notas promissórias: ainda não são acompanhados por este relatório (próxima etapa).', 'Este relatório é só informativo. Para desligar ou mudar quem recebe: Configurações > Acompanhamento.')
  return out.join('\n')
}

// Janela do relatório: o dia anterior (BRT); na segunda-feira, desde o sábado.
export function journeyWindow(now = new Date()) {
  const today = new Date(`${brtDayOf(now)}T00:00:00-03:00`)
  const weekday = new Date(now.getTime() - 3 * 3600000).getUTCDay()
  const back = weekday === 1 ? 2 : 1
  return { from: new Date(today.getTime() - back * DAY), to: today }
}

export async function buildJourney(clinicId: string, tenantId: string, from: Date, to: Date, now = new Date()) {
  const win = { gte: from, lt: to }
  const [newPatients, appts, budgets, entries, evos, labs] = await Promise.all([
    prisma.patient.findMany({ where: { clinicId, tenantId, createdAt: win }, select: { id: true }, take: 500 }),
    prisma.appointment.findMany({ where: { clinicId, tenantId, OR: [{ scheduledAt: win }, { createdAt: win }, { updatedAt: win }] }, select: { patientId: true }, take: 1000 }),
    prisma.budget.findMany({ where: { clinicId, tenantId, OR: [{ createdAt: win }, { acceptedAt: win }, { updatedAt: win }] }, select: { patientId: true }, take: 500 }),
    prisma.financialEntry.findMany({ where: { clinicId, tenantId, type: 'INCOME', patientId: { not: null }, OR: [{ paidAt: win }, { createdAt: win }] }, select: { patientId: true }, take: 1000 }),
    prisma.clinicalEvolution.findMany({ where: { clinicId, tenantId, createdAt: win }, select: { patientId: true }, take: 1000 }),
    prisma.labOrder.findMany({ where: { clinicId, tenantId, deletedAt: null, updatedAt: win }, select: { patientName: true }, take: 500 }),
  ])
  const ids = new Set<string>()
  for (const r of newPatients) ids.add(r.id)
  for (const r of [...appts, ...budgets, ...entries, ...evos]) if (r.patientId) ids.add(r.patientId)
  const labNames = [...new Set(labs.map(l => l.patientName).filter(Boolean))]
  if (labNames.length) {
    const byName = await prisma.patient.findMany({ where: { clinicId, tenantId, fullName: { in: labNames, mode: 'insensitive' } }, select: { id: true }, take: 500 })
    byName.forEach(p => ids.add(p.id))
  }
  const all = [...ids]
  const truncated = Math.max(0, all.length - MAX_PATIENTS)
  const list = all.slice(0, MAX_PATIENTS)
  if (!list.length) return { patients: [] as JourneyPatient[], truncated: 0 }

  const [patients, bud, ap, fin, ev, items, lo] = await Promise.all([
    prisma.patient.findMany({ where: { id: { in: list }, clinicId, tenantId }, select: { id: true, fullName: true, phone: true, createdAt: true } }),
    prisma.budget.findMany({ where: { clinicId, tenantId, patientId: { in: list } }, orderBy: { createdAt: 'desc' }, select: { patientId: true, status: true, totalAmount: true, paymentMethod: true, acceptedAt: true, createdAt: true, description: true }, take: 600 }),
    prisma.appointment.findMany({ where: { clinicId, tenantId, patientId: { in: list } }, orderBy: { scheduledAt: 'asc' }, select: { id: true, patientId: true, procedure: true, status: true, scheduledAt: true, createdAt: true, updatedAt: true, doctor: { select: { user: { select: { firstName: true, lastName: true } } } }, history: { select: { action: true, createdAt: true } } }, take: 3000 }),
    prisma.financialEntry.findMany({ where: { clinicId, tenantId, type: 'INCOME', patientId: { in: list } }, select: { patientId: true, amount: true, status: true, paymentMethod: true, description: true, paidAt: true, dueDate: true }, take: 3000 }),
    prisma.clinicalEvolution.findMany({ where: { clinicId, tenantId, patientId: { in: list } }, select: { patientId: true, procedure: true, professionalName: true, createdAt: true, appointmentId: true }, take: 3000 }),
    prisma.treatmentItem.findMany({ where: { clinicId, tenantId, patientId: { in: list } }, select: { patientId: true, procedure: true }, take: 3000 }),
    prisma.labOrder.findMany({ where: { clinicId, tenantId, deletedAt: null, deliveredAt: null }, select: { patientName: true, workType: true, status: true, dueDate: true }, take: 800 }),
  ])
  const out: JourneyPatient[] = []
  for (const p of patients) {
    const myBud = bud.filter(b => b.patientId === p.id)
    const lastBud = myBud[0] || null
    const planned = [...items.filter(i => i.patientId === p.id).map(i => i.procedure), ...myBud.map(b => b.description)]
    const myAp = ap.filter(a => a.patientId === p.id)
    const inWin = myAp.filter(a => (a.scheduledAt >= from && a.scheduledAt < to) || (a.createdAt >= from && a.createdAt < to) || (a.updatedAt >= from && a.updatedAt < to))
    const myEv = ev.filter(e => e.patientId === p.id)
    const evInWin = myEv.filter(e => e.createdAt >= from && e.createdAt < to)
    const doctor = (a: (typeof myAp)[number]) => `${a.doctor?.user?.firstName || ''} ${a.doctor?.user?.lastName || ''}`.trim() || 'profissional'
    const missing = inWin.filter(a => a.status === 'COMPLETED' && a.scheduledAt >= from && a.scheduledAt < to && !myEv.some(e => e.appointmentId === a.id || (e.createdAt >= new Date(a.scheduledAt.getTime() - 6 * 3600000) && e.createdAt <= new Date(a.scheduledAt.getTime() + 30 * 3600000))))
    const myFin = fin.filter(f => f.patientId === p.id)
    const overdueRows = myFin.filter(f => !['PAID', 'CANCELLED'].includes(f.status) && f.dueDate < now)
    const upcoming = myAp.filter(a => a.scheduledAt > now && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(a.status))[0]
    const lastDone = [...myAp].reverse().find(a => a.status === 'COMPLETED' && a.scheduledAt <= now)
    const nm = norm(p.fullName)
    out.push({
      name: p.fullName, phone: p.phone, isNew: p.createdAt >= from && p.createdAt < to,
      budget: lastBud ? { status: lastBud.status, total: Number(lastBud.totalAmount), method: lastBud.paymentMethod, acceptedAt: lastBud.acceptedAt, createdAt: lastBud.createdAt } : null,
      appointments: inWin.slice(0, 6).map(a => ({ at: a.scheduledAt, procedure: a.procedure, status: a.status, doctor: doctor(a), rescheduled: a.history.some(h => h.action === 'RESCHEDULED' && h.createdAt >= from && h.createdAt < to) })),
      nextAppointment: upcoming ? { at: upcoming.scheduledAt, procedure: upcoming.procedure } : null,
      evolutions: evInWin.slice(0, 6).map(e => ({ procedure: e.procedure, professional: e.professionalName, matchesPlan: matchesPlan(e.procedure, planned) })),
      missingEvolution: missing.map(a => ({ at: a.scheduledAt, procedure: a.procedure, doctor: doctor(a) })),
      paid: myFin.filter(f => f.status === 'PAID' && f.paidAt && f.paidAt >= from && f.paidAt < to).slice(0, 6).map(f => ({ amount: Number(f.amount), method: f.paymentMethod || '', description: f.description })),
      overdue: overdueRows.length ? { total: overdueRows.reduce((s, r) => s + Number(r.amount), 0), count: overdueRows.length, days: Math.max(1, Math.floor((now.getTime() - Math.min(...overdueRows.map(r => r.dueDate.getTime()))) / DAY)) } : null,
      lab: lo.filter(l => norm(l.patientName) === nm).slice(0, 4).map(l => ({ workType: l.workType, status: l.status, due: l.dueDate, late: !!l.dueDate && l.dueDate < now })),
      lastVisit: lastDone ? lastDone.scheduledAt : null, hasPlanOrBudget: planned.length > 0,
    })
  }
  // Primeiro quem precisa de atenção.
  out.sort((a, b) => patientAlerts(b).length - patientAlerts(a).length || a.name.localeCompare(b.name, 'pt-BR'))
  return { patients: out, truncated }
}
