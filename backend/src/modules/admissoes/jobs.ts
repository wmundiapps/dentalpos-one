import { prisma } from '../../lib/prisma'
import { registerEduJob } from '../core/jobs'
import { scheduleReminder } from '../core/reminders'
import { agendarLembretesRematricula, avaliarAluno, encerrarCampanha } from './rematricula'
import { expirarConvocacoes, sincronizarTaxasPagas } from './services'

const DAY = 86_400_000

// Manutenção periódica de admissões (chamada pelo cron /api/cron/edu).
export async function manutencaoAdmissoes(agora = new Date()) {
  const out: Record<string, number> = {}

  // 1) Encerra processos com inscrições vencidas
  out.processosEncerrados = (await prisma.admProcessoSeletivo.updateMany({ where: { status: 'ABERTO', inscricaoFim: { lt: agora } }, data: { status: 'ENCERRADO' } })).count

  // 2) Expira convocações sem matrícula no prazo
  out.convocacoesExpiradas = await expirarConvocacoes(undefined, agora)

  // 3) Sincroniza taxas de inscrição pagas
  out.taxasSincronizadas = await sincronizarTaxasPagas()

  // 4) Leads parados: sem contato humano há 2+ dias
  const parados = await prisma.admCandidato.findMany({
    where: { status: { in: ['LEAD', 'INSCRITO'] }, createdAt: { lt: new Date(agora.getTime() - 2 * DAY) }, proximoContatoEm: null, interacoes: { none: { tipo: { not: 'SISTEMA' } } } },
    select: { id: true, tenantId: true, nome: true, responsavelId: true, status: true }, take: 300,
  })
  for (const c of parados) {
    await scheduleReminder({ tenantId: c.tenantId, modulo: 'admissoes', titulo: `Candidato sem contato: ${c.nome} (${c.status})`, descricao: 'Nenhuma interação registrada há mais de 2 dias.', dueAt: new Date(agora.getTime() + DAY), remindAt: agora, refType: 'AdmCandidato', refId: c.id, assigneeUserId: c.responsavelId ?? undefined, assigneeRole: c.responsavelId ? undefined : 'ADMISSIONS', severity: 'ATENCAO', dedupeKey: `adm-semcontato-${c.id}` })
  }
  out.leadsParados = parados.length

  // 5) Matrículas iniciadas há 3+ dias com documentos pendentes
  const mats = await prisma.admMatricula.findMany({ where: { status: 'PENDENTE_DOCUMENTOS', createdAt: { lt: new Date(agora.getTime() - 3 * DAY) } }, include: { candidato: { select: { nome: true } } }, take: 300 })
  for (const m of mats) {
    await scheduleReminder({ tenantId: m.tenantId, modulo: 'admissoes', titulo: `Matrícula parada por documentos: ${m.candidato.nome}`, dueAt: new Date(agora.getTime() + DAY), remindAt: agora, refType: 'AdmMatricula', refId: m.id, assigneeRole: 'ADMISSIONS', severity: 'ATENCAO', dedupeKey: `adm-docs-parada-${m.id}` })
  }
  out.matriculasParadas = mats.length

  // 6) Campanhas de marketing: encerra vencidas e alerta estouro de orçamento
  out.campanhasEncerradas = (await prisma.admCampanha.updateMany({ where: { status: { in: ['ATIVA', 'PAUSADA'] }, fim: { lt: agora } }, data: { status: 'ENCERRADA' } })).count
  const ativas = await prisma.admCampanha.findMany({ where: { status: 'ATIVA', orcamento: { gt: 0 } }, select: { id: true, tenantId: true, nome: true, orcamento: true } })
  let estouros = 0
  for (const c of ativas) {
    const g = await prisma.admCampanhaGasto.aggregate({ where: { tenantId: c.tenantId, campanhaId: c.id }, _sum: { valor: true } })
    const gasto = g._sum.valor ?? 0
    if (gasto >= c.orcamento * 0.9) {
      await scheduleReminder({ tenantId: c.tenantId, modulo: 'admissoes', titulo: `Orçamento da campanha "${c.nome}" em ${Math.round((gasto / c.orcamento) * 100)}%`, dueAt: new Date(agora.getTime() + DAY), remindAt: agora, refType: 'AdmCampanha', refId: c.id, assigneeRole: 'MARKETING', severity: gasto >= c.orcamento ? 'CRITICO' : 'ATENCAO', dedupeKey: `adm-orcamento-${c.id}-${gasto >= c.orcamento ? 'estouro' : 'alerta'}` })
      estouros++
    }
  }
  out.alertasOrcamento = estouros

  // 7) Rematrícula: reavalia pendências, agenda lembretes D-30/15/7/1 para novos itens e encerra janelas vencidas
  const abertas = await prisma.admRematriculaCampanha.findMany({ where: { status: 'ABERTA' } })
  let reavaliados = 0, lembretes = 0, encerradas = 0
  for (const camp of abertas) {
    if (camp.janelaFim < agora) { await encerrarCampanha(camp.tenantId, camp.id); encerradas++; continue }
    const itens = await prisma.admRematricula.findMany({ where: { campanhaId: camp.id, status: { in: ['PENDENTE_FINANCEIRO', 'PENDENTE_ACADEMICO', 'ELEGIVEL'] } }, take: 2000 })
    for (const it of itens) {
      try {
        const av = await avaliarAluno(camp.tenantId, it.studentId, camp.bloqueiaInadimplente, agora)
        if (av.status !== it.status) { await prisma.admRematricula.update({ where: { id: it.id }, data: { status: av.status, pendencias: av.pendencias as any } }); reavaliados++ }
      } catch { /* aluno removido: ignora */ }
    }
    lembretes += await agendarLembretesRematricula(camp.tenantId, camp.id)
  }
  out.rematriculasReavaliadas = reavaliados
  out.lembretesRematricula = lembretes
  out.campanhasRematriculaEncerradas = encerradas
  return out
}

registerEduJob('admissoes.manutencao', () => manutencaoAdmissoes())
