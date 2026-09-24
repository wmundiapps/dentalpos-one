// Leitura simples de CSV no navegador (vírgula ou ponto e vírgula, aspas duplas).

export function detectDelimiter(firstLine: string) {
  const semi = (firstLine.match(/;/g) || []).length
  const comma = (firstLine.match(/,/g) || []).length
  const tab = (firstLine.match(/\t/g) || []).length
  if (tab > semi && tab > comma) return '\t'
  return semi >= comma && semi > 0 ? ';' : ','
}

export function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] || ''
  const delim = detectDelimiter(firstLine)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell.trim())
      if (row.some((c) => c)) rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell.trim())
  if (row.some((c) => c)) rows.push(row)
  return rows
}

const NAME_KEYS = ['nome', 'name', 'cliente', 'paciente']
const PHONE_KEYS = ['telefone', 'phone', 'celular', 'whatsapp', 'fone', 'tel', 'mobile']
const EMAIL_KEYS = ['email', 'e-mail', 'mail']
const TELEGRAM_KEYS = ['telegram', 'chat_id', 'chatid', 'telegramchatid']

function findIndex(header: string[], keys: string[]) {
  const h = header.map((x) => x.toLowerCase().trim())
  return h.findIndex((x) => keys.some((k) => x === k || x.includes(k)))
}

// Extrai {name, destination} para a lista manual de uma campanha.
export function csvToManualList(text: string, kind: 'phone' | 'email' | 'telegram') {
  const rows = parseCsvRows(text)
  if (!rows.length) return []
  const header = rows[0]
  const keys = kind === 'email' ? EMAIL_KEYS : kind === 'telegram' ? TELEGRAM_KEYS : PHONE_KEYS
  let destIdx = findIndex(header, keys)
  let nameIdx = findIndex(header, NAME_KEYS)
  let body = rows.slice(1)
  if (destIdx < 0) {
    // Sem cabeçalho reconhecido: usa a primeira coluna com cara de destino.
    body = rows
    nameIdx = -1
    destIdx = 0
    const sample = rows[0]
    const guess = sample.findIndex((c) => (kind === 'email' ? /@/.test(c) : /\d{6,}/.test(c.replace(/\D/g, ''))))
    if (guess >= 0) {
      destIdx = guess
      nameIdx = sample.findIndex((c, i) => i !== guess && /[a-zA-ZÀ-ú]/.test(c) && !/@/.test(c))
    }
  }
  return body
    .map((r) => ({ name: nameIdx >= 0 ? r[nameIdx] || '' : '', destination: r[destIdx] || '' }))
    .filter((r) => r.destination)
}
