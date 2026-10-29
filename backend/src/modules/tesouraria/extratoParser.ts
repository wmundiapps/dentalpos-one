import { createHash } from 'crypto'
import { r2 } from './common'

// ============================================================
// Leitura de extratos bancários: OFX (1.x SGML e 2.x XML) e CSV. Funções puras.
// ============================================================

export interface LinhaExtrato { data: Date; valor: number; descricao: string; documento?: string; tipo?: string }
export interface ExtratoLido {
  formato: 'OFX' | 'CSV'
  linhas: LinhaExtrato[]
  banco?: string
  conta?: string
  inicio?: Date
  fim?: Date
  saldoFinal?: number
  avisos: string[]
}

/** Decodifica o arquivo: tenta UTF-8 e, se houver caracteres inválidos, assume Latin-1 (comum em OFX/CSV de bancos brasileiros). */
export function decodificar(buf: Buffer): string {
  const u = buf.toString('utf8')
  return u.includes('�') ? buf.toString('latin1') : u.replace(/^﻿/, '')
}

export function numeroBR(v: string): number {
  let s = String(v).trim()
  if (!s) return NaN
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (/-\s*$/.test(s)) { neg = true; s = s.replace(/-\s*$/, '') }
  s = s.replace(/R\$|\s/g, '')
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1) } else if (s.startsWith('+')) s = s.slice(1)
  const temVirg = s.includes(','), temPonto = s.includes('.')
  if (temVirg && temPonto) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (temVirg) s = s.replace(',', '.')
  else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')   // 1.234 -> milhar
  const n = Number(s)
  if (!Number.isFinite(n)) return NaN
  return r2(neg ? -n : n)
}

export function dataFlex(v: string): Date | null {
  const s = String(v).trim()
  let m = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12))
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))
  m = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{2})$/)
  if (m) return new Date(Date.UTC(2000 + +m[3], +m[2] - 1, +m[1], 12))
  return null
}

function dataOfx(v: string): Date | null {
  const m = String(v).trim().match(/^(\d{4})(\d{2})(\d{2})/)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : null
}

const tag = (bloco: string, nome: string) => {
  const m = bloco.match(new RegExp(`<${nome}>\\s*([^<\\r\\n]*)`, 'i'))
  return m ? m[1].trim() : undefined
}
const dec = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")

export function parseOfx(texto: string): ExtratoLido {
  const avisos: string[] = []
  const txt = texto.replace(/\r/g, '')
  const blocos = txt.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>|<\/BANKTRANLIST>|<\/STMTRS>|<\/CCSTMTRS>/i)[0])
  if (!blocos.length) throw Object.assign(new Error('Nenhuma transação (STMTTRN) encontrada no OFX.'), { status: 422 })
  const linhas: LinhaExtrato[] = []
  for (const b of blocos) {
    const dt = dataOfx(tag(b, 'DTPOSTED') ?? '')
    const raw = tag(b, 'TRNAMT')
    const valor = raw === undefined ? NaN : numeroBR(raw)
    if (!dt || !Number.isFinite(valor)) { avisos.push(`Transação ignorada (data/valor inválidos): ${b.trim().slice(0, 60)}`); continue }
    const memo = dec([tag(b, 'MEMO'), tag(b, 'NAME')].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()) || tag(b, 'TRNTYPE') || 'SEM DESCRIÇÃO'
    linhas.push({ data: dt, valor, descricao: memo, documento: tag(b, 'FITID') || tag(b, 'CHECKNUM') || tag(b, 'REFNUM'), tipo: tag(b, 'TRNTYPE') })
  }
  const bal = txt.match(/<LEDGERBAL>[\s\S]*?<BALAMT>\s*([^<\r\n]*)/i)
  return {
    formato: 'OFX', linhas, avisos,
    banco: tag(txt, 'BANKID'), conta: tag(txt, 'ACCTID'),
    inicio: dataOfx(tag(txt, 'DTSTART') ?? '') ?? undefined, fim: dataOfx(tag(txt, 'DTEND') ?? '') ?? undefined,
    saldoFinal: bal ? numeroBR(bal[1]) : undefined,
  }
}

