import { createHash } from 'crypto'
import { r2 } from '../nucleo/util'

// Leitura de extratos (OFX e CSV) e sugestão de pareamento com títulos. 100% local: nada é buscado em banco algum.

export interface LinhaExtrato { data: Date; descricao: string; valor: number; fitid: string }
export const MAX_LINHAS = 5000

const parseData = (s: string): Date | null => {
  const t = s.trim()
  let m = /^(\d{4})(\d{2})(\d{2})(?:\d{6})?(?:\[.*\]|\..*)?$/.exec(t)   // OFX AAAAMMDD[HHMMSS[.xxx][-3:BRT]]
  if (m) return valida(+m[1], +m[2], +m[3])
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)                          // ISO
  if (m) return valida(+m[1], +m[2], +m[3])
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t)                        // BR
  if (m) return valida(+m[3], +m[2], +m[1])
  return null
}
const valida = (a: number, m: number, d: number) => { if (a < 1990 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null; const x = new Date(Date.UTC(a, m - 1, d, 12)); return x.getUTCMonth() === m - 1 ? x : null }

/** Valor em formato brasileiro ("1.234,56", "-12,30") ou internacional ("1234.56"). */
export function parseValor(s: string): number | null {
  let t = s.trim().replace(/\s|R\$/g, '')
  if (!t) return null
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-') || /-$/.test(t)
  t = t.replace(/[()+-]/g, '')
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (t.includes(',')) t = t.replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? r2(neg ? -n : n) : null
}

export function lerOfx(texto: string): { linhas: LinhaExtrato[]; invalidas: number } {
  const linhas: LinhaExtrato[] = []
  let invalidas = 0
  const blocos = texto.split(/<STMTTRN>/i).slice(1)
  const tag = (b: string, t: string) => { const m = new RegExp(`<${t}>([^<\\r\\n]*)`, 'i').exec(b); return m ? m[1].trim() : '' }
  for (const [i, b] of blocos.entries()) {
    if (linhas.length >= MAX_LINHAS) break
    const data = parseData(tag(b, 'DTPOSTED')), valor = parseValor(tag(b, 'TRNAMT'))
    const descricao = (tag(b, 'MEMO') || tag(b, 'NAME') || 'Sem descrição').slice(0, 200)
    if (!data || valor == null || valor === 0) { invalidas++; continue }
    const fitid = tag(b, 'FITID') || hash(`${data.toISOString()}|${valor}|${descricao}|${i}`)
    linhas.push({ data, descricao, valor, fitid: fitid.slice(0, 80) })
  }
  return { linhas, invalidas }
}

export function lerCsv(texto: string): { linhas: LinhaExtrato[]; invalidas: number } {
  const linhasTxt = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!linhasTxt.length) return { linhas: [], invalidas: 0 }
  const sep = (linhasTxt[0].match(/;/g)?.length ?? 0) >= (linhasTxt[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const split = (l: string) => { const out: string[] = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = '' } else cur += ch } out.push(cur); return out.map((x) => x.trim()) }
  const cab = split(linhasTxt[0]).map((x) => x.toLowerCase())
  const temCab = cab.some((x) => /data|date|valor|amount|descri|hist/.test(x))
  let iData = 0, iDesc = 1, iVal = 2
  if (temCab) {
    iData = cab.findIndex((x) => /data|date/.test(x)); iDesc = cab.findIndex((x) => /descri|hist|memo|lan[cç]amento/.test(x)); iVal = cab.findIndex((x) => /valor|amount|value/.test(x))
    if (iData < 0 || iVal < 0) return { linhas: [], invalidas: linhasTxt.length - 1 }
    if (iDesc < 0) iDesc = cab.findIndex((_, i) => i !== iData && i !== iVal)
  }
  const out: LinhaExtrato[] = []
  let invalidas = 0
  for (const [i, l] of linhasTxt.slice(temCab ? 1 : 0).entries()) {
    if (out.length >= MAX_LINHAS) break
    const c = split(l)
    const data = parseData(c[iData] ?? ''), valor = parseValor(c[iVal] ?? '')
    if (!data || valor == null || valor === 0) { invalidas++; continue }
    const descricao = (c[iDesc] || 'Sem descrição').slice(0, 200)
    out.push({ data, descricao, valor, fitid: hash(`${data.toISOString()}|${valor}|${descricao}|${i}`) })
  }
  return { linhas: out, invalidas }
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24)

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ')
const STOP = new Set(['de', 'da', 'do', 'ltda', 'me', 'sa', 'pix', 'ted', 'doc', 'pagamento', 'pagto', 'recebimento', 'transferencia', 'credito', 'debito', 'com', 'para', 'por'])
const tokens = (s: string) => new Set(norm(s).split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)))

export interface SugestaoConciliacao { tituloId: string; score: number; motivos: string[]; descricao: string; parceiroNome: string; valor: number; vencimento: string }

/** Pontua os títulos em aberto contra uma linha do extrato: valor (60), proximidade de data (até 25) e descrição parecida (até 15). */
export function sugerir(linha: { data: Date; descricao: string; valor: number }, titulos: Array<{ id: string; tipo: string; valor: number; vencimento: Date; descricao: string; parceiroNome: string }>): SugestaoConciliacao[] {
  const tipo = linha.valor > 0 ? 'RECEBER' : 'PAGAR'
  const abs = Math.abs(linha.valor)
  const tl = tokens(linha.descricao)
  const out: SugestaoConciliacao[] = []
  for (const t of titulos) {
    if (t.tipo !== tipo) continue
    const motivos: string[] = []
    let score = 0
    if (Math.abs(t.valor - abs) < 0.005) { score += 60; motivos.push('valor idêntico') }
    else if (Math.abs(t.valor - abs) / Math.max(abs, 1) <= 0.02) { score += 25; motivos.push('valor muito próximo (±2%)') }
    else continue
    const dd = Math.abs(Math.round((linha.data.getTime() - t.vencimento.getTime()) / 86_400_000))
    if (dd <= 3) { score += 25; motivos.push(`data a ${dd} dia(s) do vencimento`) } else if (dd <= 10) { score += 15; motivos.push(`data a ${dd} dias do vencimento`) } else if (dd <= 30) { score += 5; motivos.push(`data a ${dd} dias do vencimento`) }
    const tt = new Set([...tokens(t.parceiroNome), ...tokens(t.descricao)])
    const comum = [...tl].filter((x) => tt.has(x))
    if (comum.length) { score += Math.min(15, 8 + comum.length * 3); motivos.push(`descrição parecida (${comum.slice(0, 3).join(', ')})`) }
    out.push({ tituloId: t.id, score, motivos, descricao: t.descricao, parceiroNome: t.parceiroNome, valor: t.valor, vencimento: t.vencimento.toISOString().slice(0, 10) })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3)
}
