import { prisma } from '../../lib/prisma'
import { registerEduJob } from '../core/jobs'
import { scheduleReminder } from '../core/reminders'
import { MOD } from './common'
import { finalizarTentativa, encerrarSimulado } from './simulados'
import { recalcularEstatisticas } from './questoes'
import { gerarAlertas } from './painel'
import { lembrarItensTrilha, alertarTrilhasAtrasadas } from './trilhas'

const DAY = 86_400_000

registerEduJob('desempenho.simulados', async () => {
  const now = new Date()
  // tentativas com tempo esgotado (tolerância 1 min) -> correção automática
  const exp = await prisma.desTentativa.findMany({ where: { status: 'EM_ANDAMENTO', expiraEm: { lt: new Date(now.getTime() - 60_000) } }, select: { id: true, tenantId: true }, take: 1000 })
  for (const t of exp) await finalizarTentativa(t.tenantId, t.id, 'EXPIRADA')
  // simulados com janela vencida -> encerra
  const sims = await prisma.desSimulado.findMany({ where: { status: 'PUBLICADO', fechaEm: { lt: now } }, select: { id: true, tenantId: true }, take: 200 })
  for (const s of sims) await encerrarSimulado(s.tenantId, s.id)
  return { tentativasExpiradas: exp.length, simuladosEncerrados: sims.length }
})

registerEduJob('desempenho.edicoes', async () => {
  const now = new Date()
  // transições de status por data
  const abre = await prisma.desEdicao.updateMany({ where: { status: 'PLANEJADA', inscricaoInicio: { lte: now }, OR: [{ inscricaoFim: null }, { inscricaoFim: { gte: now } }] }, data: { status: 'INSCRICOES_ABERTAS' } })
  const fecha = await prisma.desEdicao.updateMany({ where: { status: 'INSCRICOES_ABERTAS', inscricaoFim: { lt: now } }, data: { status: 'INSCRICOES_ENCERRADAS' } })
  const real = await prisma.desEdicao.updateMany({ where: { status: { in: ['PLANEJADA', 'INSCRICOES_ABERTAS', 'INSCRICOES_ENCERRADAS'] }, dataProva: { lt: new Date(now.getTime() - DAY) } }, data: { status: 'REALIZADA' } })
  // lembretes por estudante com inscrição pendente (prazo = fim das inscrições)
  const eds = await prisma.desEdicao.findMany({ where: { status: { in: ['PLANEJADA', 'INSCRICOES_ABERTAS'] }, inscricaoFim: { gte: now, lte: new Date(now.getTime() + 30 * DAY) } }, include: { exame: { select: { nome: true } } } })
  let lembretes = 0
  for (const ed of eds) {
    const pend = await prisma.desInscricao.findMany({ where: { edicaoId: ed.id, situacao: { in: ['PENDENTE', 'IRREGULAR'] } }, select: { id: true, studentId: true }, take: 3000 })
    for (const p of pend) {
      await scheduleReminder({ tenantId: ed.tenantId, modulo: MOD, titulo: `Regularize sua inscrição: ${ed.exame.nome} ${ed.ano}`, dueAt: ed.inscricaoFim!, antecedenciaDias: 10, severity: 'ATENCAO', assigneeStudentId: p.studentId, refType: 'DesInscricao', refId: p.id, dedupeKey: `des:insc:${p.id}`, recorrenciaDias: 5 })
      lembretes++
    }
    if (pend.length) await scheduleReminder({ tenantId: ed.tenantId, modulo: MOD, titulo: `${pend.length} inscrição(ões) pendente(s) — ${ed.exame.nome} ${ed.ano}`, dueAt: ed.inscricaoFim!, antecedenciaDias: 15, severity: pend.length > 10 ? 'CRITICO' : 'ATENCAO', assigneeRole: 'COORDINATOR', refType: 'DesEdicao', refId: ed.id, dedupeKey: `des:ed:${ed.id}:pendencias`, recorrenciaDias: 7 })
  }
  return { abertas: abre.count, encerradas: fecha.count, realizadas: real.count, lembretes }
})

registerEduJob('desempenho.estatisticas', async () => {
  const tenants = await prisma.desQuestao.findMany({ where: { totalRespostas: { gte: 0 }, status: { in: ['PUBLICADO', 'REVISADO'] } }, distinct: ['tenantId'], select: { tenantId: true } })
  let atualizadas = 0
  for (const t of tenants) atualizadas += (await recalcularEstatisticas(t.tenantId)).atualizadas
  return { atualizadas }
})

registerEduJob('desempenho.alertas', async () => {
  const desde = new Date(Date.now() - 45 * DAY)
  const t = await prisma.desTentativa.findMany({ where: { status: { in: ['ENVIADA', 'EXPIRADA'] }, enviadaEm: { gte: desde } }, select: { tenantId: true, simulado: { select: { exameId: true } } }, take: 5000 })
  const pares = new Set(t.map((x) => `${x.tenantId}|${x.simulado.exameId}`))
  let alertas = 0
  for (const p of pares) { const [tenantId, exameId] = p.split('|'); alertas += (await gerarAlertas(tenantId, exameId)).alertas }
  return { exames: pares.size, alertas }
})

registerEduJob('desempenho.trilhas', async () => ({ ...(await lembrarItensTrilha()), ...(await alertarTrilhasAtrasadas()) }))

registerEduJob('desempenho.atividades', async () => {
  const r = await prisma.desEntrega.updateMany({ where: { status: 'PENDENTE', atribuicao: { status: 'ABERTA', prazo: { lt: new Date() } } }, data: { status: 'ATRASADA' } })
  return { marcadasAtrasadas: r.count }
})