function splitCsv(linha: string, sep: string): string[] {
  const out: string[] = []
  let cur = '', aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (aspas) { if (c === '"' && linha[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') aspas = false; else cur += c }
    else if (c === '"') aspas = true
    else if (c === sep) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export function parseCsv(texto: string): ExtratoLido {
  const avisos: string[] = []
  const linhasTxt = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim().length)
  if (linhasTxt.length < 2) throw Object.assign(new Error('CSV vazio ou sem linhas de dados.'), { status: 422 })
  // cabeçalho = primeira linha que contém uma coluna de data e uma de valor
  const sepDe = (l: string) => [';', '\t', ','].map((s) => [s, l.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  let hi = -1
  for (let i = 0; i < Math.min(linhasTxt.length, 15); i++) {
    const cols = splitCsv(linhasTxt[i], sepDe(linhasTxt[i])).map(norm)
    if (cols.some((c) => /^(data|date|dt)/.test(c)) && cols.some((c) => /(valor|amount|credito|debito|entrada|saida)/.test(c))) { hi = i; break }
  }
  if (hi < 0) throw Object.assign(new Error('Cabeçalho do CSV não reconhecido: são necessárias colunas de data e valor (ou crédito/débito).'), { status: 422 })
  const sep = sepDe(linhasTxt[hi])
  const cab = splitCsv(linhasTxt[hi], sep).map(norm)
  const idx = (re: RegExp) => cab.findIndex((c) => re.test(c))
  const iData = idx(/^(data|date|dt)/), iDesc = idx(/(descri|historico|memo|lancamento|detalhe|estabelecimento)/)
  const iVal = idx(/^(valor|amount|vlr)/), iCred = idx(/(credito|entrada)/), iDeb = idx(/(debito|saida)/)
  const iDoc = idx(/(documento|doc|fitid|id |^id$|numero|autentic)/), iTipo = idx(/^(tipo|dc|natureza|d c)$/)
  const linhas: LinhaExtrato[] = []
  for (const l of linhasTxt.slice(hi + 1)) {
    const c = splitCsv(l, sep)
    const data = dataFlex(c[iData] ?? '')
    let valor = NaN
    if (iVal >= 0 && (c[iVal] ?? '') !== '') {
      valor = numeroBR(c[iVal])
      const t = iTipo >= 0 ? norm(c[iTipo] ?? '') : ''
      if (Number.isFinite(valor) && /^(d|deb|debito|saida)/.test(t) && valor > 0) valor = -valor
    } else {
      const cr = iCred >= 0 && c[iCred] ? numeroBR(c[iCred]) : 0
      const db = iDeb >= 0 && c[iDeb] ? numeroBR(c[iDeb]) : 0
      if (Number.isFinite(cr) && Number.isFinite(db) && (cr || db)) valor = r2(Math.abs(cr) - Math.abs(db))
    }
    if (!data || !Number.isFinite(valor)) { if (/total|saldo/i.test(l)) continue; avisos.push(`Linha ignorada: ${l.slice(0, 60)}`); continue }
    linhas.push({ data, valor, descricao: (c[iDesc] ?? '').trim() || 'SEM DESCRIÇÃO', documento: iDoc >= 0 ? c[iDoc] || undefined : undefined })
  }
  if (!linhas.length) throw Object.assign(new Error('Nenhum lançamento válido encontrado no CSV.'), { status: 422 })
  const ts = linhas.map((x) => x.data.getTime())
  return { formato: 'CSV', linhas, avisos, inicio: new Date(Math.min(...ts)), fim: new Date(Math.max(...ts)) }
}

export function lerExtrato(texto: string, formato?: string): ExtratoLido {
  const f = (formato || '').toUpperCase()
  if (f === 'OFX' || (!f && /<OFX>|OFXHEADER|<STMTTRN>/i.test(texto))) return parseOfx(texto)
  return parseCsv(texto)
}

/** Hash estável de cada linha: FITID quando existe; senão data|valor|descrição + ordinal entre linhas idênticas do arquivo. */
export function hashesDasLinhas(contaId: string, linhas: LinhaExtrato[]): string[] {
  const vistos = new Map<string, number>()
  return linhas.map((l) => {
    const base = l.documento && l.tipo !== undefined ? `fitid:${l.documento}` : `${l.data.toISOString().slice(0, 10)}|${l.valor.toFixed(2)}|${norm(l.descricao)}${l.documento ? '|' + l.documento : ''}`
    const n = (vistos.get(base) ?? 0) + 1
    vistos.set(base, n)
    return createHash('sha256').update(`${contaId}|${base}|${n}`).digest('hex')
  })
}

export function similaridade(a: string, b: string): number {
  const stop = new Set(['de', 'da', 'do', 'das', 'dos', 'ltda', 'me', 'sa', 'eireli', 'pix', 'ted', 'doc', 'pagto', 'pagamento', 'transf', 'transferencia', 'enviado', 'enviada', 'recebido', 'recebida', 'cred', 'deb', 'para', 'de'])
  const ta = new Set(norm(a).split(' ').filter((w) => w.length > 2 && !stop.has(w)))
  const tb = new Set(norm(b).split(' ').filter((w) => w.length > 2 && !stop.has(w)))
  if (!ta.size || !tb.size) return 0
  let comum = 0
  ta.forEach((w) => { if (tb.has(w)) comum++ })
  return comum / Math.min(ta.size, tb.size)
}
