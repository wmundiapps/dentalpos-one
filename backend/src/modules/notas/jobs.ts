import { prisma } from '../../lib/prisma'
import { registerEduJob } from '../core/jobs'
import { scheduleReminder } from '../core/reminders'
import { notify } from '../core/notify'
import { recalcularTurma, roster } from './service'
import { weekKey } from './common'

const DAY = 86400000

async function secoesAtivas() {
  const now = new Date()
  const margem = new Date(now.getTime() - 30 * DAY)   // inclui período recém-encerrado (diário ainda aberto)
  return prisma.classSection.findMany({
    where: { term: { dataInicio: { lte: now }, dataFim: { gte: margem } } },
    select: { id: true, tenantId: true, nome: true, professorUserId: true, termId: true, term: { select: { dataFim: true } } },
    take: 3000,
  })
}

// Professores com notas pendentes / diário sem fechar perto (ou depois) do fim do período.
export async function jobPendenciasProfessores() {
  const now = Date.now()
  const secs = await secoesAtivas()
  const diarios = await prisma.ntDiario.findMany({ where: { classSectionId: { in: secs.map((s) => s.id) } } })
  let lembretes = 0
  for (const s of secs) {
    const d = diarios.find((x) => x.classSectionId === s.id)
    if (d?.status === 'FECHADO') continue
    const comps = await prisma.ntComponente.findMany({ where: { tenantId: s.tenantId, classSectionId: s.id, tipo: 'AVALIACAO', obrigatorio: true, dataPrevista: { lt: new Date(now - 3 * DAY) } } })
    if (comps.length) {
      const alunos = (await roster(s.tenantId, s.id)).length
      const cont = await prisma.ntLancamento.groupBy({ by: ['componenteId'], where: { tenantId: s.tenantId, classSectionId: s.id, componenteId: { in: comps.map((c) => c.id) }, OR: [{ valor: { not: null } }, { ausente: true }] }, _count: true })
      const pend = comps.map((c) => ({ c, faltam: alunos - (cont.find((x) => x.componenteId === c.id)?._count ?? 0) })).filter((p) => p.faltam > 0)
      if (pend.length) {
        await scheduleReminder({
          tenantId: s.tenantId, modulo: 'notas', titulo: `Notas pendentes — ${s.nome}`,
          descricao: pend.map((p) => `${p.c.codigo}: ${p.faltam} aluno(s) sem nota`).join('; '),
          dueAt: new Date(now + 3 * DAY), remindAt: new Date(), severity: 'ATENCAO', assigneeUserId: s.professorUserId,
          refType: 'NtDiario', refId: s.id, dedupeKey: `nt-pend-${s.id}-${weekKey()}`,
        })
        lembretes++
      }
    }
    // fim de período se aproximando (<= 15 dias) ou já passado com diário aberto
    const dias = Math.ceil((s.term.dataFim.getTime() - now) / DAY)
    if (dias <= 15) {
      await scheduleReminder({
        tenantId: s.tenantId, modulo: 'notas', titulo: dias >= 0 ? `Fechar diário de ${s.nome} (período termina em ${dias} dia(s))` : `ATRASO: diário de ${s.nome} ainda aberto após o fim do período`,
        dueAt: dias >= 0 ? s.term.dataFim : new Date(now + 2 * DAY), remindAt: new Date(), severity: dias < 0 ? 'CRITICO' : 'ATENCAO',
        assigneeUserId: s.professorUserId, ...(dias < 0 ? { assigneeRole: 'COORDINATOR' } : {}),
        refType: 'NtDiario', refId: s.id, dedupeKey: `nt-fechar-${s.id}-${dias < 0 ? weekKey() : 'prazo'}`,
      })
      lembretes++
    }
  }
  return { turmas: secs.length, lembretes }
}

// Recalcula resultados das turmas com diário aberto e avisa alunos com risco ALTO (no máx. 1 aviso / 14 dias por aluno-turma).
export async function jobAlunosEmRisco() {
  const secs = await secoesAtivas()
  const diarios = await prisma.ntDiario.findMany({ where: { classSectionId: { in: secs.map((s) => s.id) }, status: 'FECHADO' }, select: { classSectionId: true } })
  const fechados = new Set(diarios.map((d) => d.classSectionId))
  let turmas = 0
  let avisos = 0
  for (const s of secs) {
    if (fechados.has(s.id)) continue
    const calc = await recalcularTurma(s.tenantId, s.id)
    if (!calc) continue
    turmas++
    const altos = calc.alunos.filter((a) => a.risco.nivel === 'ALTO')
    for (const a of altos) {
      const recente = await prisma.eduNotification.findFirst({ where: { tenantId: s.tenantId, studentId: a.aluno.studentId, refType: 'NtRisco', refId: s.id, createdAt: { gte: new Date(Date.now() - 14 * DAY) } }, select: { id: true } })
      if (recente) continue
      await notify({
        tenantId: s.tenantId, studentId: a.aluno.studentId, assunto: `Atenção ao seu desempenho em ${s.nome}`,
        mensagem: `Identificamos risco de reprovação: ${a.risco.motivos.join('; ')}. Procure o professor ou a coordenação — há apoio disponível.`,
        templateKey: 'nt-aluno-risco', refType: 'NtRisco', refId: s.id,
      })
      avisos++
    }
    if (altos.length) {
      await scheduleReminder({
        tenantId: s.tenantId, modulo: 'notas', titulo: `${altos.length} aluno(s) em risco — ${s.nome}`, descricao: altos.slice(0, 8).map((a) => `${a.aluno.nome} (${a.risco.motivos[0]})`).join('; '),
        dueAt: new Date(Date.now() + 7 * DAY), remindAt: new Date(), severity: 'ATENCAO', assigneeUserId: s.professorUserId, assigneeRole: 'COORDINATOR',
        refType: 'NtRisco', refId: s.id, dedupeKey: `nt-risco-${s.id}-${weekKey()}`,
      })
    }
  }
  return { turmas, avisos }
}

// Revisões de nota sem parecer no prazo / sem decisão da coordenação.
export async function jobRevisoesAtrasadas() {
  const now = new Date()
  const rs = await prisma.ntRevisao.findMany({ where: { status: { in: ['SOLICITADA', 'PARECER_EMITIDO'] } }, take: 1000 })
  let escalonadas = 0
  for (const r of rs) {
    const base = r.status === 'SOLICITADA' ? r.prazoParecer : r.parecerEm ? new Date(r.parecerEm.getTime() + 3 * DAY) : null
    if (!base || base.getTime() > now.getTime()) continue
    await scheduleReminder({
      tenantId: r.tenantId, modulo: 'notas', titulo: r.status === 'SOLICITADA' ? 'Revisão de nota SEM parecer do professor (prazo vencido)' : 'Revisão de nota aguardando decisão da coordenação',
      dueAt: now, remindAt: now, severity: 'CRITICO', assigneeRole: 'COORDINATOR', refType: 'NtRevisao', refId: r.id, dedupeKey: `nt-rev-atraso-${r.id}-${r.status}`,
    })
    escalonadas++
  }
  return { abertas: rs.length, escalonadas }
}

registerEduJob('notas:pendencias-professores', jobPendenciasProfessores)
registerEduJob('notas:alunos-em-risco', jobAlunosEmRisco)
registerEduJob('notas:revisoes-atrasadas', jobRevisoesAtrasadas)
