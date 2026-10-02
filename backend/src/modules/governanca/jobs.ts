import { prisma } from '../../lib/prisma'
import { registerEduJob } from '../core/jobs'
import { MOD, DAY, ensureReminder } from './common'
import { scheduleColeta, scheduleAcao } from './pdi'
import { verificarNde } from './nde'
import { garantirReunioesCipa } from './cipa'
import { varrerElegibilidade } from './carreira'

export function registerGovJobs() {
  // PDI: garante lembretes de coleta e de prazo (idempotente) para PDIs vigentes
  registerEduJob('governanca.pdi', async () => {
    const lim = new Date(Date.now() + 14 * DAY)
    const metas = await prisma.govPdiMeta.findMany({ where: { proximaColetaEm: { lte: lim }, objetivo: { eixo: { pdi: { status: 'VIGENTE' } } } }, take: 1000 })
    for (const m of metas) await scheduleColeta(m)
    const acoes = await prisma.govPdiAcao.findMany({ where: { status: { in: ['PLANEJADA', 'EM_ANDAMENTO'] }, prazo: { lte: new Date(Date.now() + 30 * DAY) }, meta: { objetivo: { eixo: { pdi: { status: 'VIGENTE' } } } } }, take: 1000 })
    for (const a of acoes) await scheduleAcao(a)
    return { metas: metas.length, acoes: acoes.length }
  })

  // Mandatos (CPA e colegiados) que vencem em 60 dias ou já venceram
  registerEduJob('governanca.mandatos', async () => {
    const lim = new Date(Date.now() + 60 * DAY)
    const cpa = await prisma.govCpaMembro.findMany({ where: { ativo: true, fimMandato: { lte: lim } }, take: 1000 })
    for (const m of cpa) await ensureReminder({ tenantId: m.tenantId, modulo: MOD, titulo: `Mandato na CPA ${m.fimMandato < new Date() ? 'VENCIDO' : 'vence'}: ${m.nome}`, dueAt: m.fimMandato, antecedenciaDias: 60, refType: 'GovCpaMembro', refId: m.id, assigneeRole: 'COORDINATOR', severity: 'ATENCAO', dedupeKey: `gov:cpa:mandato:${m.id}:${m.fimMandato.toISOString().slice(0, 10)}` })
    const org = await prisma.govOrgaoMembro.findMany({ where: { ativo: true, fimMandato: { lte: lim } }, take: 1000 })
    for (const m of org) await ensureReminder({ tenantId: m.tenantId, modulo: MOD, titulo: `Mandato em colegiado ${m.fimMandato < new Date() ? 'VENCIDO' : 'vence'}: ${m.nome}`, dueAt: m.fimMandato, antecedenciaDias: 60, refType: 'GovOrgaoMembro', refId: m.id, assigneeRole: 'SECRETARY', severity: 'ATENCAO', dedupeKey: `gov:orgao:mandato:${m.id}:${m.fimMandato.toISOString().slice(0, 10)}` })
    return { cpa: cpa.length, colegiados: org.length }
  })

  // CPA: coleta com prazo vencido sem avanço de fase
  registerEduJob('governanca.cpa', async () => {
    const ciclos = await prisma.govCpaCiclo.findMany({ where: { status: 'COLETA', fim: { lt: new Date() } } })
    for (const c of ciclos) await ensureReminder({ tenantId: c.tenantId, modulo: MOD, titulo: `Coleta da CPA terminou: avance o ciclo "${c.titulo}" para análise`, dueAt: c.fim, refType: 'GovCpaCiclo', refId: c.id, assigneeRole: 'COORDINATOR', severity: 'CRITICO', dedupeKey: `gov:cpa:fimcoleta:${c.id}` })
    return { ciclosEncerradosSemAvanco: ciclos.length }
  })

  // NDE: reverifica conformidade de todos os NDEs ativos
  registerEduJob('governanca.nde', async () => {
    const ndes = await prisma.govNde.findMany({ where: { ativo: true }, select: { id: true, tenantId: true }, take: 2000 })
    let naoConformes = 0
    for (const n of ndes) { const r = await verificarNde(n.tenantId, n.id); if (r && !r.conforme) naoConformes++ }
    return { verificados: ndes.length, naoConformes }
  })

  // CIPA: reuniões mensais e fim de gestão
  registerEduJob('governanca.cipa', async () => {
    const gestoes = await prisma.govCipaGestao.findMany({ where: { status: 'VIGENTE' } })
    let atrasos = 0
    for (const g of gestoes) { const r = await garantirReunioesCipa(g); atrasos += r.faltantes.length }
    const encerradas = await prisma.govCipaGestao.updateMany({ where: { status: 'VIGENTE', fim: { lt: new Date(Date.now() - 30 * DAY) } }, data: { status: 'ENCERRADA' } })
    return { gestoes: gestoes.length, reunioesAtrasadas: atrasos, gestoesEncerradasAuto: encerradas.count }
  })

  registerEduJob('governanca.carreira', () => varrerElegibilidade())
}
