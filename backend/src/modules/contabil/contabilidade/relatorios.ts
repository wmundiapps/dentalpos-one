import { prisma } from '../nucleo/db'
import { r2, somaMeses, inicioCompetencia, fimCompetencia, nomeMes } from '../nucleo/util'

// Balancete de verificação e DRE a partir das partidas dobradas. Sinal interno: net = débitos − créditos.

type Net = { d: number; c: number }
const zero = (): Net => ({ d: 0, c: 0 })

async function partidas(tenantId: string, empresaId: string, de: Date, ate: Date) {
  return prisma.ctbPartida.findMany({ where: { tenantId, empresaId, data: { gte: de, lte: ate } }, select: { contaCodigo: true, tipo: true, valor: true, data: true } })
}
function agrupar(rows: Array<{ contaCodigo: string; tipo: string; valor: number }>) {
  const m = new Map<string, Net>()
  for (const r of rows) { const x = m.get(r.contaCodigo) ?? zero(); if (r.tipo === 'D') x.d += r.valor; else x.c += r.valor; m.set(r.contaCodigo, x) }
  return m
}
const filhosDe = (codigo: string) => (c: string) => c === codigo || c.startsWith(codigo + '.')
const soma = (m: Map<string, Net>, prefixo: string) => { const f = filhosDe(prefixo); let d = 0, c = 0; for (const [k, v] of m) if (f(k)) { d += v.d; c += v.c } return { d, c } }

export interface LinhaBalancete { codigo: string; nome: string; tipo: string; natureza: string; analitica: boolean; nivel: number; saldoAnterior: number; debitos: number; creditos: number; saldoAtual: number }

export async function balancete(tenantId: string, empresaId: string, de: Date, ate: Date, todas = false) {
  const plano = await prisma.ctbPlanoConta.findMany({ where: { tenantId, empresaId }, orderBy: { codigo: 'asc' } })
  const inicioAno = new Date(Date.UTC(de.getUTCFullYear(), 0, 1))
  // Saldo anterior: contas patrimoniais desde o início; contas de resultado só dentro do ano do período (zeram em janeiro).
  const [ant, per] = await Promise.all([
    prisma.ctbPartida.findMany({ where: { tenantId, empresaId, data: { lt: de } }, select: { contaCodigo: true, tipo: true, valor: true, data: true } }),
    partidas(tenantId, empresaId, de, ate),
  ])
  const tipoDe = new Map(plano.map((p) => [p.codigo, p.tipo]))
  const antMap = agrupar(ant.filter((r) => { const t = tipoDe.get(r.contaCodigo); return t === 'RECEITA' || t === 'CUSTO' || t === 'DESPESA' ? r.data >= inicioAno : true }))
  const perMap = agrupar(per)
  const linhas: LinhaBalancete[] = []
  for (const p of plano) {
    const a = soma(antMap, p.codigo), m = soma(perMap, p.codigo)
    const netAnt = a.d - a.c, netAtual = netAnt + m.d - m.c
    const sg = p.natureza === 'D' ? 1 : -1
    const l: LinhaBalancete = { codigo: p.codigo, nome: p.nome, tipo: p.tipo, natureza: p.natureza, analitica: p.analitica, nivel: p.codigo.split('.').length, saldoAnterior: r2(netAnt * sg), debitos: r2(m.d), creditos: r2(m.c), saldoAtual: r2(netAtual * sg) }
    if (todas || l.saldoAnterior !== 0 || l.debitos !== 0 || l.creditos !== 0 || l.saldoAtual !== 0) linhas.push(l)
  }
  const totalD = r2([...perMap.values()].reduce((a, v) => a + v.d, 0)), totalC = r2([...perMap.values()].reduce((a, v) => a + v.c, 0))
  return { periodo: { de: de.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10) }, linhas, totais: { debitos: totalD, creditos: totalC, equilibrado: Math.abs(totalD - totalC) < 0.01 } }
}

// ---------------- DRE ----------------
export interface LinhaDre { chave: string; nome: string; nivel: 0 | 1 | 2; tipo: 'valor' | 'subtotal' | 'total' | 'percentual'; valores: number[] }

interface Estrutura { detalhe: Array<{ codigo: string; nome: string }>; }
const rec = (m: Map<string, Net>, p: string) => { const s = soma(m, p); return s.c - s.d }
const des = (m: Map<string, Net>, p: string) => { const s = soma(m, p); return s.d - s.c }

