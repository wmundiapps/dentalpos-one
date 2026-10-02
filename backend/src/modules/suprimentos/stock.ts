import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { prisma } from '../../lib/prisma'
import { scheduleReminder, cancelReminders } from '../core/reminders'
import { aplicarMovimento, formatarNumero, selecionarLotesFEFO, round2, round3 } from './logic'

export type Tx = Prisma.TransactionClient

export interface MovParams {
  tenantId: string
  tipo: 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA' | 'AJUSTE' | 'PERDA' | 'DEVOLUCAO'
  itemId: string
  almoxarifadoId: string
  almoxarifadoDestinoId?: string
  quantidade: number
  sentido?: 1 | -1            // apenas AJUSTE
  custoUnitario?: number      // entradas/devoluções; saídas usam o custo médio
  loteNumero?: string
  validade?: Date | null
  origemTipo?: string
  origemId?: string
  cursoId?: string
  laboratorioId?: string
  centroCustoId?: string
  classSectionId?: string
  motivo?: string
  userId?: string
}

// Próximo número sequencial (REQ-2026-0001) — atômico dentro da transação.
export async function proximoNumero(tx: Tx, tenantId: string, prefixo: string) {
  const ano = new Date().getFullYear()
  const chave = `${prefixo}-${ano}`
  const seq = await tx.supSequencia.upsert({
    where: { tenantId_chave: { tenantId, chave } },
    create: { tenantId, chave, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  })
  return formatarNumero(prefixo, ano, seq.ultimo)
}

// Aplica (+/-) ao saldo de um almoxarifado com bloqueio PESSIMISTA da linha do saldo
// (SELECT ... FOR UPDATE): movimentações concorrentes no mesmo item/almoxarifado são serializadas
// e cada uma enxerga o saldo já confirmado pela anterior (sem 409 espúrio nem saldo negativo).
async function mexerSaldo(tx: Tx, p: { tenantId: string; almoxarifadoId: string; itemId: string; sentido: 1 | -1; quantidade: number; custoEntrada?: number }) {
  // INSERT ... ON CONFLICT DO NOTHING (o upsert do Prisma pode disputar a criação e abortar a transação).
  await tx.$executeRaw`INSERT INTO "SupSaldo" ("id", "tenantId", "almoxarifadoId", "itemId", "quantidade", "custoMedio", "updatedAt") VALUES (${randomUUID()}, ${p.tenantId}, ${p.almoxarifadoId}, ${p.itemId}, 0, 0, NOW()) ON CONFLICT ("almoxarifadoId", "itemId") DO NOTHING`
  const locked = await tx.$queryRaw<Array<{ id: string; quantidade: number; custoMedio: number }>>`SELECT "id", "quantidade", "custoMedio" FROM "SupSaldo" WHERE "almoxarifadoId" = ${p.almoxarifadoId} AND "itemId" = ${p.itemId} FOR UPDATE`
  const atual = locked[0]
  const r = aplicarMovimento(atual.quantidade, atual.custoMedio, p.sentido, p.quantidade, p.custoEntrada)
  await tx.supSaldo.update({ where: { id: atual.id }, data: { quantidade: r.saldo, custoMedio: r.custoMedio, ultimaMovimentacao: new Date() } })
  return r
}

async function recalcularCustoGlobal(tx: Tx, tenantId: string, itemId: string) {
  const saldos = await tx.supSaldo.findMany({ where: { tenantId, itemId, quantidade: { gt: 0 } } })
  const q = saldos.reduce((s, x) => s + x.quantidade, 0)
  if (q <= 0) return
  const custo = saldos.reduce((s, x) => s + x.quantidade * x.custoMedio, 0) / q
  await tx.supItem.update({ where: { id: itemId }, data: { custoMedio: Math.round(custo * 10000) / 10000 } })
}

async function mexerLote(tx: Tx, p: { tenantId: string; almoxarifadoId: string; itemId: string; numero: string; validade?: Date | null; delta: number }) {
  const l = await tx.supLote.findUnique({ where: { almoxarifadoId_itemId_numero: { almoxarifadoId: p.almoxarifadoId, itemId: p.itemId, numero: p.numero } } })
  if (!l) {
    if (p.delta < 0) throw Object.assign(new Error(`Lote ${p.numero} inexistente neste almoxarifado.`), { status: 409 })
    return tx.supLote.create({ data: { tenantId: p.tenantId, almoxarifadoId: p.almoxarifadoId, itemId: p.itemId, numero: p.numero, validade: p.validade ?? null, quantidade: p.delta } })
  }
  if (l.quantidade + p.delta < -1e-9) throw Object.assign(new Error(`Saldo insuficiente no lote ${p.numero}.`), { status: 409 })
  return tx.supLote.update({ where: { id: l.id }, data: { quantidade: round3(l.quantidade + p.delta), ...(p.validade && !l.validade ? { validade: p.validade } : {}) } })
}

// Movimentação dentro de uma transação existente. Retorna as movimentações criadas.
export async function movimentarTx(tx: Tx, p: MovParams) {
  if (!(p.quantidade > 0)) throw Object.assign(new Error('Quantidade deve ser maior que zero.'), { status: 400 })
  const item = await tx.supItem.findFirst({ where: { id: p.itemId, tenantId: p.tenantId } })
  if (!item) throw Object.assign(new Error('Item não encontrado.'), { status: 404 })
  const alm = await tx.supAlmoxarifado.findFirst({ where: { id: p.almoxarifadoId, tenantId: p.tenantId, ativo: true } })
  if (!alm) throw Object.assign(new Error('Almoxarifado não encontrado ou inativo.'), { status: 404 })
  if (p.tipo === 'TRANSFERENCIA') {
    if (!p.almoxarifadoDestinoId) throw Object.assign(new Error('Informe o almoxarifado de destino.'), { status: 400 })
    if (p.almoxarifadoDestinoId === p.almoxarifadoId) throw Object.assign(new Error('Origem e destino devem ser diferentes.'), { status: 400 })
    const dest = await tx.supAlmoxarifado.findFirst({ where: { id: p.almoxarifadoDestinoId, tenantId: p.tenantId, ativo: true } })
    if (!dest) throw Object.assign(new Error('Almoxarifado de destino não encontrado ou inativo.'), { status: 404 })
  }

  const sentido: 1 | -1 = p.tipo === 'ENTRADA' || p.tipo === 'DEVOLUCAO' ? 1 : p.tipo === 'AJUSTE' ? p.sentido ?? 1 : -1
  const base = {
    tenantId: p.tenantId, tipo: p.tipo, itemId: p.itemId, almoxarifadoId: p.almoxarifadoId,
    almoxarifadoDestinoId: p.almoxarifadoDestinoId, origemTipo: p.origemTipo, origemId: p.origemId,
    cursoId: p.cursoId, laboratorioId: p.laboratorioId, centroCustoId: p.centroCustoId, classSectionId: p.classSectionId,
    motivo: p.motivo, userId: p.userId, sentido,
  }
  const criadas: any[] = []

  if (sentido === 1) {
    // Lote obrigatório só na ENTRADA de compra/manual; devoluções e ajustes positivos entram como saldo sem lote.
    if (item.controlaLote && !p.loteNumero && p.tipo === 'ENTRADA') throw Object.assign(new Error(`O item ${item.codigo} controla lote: informe o número do lote.`), { status: 400 })
    if (item.controlaValidade && !p.validade && p.tipo === 'ENTRADA') throw Object.assign(new Error(`O item ${item.codigo} controla validade: informe a data de validade.`), { status: 400 })
    const cu = p.custoUnitario ?? item.precoReferencia ?? item.custoMedio
    const r = await mexerSaldo(tx, { tenantId: p.tenantId, almoxarifadoId: p.almoxarifadoId, itemId: p.itemId, sentido: 1, quantidade: p.quantidade, custoEntrada: cu })
    let loteId: string | undefined
    if (p.loteNumero) loteId = (await mexerLote(tx, { tenantId: p.tenantId, almoxarifadoId: p.almoxarifadoId, itemId: p.itemId, numero: p.loteNumero, validade: p.validade, delta: p.quantidade })).id
    criadas.push(await tx.supMovimentacao.create({ data: { ...base, quantidade: p.quantidade, custoUnitario: r.custoUnitario, valorTotal: r.valorTotal, saldoApos: r.saldo, custoMedioApos: r.custoMedio, loteId, loteNumero: p.loteNumero } }))
    await recalcularCustoGlobal(tx, p.tenantId, p.itemId)
    return criadas
  }

  // Saída (SAIDA, PERDA, AJUSTE -, TRANSFERENCIA origem)
  let partes: Array<{ numero?: string; loteId?: string; quantidade: number }> = [{ numero: p.loteNumero, quantidade: p.quantidade }]
  if (item.controlaLote && !p.loteNumero) {
    const lotes = await tx.supLote.findMany({ where: { tenantId: p.tenantId, almoxarifadoId: p.almoxarifadoId, itemId: p.itemId, quantidade: { gt: 0 } } })
    const { selecao, faltante } = selecionarLotesFEFO(lotes, p.quantidade)
    partes = selecao.map((s) => ({ numero: s.numero, loteId: s.loteId, quantidade: s.quantidade }))
    if (faltante > 0) partes.push({ quantidade: faltante }) // saldo legado sem lote (ainda protegido pela checagem de saldo)
  }
  const saldoOrigem = await tx.supSaldo.findUnique({ where: { almoxarifadoId_itemId: { almoxarifadoId: p.almoxarifadoId, itemId: p.itemId } } })
  const custoSaida = saldoOrigem?.custoMedio ?? 0
  for (const parte of partes) {
    const r = await mexerSaldo(tx, { tenantId: p.tenantId, almoxarifadoId: p.almoxarifadoId, itemId: p.itemId, sentido: -1, quantidade: parte.quantidade })
    if (parte.numero) await mexerLote(tx, { tenantId: p.tenantId, almoxarifadoId: p.almoxarifadoId, itemId: p.itemId, numero: parte.numero, delta: -parte.quantidade })
    criadas.push(await tx.supMovimentacao.create({ data: { ...base, quantidade: parte.quantidade, custoUnitario: r.custoUnitario, valorTotal: r.valorTotal, saldoApos: r.saldo, custoMedioApos: r.custoMedio, loteId: parte.loteId, loteNumero: parte.numero } }))
    if (p.tipo === 'TRANSFERENCIA' && p.almoxarifadoDestinoId) {
      let validade: Date | null = null
      if (parte.numero) validade = (await tx.supLote.findUnique({ where: { almoxarifadoId_itemId_numero: { almoxarifadoId: p.almoxarifadoId, itemId: p.itemId, numero: parte.numero } } }))?.validade ?? null
      const rd = await mexerSaldo(tx, { tenantId: p.tenantId, almoxarifadoId: p.almoxarifadoDestinoId, itemId: p.itemId, sentido: 1, quantidade: parte.quantidade, custoEntrada: custoSaida })
      if (parte.numero) await mexerLote(tx, { tenantId: p.tenantId, almoxarifadoId: p.almoxarifadoDestinoId, itemId: p.itemId, numero: parte.numero, validade, delta: parte.quantidade })
      criadas.push(await tx.supMovimentacao.create({ data: { ...base, tipo: 'ENTRADA', almoxarifadoId: p.almoxarifadoDestinoId, almoxarifadoDestinoId: p.almoxarifadoId, sentido: 1, quantidade: parte.quantidade, custoUnitario: rd.custoUnitario, valorTotal: rd.valorTotal, saldoApos: rd.saldo, custoMedioApos: rd.custoMedio, loteNumero: parte.numero, motivo: `Transferência de ${alm.nome}${p.motivo ? ' — ' + p.motivo : ''}` } }))
    }
  }
  if (p.tipo === 'TRANSFERENCIA') await recalcularCustoGlobal(tx, p.tenantId, p.itemId)
  return criadas
}

// Movimentação em transação própria + verificação de estoque mínimo.
export async function movimentar(p: MovParams) {
  const mov = await prisma.$transaction((tx) => movimentarTx(tx, p), { timeout: 20_000 })
  await checarEstoqueMinimo(p.tenantId, [p.itemId]).catch((e) => console.error('[sup-minimo]', e))
  return mov
}

// Cria/atualiza ou cancela o lembrete de reposição conforme o saldo total do item vs mínimo.
export async function checarEstoqueMinimo(tenantId: string, itemIds: string[]) {
  for (const itemId of [...new Set(itemIds)]) {
    const item = await prisma.supItem.findFirst({ where: { id: itemId, tenantId, ativo: true } })
    if (!item) continue
    const agg = await prisma.supSaldo.aggregate({ where: { tenantId, itemId }, _sum: { quantidade: true } })
    const total = round3(agg._sum.quantidade ?? 0)
    const refType = 'SupItem'
    if (item.estoqueMinimo > 0 && total <= item.estoqueMinimo) {
      await scheduleReminder({
        tenantId, modulo: 'suprimentos', refType, refId: item.id, dedupeKey: `sup-minimo-${item.id}`,
        titulo: `Estoque no mínimo: ${item.nome}`,
        descricao: `Saldo ${total} ${item.unidade} (mínimo ${item.estoqueMinimo}). Gere uma requisição de compra.`,
        dueAt: new Date(Date.now() + Math.max(item.leadTimeDias, 1) * 86_400_000),
        remindAt: new Date(), severity: total <= 0 ? 'CRITICO' : 'ATENCAO', assigneeRole: 'SUPPLIES',
      })
    } else {
      await cancelReminders({ tenantId, refType, refId: item.id })
      // Remove o lembrete encerrado (CANCELADO/CONCLUIDO): o upsert por dedupeKey não reabre lembretes finalizados,
      // então sem isto uma nova queda abaixo do mínimo nunca voltaria a alertar.
      await prisma.eduReminder.deleteMany({ where: { tenantId, dedupeKey: `sup-minimo-${item.id}`, status: { in: ['CANCELADO', 'CONCLUIDO'] } } })
    }
  }
}

export async function saldoTotalItem(tenantId: string, itemId: string) {
  const agg = await prisma.supSaldo.aggregate({ where: { tenantId, itemId }, _sum: { quantidade: true } })
  return round3(agg._sum.quantidade ?? 0)
}

export { round2 }
