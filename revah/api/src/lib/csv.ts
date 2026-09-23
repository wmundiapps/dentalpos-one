// Parser CSV simples (aspas, vírgula ou ponto-e-vírgula), sem dependências.
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] || ''
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ','
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
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim()))
  if (!nonEmpty.length) return []
  const header = nonEmpty[0].map((h) =>
    h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'),
  )
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}

const aliases: Record<string, string[]> = {
  name: ['nome', 'name', 'contato', 'cliente', 'razao_social'],
  phone: ['telefone', 'phone', 'celular', 'whatsapp', 'fone', 'numero', 'número'],
  email: ['email', 'e-mail', 'e_mail'],
  company: ['empresa', 'company', 'organizacao'],
  document: ['cpf', 'cnpj', 'documento', 'document'],
  tags: ['tags', 'etiquetas', 'segmento'],
}

export function pickField(row: Record<string, string>, field: keyof typeof aliases) {
  for (const k of aliases[field]) if (row[k]) return row[k]
  return ''
}