/** Valores da DRE (um mapa de contas por coluna). */
function montarDre(cols: Array<Map<string, Net>>, detalhes: { receitas: Estrutura['detalhe']; custos: Estrutura['detalhe']; despesas: Estrutura['detalhe'] }): LinhaDre[] {
  const L: LinhaDre[] = []
  const linha = (chave: string, nome: string, nivel: 0 | 1 | 2, tipo: LinhaDre['tipo'], fn: (m: Map<string, Net>, i: number) => number) => L.push({ chave, nome, nivel, tipo, valores: cols.map((m, i) => r2(fn(m, i))) })
  const v = (chave: string) => (i: number) => L.find((x) => x.chave === chave)!.valores[i]
  linha('receitaBruta', '(+) Receita bruta', 0, 'subtotal', (m) => rec(m, '3.1'))
  for (const d of detalhes.receitas) linha('r_' + d.codigo, d.nome, 2, 'valor', (m) => rec(m, d.codigo))
  linha('deducoes', '(−) Deduções (impostos sobre vendas/serviços, devoluções)', 0, 'valor', (m) => -des(m, '3.2'))
  linha('receitaLiquida', '(=) Receita líquida', 0, 'subtotal', (m, i) => v('receitaBruta')(i) + v('deducoes')(i))
  linha('custos', '(−) Custos (CMV/CSP)', 0, 'valor', (m) => -des(m, '4'))
  for (const d of detalhes.custos) linha('c_' + d.codigo, d.nome, 2, 'valor', (m) => -des(m, d.codigo))
  linha('lucroBruto', '(=) Lucro bruto', 0, 'subtotal', (m, i) => v('receitaLiquida')(i) + v('custos')(i))
  linha('despesasOperacionais', '(−) Despesas operacionais', 0, 'valor', (m) => -des(m, '5.1'))
  for (const d of detalhes.despesas) linha('d_' + d.codigo, d.nome, 2, 'valor', (m) => -des(m, d.codigo))
  linha('resultadoOperacional', '(=) Resultado operacional', 0, 'subtotal', (m, i) => v('lucroBruto')(i) + v('despesasOperacionais')(i))
  linha('receitasFinanceiras', '(+) Receitas financeiras', 1, 'valor', (m) => rec(m, '5.2.2'))
  linha('despesasFinanceiras', '(−) Despesas financeiras', 1, 'valor', (m) => -des(m, '5.2.1'))
  linha('resultadoAntesIr', '(=) Resultado antes do IRPJ/CSLL', 0, 'subtotal', (m, i) => v('resultadoOperacional')(i) + v('receitasFinanceiras')(i) + v('despesasFinanceiras')(i))
  linha('irCsll', '(−) IRPJ e CSLL', 1, 'valor', (m) => -des(m, '5.9'))
  linha('resultadoLiquido', '(=) Resultado líquido do período', 0, 'total', (m, i) => v('resultadoAntesIr')(i) + v('irCsll')(i))
  linha('margemLiquida', 'Margem líquida (% da receita bruta)', 0, 'percentual', (m, i) => (v('receitaBruta')(i) ? (v('resultadoLiquido')(i) / v('receitaBruta')(i)) * 100 : 0))
  return L
}

export interface OpcoesDre { de: Date; ate: Date; modo: 'periodo' | 'mensal'; comparar?: 'anterior' | 'ano' | null }

export async function dre(tenantId: string, empresaId: string, o: OpcoesDre) {
  const plano = await prisma.ctbPlanoConta.findMany({ where: { tenantId, empresaId, analitica: true }, orderBy: { codigo: 'asc' } })
  const detalhes = {
    receitas: plano.filter((p) => p.codigo.startsWith('3.1')).map((p) => ({ codigo: p.codigo, nome: p.nome })),
    custos: plano.filter((p) => p.codigo.startsWith('4.')).map((p) => ({ codigo: p.codigo, nome: p.nome })),
    despesas: plano.filter((p) => p.codigo.startsWith('5.1')).map((p) => ({ codigo: p.codigo, nome: p.nome })),
  }
  const colunas: Array<{ rotulo: string; de: Date; ate: Date }> = []
  if (o.modo === 'mensal') {
    let c = o.de.toISOString().slice(0, 7)
    const fim = o.ate.toISOString().slice(0, 7)
    for (let i = 0; i < 24 && c <= fim; i++, c = somaMeses(c, 1)) colunas.push({ rotulo: nomeMes(c), de: inicioCompetencia(c), ate: fimCompetencia(c) })
  } else colunas.push({ rotulo: 'Período', de: o.de, ate: o.ate })
  const buscar = async (de: Date, ate: Date) => partidas(tenantId, empresaId, de, ate)
  const todas = await buscar(colunas[0].de, colunas[colunas.length - 1].ate)
  const cols = colunas.map((c) => agrupar(todas.filter((r) => r.data >= c.de && r.data <= c.ate)))
  const linhas = montarDre(cols, detalhes)
  let comparativo: { rotulo: string; periodo: { de: string; ate: string }; linhas: LinhaDre[]; variacao: Array<{ chave: string; absoluta: number[]; percentual: Array<number | null> }> } | null = null
  if (o.comparar && o.modo === 'periodo') {
    const dur = o.ate.getTime() - o.de.getTime() + 1
    const de2 = o.comparar === 'ano' ? new Date(Date.UTC(o.de.getUTCFullYear() - 1, o.de.getUTCMonth(), o.de.getUTCDate())) : new Date(o.de.getTime() - dur)
    const ate2 = o.comparar === 'ano' ? new Date(Date.UTC(o.ate.getUTCFullYear() - 1, o.ate.getUTCMonth(), o.ate.getUTCDate(), 23, 59, 59, 999)) : new Date(o.de.getTime() - 1)
    const lin2 = montarDre([agrupar(await buscar(de2, ate2))], detalhes)
    comparativo = {
      rotulo: o.comparar === 'ano' ? 'Mesmo período do ano anterior' : 'Período anterior', periodo: { de: de2.toISOString().slice(0, 10), ate: ate2.toISOString().slice(0, 10) }, linhas: lin2,
      variacao: linhas.map((l, i) => { const a = l.valores[0] - lin2[i].valores[0]; return { chave: l.chave, absoluta: [r2(a)], percentual: [lin2[i].valores[0] !== 0 && l.tipo !== 'percentual' ? r2((a / Math.abs(lin2[i].valores[0])) * 100) : null] } }),
    }
  }
  return { periodo: { de: o.de.toISOString().slice(0, 10), ate: o.ate.toISOString().slice(0, 10) }, modo: o.modo, colunas: colunas.map((c) => c.rotulo), linhas, comparativo }
}

export function csv(linhas: string[][]) {
  const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n')
}
