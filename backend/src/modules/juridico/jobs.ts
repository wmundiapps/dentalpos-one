import { prisma } from '../../lib/prisma'
import { registerEduJob } from '../core/jobs'
import { agendarVencimento } from './common'
import { lembreteDocumento } from './documentos'
import { lembreteContrato } from './contratos'
import { lembreteLocacao } from './imoveis'
import { lembretePolo } from './polos'
import { lembretePrazo, lembreteAudiencia } from './processos'
import { lembreteSeguro } from './riscos'
import { lembretePlano } from './inteligencia'
import { DAY } from './logic'

// Reavalia diariamente (cron /api/cron/edu) os lembretes de vencimento 30/60/90, prazos fatais e audiências. Idempotente (dedupeKey).
export function registerJurJobs() {
  registerEduJob('juridico.vencimentos', async () => {
    const lim = new Date(Date.now() + 91 * DAY)
    const base = { status: 'VIGENTE', vigenciaFim: { lte: lim } }
    const docs = await prisma.jurDocumento.findMany({ where: base, take: 2000 })
    for (const d of docs) await lembreteDocumento(d)
    const ctr = await prisma.jurContrato.findMany({ where: base, take: 2000 })
    for (const c of ctr) await lembreteContrato(c)
    const loc = await prisma.jurLocacao.findMany({ where: base, take: 2000 })
    for (const l of loc) await lembreteLocacao(l)
    const pol = await prisma.jurContratoPolo.findMany({ where: base, take: 2000 })
    for (const p of pol) await lembretePolo(p)
    const seg = await prisma.jurSeguro.findMany({ where: base, take: 2000 })
    for (const s of seg) await lembreteSeguro(s)
    return { documentos: docs.length, contratos: ctr.length, locacoes: loc.length, polos: pol.length, seguros: seg.length }
  })

  registerEduJob('juridico.prazos', async () => {
    const lim = new Date(Date.now() + 15 * DAY)
    const prazos = await prisma.jurPrazo.findMany({ where: { status: 'ABERTO', dataFatal: { lte: lim } }, include: { processo: { select: { numeroCnj: true } } }, take: 5000 })
    for (const p of prazos) await lembretePrazo(p, p.processo)
    const aud = await prisma.jurAudiencia.findMany({ where: { status: 'AGENDADA', dataHora: { lte: lim } }, include: { processo: { select: { numeroCnj: true } } }, take: 5000 })
    for (const a of aud) await lembreteAudiencia(a, a.processo)
    // parcelas de aluguel: aviso 5 dias antes e no vencimento
    const parc = await prisma.jurParcela.findMany({ where: { status: 'ABERTA', vencimento: { lte: new Date(Date.now() + 6 * DAY) } }, include: { locacao: { select: { codigo: true, natureza: true } } }, take: 5000 })
    for (const p of parc.filter((x) => x.locacao.natureza === 'LOCACAO_PAGA')) {
      await agendarVencimento({ tenantId: p.tenantId, refType: 'JurParcela', refId: p.id, tag: 'parcela', titulo: `Aluguel ${p.competencia} (locação ${p.locacao.codigo}) R$ ${p.valor.toFixed(2).replace('.', ',')}`, due: p.vencimento, limites: [5, 1], assigneeRole: 'FINANCE' })
    }
    const planos = await prisma.jurPlanoPrevencao.findMany({ where: { status: { in: ['PLANEJADO', 'EM_ANDAMENTO'] }, prazo: { lte: new Date(Date.now() + 31 * DAY) } }, take: 2000 })
    for (const p of planos) await lembretePlano(p)
    return { prazos: prazos.length, audiencias: aud.length, parcelas: parc.length, planos: planos.length }
  })
}
