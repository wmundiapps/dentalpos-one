import { prisma } from '../../lib/prisma'
import { scheduleReminder } from '../core/reminders'
import { minToHhmm, saldoBanco } from './calculo'
import { HR } from './common'
import { bancoRows } from './ponto'

/** Avisa o RH sobre créditos do banco de horas vencidos ou a vencer em 30 dias. */
export async function jobBanco() {
  const cols = await prisma.rheColaborador.findMany({ where: { status: { in: ['ATIVO', 'AFASTADO', 'FERIAS'] } }, select: { id: true, tenantId: true, nome: true } })
  let avisos = 0
  for (const c of cols) {
    const s = saldoBanco(await bancoRows(c.tenantId, c.id))
    if (s.vencidoMin > 0 || s.aVencerMin > 0) {
      await scheduleReminder({ tenantId: c.tenantId, modulo: 'rh', titulo: `Banco de horas: ${c.nome} - vencido ${minToHhmm(s.vencidoMin)}, a vencer ${minToHhmm(s.aVencerMin)}`, dueAt: new Date(Date.now() + 7 * 86400000), assigneeRole: HR as string, refType: 'RheColaborador', refId: c.id, severity: s.vencidoMin > 0 ? 'CRITICO' : 'ATENCAO', dedupeKey: `rhe-banco-${c.id}` })
      avisos++
    }
  }
  return { avisos }
}
