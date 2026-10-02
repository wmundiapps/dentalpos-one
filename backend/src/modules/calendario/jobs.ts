import { prisma } from '../../lib/prisma'
import { registerEduJob } from '../core/jobs'
import { completeReminders } from '../core/reminders'
import { notify } from '../core/notify'
import { agendarLembretesEvento } from './eventos'
import { processarPrazos } from './prazos'
import { alunosDaTurma, varrerProvas } from './provas'
import { varrerGrade } from './grade'
import { DAY_MS, toLocal } from './time'

const fmt = (d: Date) => {
  const l = toLocal(d)
  return `${String(l.getUTCDate()).padStart(2, '0')}/${String(l.getUTCMonth() + 1).padStart(2, '0')}/${l.getUTCFullYear()} às ${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`
}

/** Lembretes de eventos do calendário (próximas ocorrências, inclusive de eventos recorrentes). */
export async function jobLembretesEventos() {
  const now = new Date()
  const evs = await prisma.calEvento.findMany({
    where: { ativo: true, NOT: { lembreteDias: { isEmpty: true } }, OR: [{ recorrencia: { not: 'NENHUMA' } }, { fim: { gte: now } }] },
    take: 5000,
  })
  let n = 0
  for (const e of evs) n += await agendarLembretesEvento(e)
  return { eventos: evs.length, lembretes: n }
}

/** Reservas pendentes cujo horário já passou expiram; avisa o solicitante. */
export async function jobReservas() {
  const now = new Date()
  const vencidas = await prisma.calReserva.findMany({ where: { status: 'PENDENTE', inicio: { lt: now } }, take: 2000 })
  const series = new Set<string>()
  for (const r of vencidas) {
    await prisma.calReserva.update({ where: { id: r.id }, data: { status: 'EXPIRADA', motivoDecisao: 'Expirada sem decisão antes do horário solicitado.', decididoEm: now } })
    series.add(`${r.tenantId}|${r.serieId ?? r.id}`)
    await notify({ tenantId: r.tenantId, userId: r.solicitanteId, assunto: 'Reserva de espaço expirada', mensagem: `Sua solicitação "${r.titulo}" (${fmt(r.inicio)}) expirou sem decisão. Faça uma nova solicitação com antecedência.`, refType: 'CalReserva', refId: r.id })
  }
  for (const k of series) {
    const [tenantId, refId] = k.split('|')
    const resta = await prisma.calReserva.count({ where: { tenantId, status: 'PENDENTE', OR: [{ id: refId }, { serieId: refId }] } })
    if (!resta) await completeReminders({ tenantId, refType: 'CalReserva', refId })
  }
  return { expiradas: vencidas.length }
}

/** Avisa os alunos 7 dias e 1 dia antes das avaliações. */
export async function jobLembretesProvas() {
  const now = new Date()
  const exames = await prisma.calExame.findMany({
    where: { status: { in: ['AGENDADA', 'CONFIRMADA'] }, inicio: { gt: now, lte: new Date(now.getTime() + 7 * DAY_MS + 3_600_000) } },
    take: 3000,
  })
  let avisos = 0
  let provas = 0
  for (const e of exames) {
    const falta = e.inicio.getTime() - now.getTime()
    const d1 = falta <= DAY_MS + 3_600_000
    const ja = e.lembreteAlunosEm
    const precisaD1 = d1 && (!ja || ja.getTime() < e.inicio.getTime() - DAY_MS - 3_600_000)
    const precisaD7 = !d1 && !ja
    if (!precisaD1 && !precisaD7) continue
    const sala = e.spaceId ? await prisma.eduSpace.findFirst({ where: { id: e.spaceId, tenantId: e.tenantId }, select: { codigo: true, nome: true } }) : null
    const ids = await alunosDaTurma(e.tenantId, e.classSectionId)
    const msg = `${precisaD1 ? 'Amanhã' : 'Em até 7 dias'}: ${e.titulo} — ${fmt(e.inicio)}${sala ? `, sala ${sala.codigo}` : ''}.`
    for (const studentId of ids.slice(0, 3000)) {
      await notify({ tenantId: e.tenantId, studentId, assunto: precisaD1 ? 'Avaliação amanhã' : 'Avaliação se aproximando', mensagem: msg, refType: 'CalExame', refId: e.id, templateKey: 'cal.prova.lembrete' })
      avisos++
    }
    await prisma.calExame.update({ where: { id: e.id }, data: { lembreteAlunosEm: now } })
    provas++
  }
  return { provas, avisos }
}

/** Varredura diária de choques (grade e avaliações) nos períodos em andamento. */
export async function jobVarredura() {
  const now = new Date()
  const terms = await prisma.academicTerm.findMany({ where: { dataFim: { gte: now }, dataInicio: { lte: new Date(now.getTime() + 60 * DAY_MS) } }, take: 500 })
  let slots = 0
  let provas = 0
  for (const t of terms) {
    const g = await varrerGrade(t.tenantId, t.id)
    slots += g.choques.total + g.capacidadeETipo + g.alunosEmChoque
    const p = await varrerProvas(t.tenantId, t.id)
    provas += p.conflitos
  }
  return { periodos: terms.length, conflitosGrade: slots, conflitosProvas: provas }
}

export function registrarJobsCalendario() {
  registerEduJob('calendario.eventos-lembretes', jobLembretesEventos)
  registerEduJob('calendario.prazos-notas', () => processarPrazos())
  registerEduJob('calendario.reservas', jobReservas)
  registerEduJob('calendario.provas-lembretes', jobLembretesProvas)
  registerEduJob('calendario.varredura-conflitos', jobVarredura)
}
