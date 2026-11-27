import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { carregarPoliticas, montarCarteira, politicaPara, sincronizarCasos } from './carteira'
import { diaBRT, DIA_MS, round2 } from './calculo'
import { httpErr } from './util'

export const PRAZO_MAX_PROMESSA_DIAS = 45

export async function registrarPromessa(tenantId: string, p: { studentId: string; valor: number; dataPrometida: Date; receivableId?: string; canal?: string; observacao?: string; usuarioId?: string; now?: Date }) {
  const now = p.now ?? new Date()
  if (!(p.valor > 0)) throw httpErr(400, 'Valor da promessa inválido.')
  const dias = diaBRT(p.dataPrometida) - diaBRT(now)
  if (dias < 0) throw httpErr(422, 'A data prometida não pode estar no passado.')
  if (dias > PRAZO_MAX_PROMESSA_DIAS) throw httpErr(422, `Promessa além de ${PRAZO_MAX_PROMESSA_DIAS} dias: formalize um acordo.`)
  const cart = await montarCarteira(tenantId, now, { studentId: p.studentId })
  const linha = cart.linhas.find((l) => l.studentId === p.studentId)
  if (!linha || linha.titulosVencidos === 0) throw httpErr(422, 'O aluno não tem débito vencido em aberto.')
  if (p.receivableId && !(cart.titulos.get(p.studentId) ?? []).some((t) => t.id === p.receivableId && !t.emAcordo)) throw httpErr(422, 'Título informado não está em aberto para este aluno.')
  await sincronizarCasos(tenantId, cart, now)
  const caso = await prisma.cobCaso.findFirstOrThrow({ where: { tenantId, studentId: p.studentId } })
  const pol = politicaPara(cart.politicas, linha.segmento)
  // só uma promessa aberta por caso: a anterior é substituída
  await prisma.cobPromessa.updateMany({ where: { tenantId, casoId: caso.id, status: 'ABERTA' }, data: { status: 'CANCELADA', resolvidaEm: now, observacao: 'Substituída por nova promessa' } })
  const pr = await prisma.cobPromessa.create({ data: { tenantId, casoId: caso.id, studentId: p.studentId, receivableId: p.receivableId, valor: round2(p.valor), dataPrometida: p.dataPrometida, canal: p.canal, observacao: p.observacao, registradaPorId: p.usuarioId } })
  if (caso.status === 'EM_COBRANCA' && pol.pausaComPromessa) await prisma.cobCaso.update({ where: { id: caso.id }, data: { status: 'PROMESSA' } })
  await prisma.cobContato.create({ data: { tenantId, casoId: caso.id, studentId: p.studentId, tipo: 'NOTA', direcao: 'ENTRADA', canal: p.canal || 'SISTEMA', resultado: 'PROMESSA', observacao: `Promessa de pagamento de ${round2(p.valor).toFixed(2)} para ${p.dataPrometida.toISOString().slice(0, 10)}${p.observacao ? ' — ' + p.observacao : ''}`, usuarioId: p.usuarioId, baseLegal: pol.baseLegal } })
  await audit({ tenantId, userId: p.usuarioId, modulo: 'cobranca', acao: 'PROMESSA_REGISTRADA', refType: 'CobPromessa', refId: pr.id, detalhes: { valor: pr.valor, data: p.dataPrometida } })
  return pr
}

export async function resolverPromessa(tenantId: string, id: string, status: 'CUMPRIDA' | 'QUEBRADA' | 'CANCELADA', usuarioId?: string, now = new Date()) {
  const pr = await prisma.cobPromessa.findFirst({ where: { id, tenantId } })
  if (!pr) throw httpErr(404, 'Promessa não encontrada.')
  if (pr.status !== 'ABERTA') throw httpErr(409, `Promessa já ${pr.status}.`)
  const u = await prisma.cobPromessa.update({ where: { id }, data: { status, resolvidaEm: now } })
  const caso = await prisma.cobCaso.findFirst({ where: { id: pr.casoId, tenantId } })
  if (caso?.status === 'PROMESSA') await prisma.cobCaso.update({ where: { id: caso.id }, data: { status: 'EM_COBRANCA' } })
  await audit({ tenantId, userId: usuarioId, modulo: 'cobranca', acao: `PROMESSA_${status}`, refType: 'CobPromessa', refId: id })
  return u
}

/** Job: promessa vencida (dia seguinte à data prometida sem pagamento) vira QUEBRADA e a régua volta a correr. */
export async function jobPromessas(opts: { tenantId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date()
  const hoje = diaBRT(now)
  const abertas = await prisma.cobPromessa.findMany({ where: { status: 'ABERTA', ...(opts.tenantId ? { tenantId: opts.tenantId } : {}), dataPrometida: { lt: new Date(now.getTime()) } } })
  let quebradas = 0
  for (const pr of abertas) {
    if (diaBRT(pr.dataPrometida) >= hoje) continue // ainda é o dia prometido
    await prisma.cobPromessa.update({ where: { id: pr.id }, data: { status: 'QUEBRADA', resolvidaEm: now } })
    const caso = await prisma.cobCaso.findFirst({ where: { id: pr.casoId, tenantId: pr.tenantId } })
    if (caso?.status === 'PROMESSA') await prisma.cobCaso.update({ where: { id: caso.id }, data: { status: 'EM_COBRANCA' } })
    await prisma.cobContato.create({ data: { tenantId: pr.tenantId, casoId: pr.casoId, studentId: pr.studentId, tipo: 'NOTA', direcao: 'ENTRADA', canal: 'SISTEMA', resultado: 'REGISTRADO', observacao: `Promessa de ${pr.valor.toFixed(2)} para ${pr.dataPrometida.toISOString().slice(0, 10)} não cumprida.` } })
    quebradas++
  }
  return { quebradas }
}

export { carregarPoliticas, DIA_MS }
