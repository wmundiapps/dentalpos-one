import zlib from 'zlib'

// Gerador mínimo de .xlsx (Office Open XML) sem dependências: ZIP com deflate + planilhas com strings inline.
// Suporta várias abas, cabeçalho em negrito, números e datas (como texto ISO formatado pelo chamador).

export interface Aba { nome: string; colunas: Array<{ titulo: string; largura?: number }>; linhas: Array<Array<string | number | boolean | Date | null | undefined>> }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
export function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

function colRef(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** Evita injeção de fórmula (CSV/Excel injection): textos iniciados por = + - @ viram texto literal com apóstrofo. */
function seguro(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

function sheetXml(a: Aba): string {
  const rows: string[] = []
  const cell = (r: number, c: number, v: any, bold = false): string => {
    const ref = `${colRef(c)}${r}`
    if (v === null || v === undefined || v === '') return ''
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${bold ? ' s="1"' : ''}><v>${v}</v></c>`
    if (typeof v === 'boolean') return `<c r="${ref}" t="inlineStr"><is><t>${v ? 'Sim' : 'Não'}</t></is></c>`
    const txt = v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
    return `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(bold ? txt : seguro(txt))}</t></is></c>`
  }
  rows.push(`<row r="1">${a.colunas.map((c, i) => cell(1, i, c.titulo, true)).join('')}</row>`)
  a.linhas.forEach((l, ri) => rows.push(`<row r="${ri + 2}">${l.map((v, ci) => cell(ri + 2, ci, v)).join('')}</row>`))
  const cols = a.colunas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura ?? Math.min(48, Math.max(12, c.titulo.length + 4))}" customWidth="1"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`
}

function nomeAba(n: string, usados: Set<string>): string {
  let s = n.replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31) || 'Planilha'
  let k = 2
  while (usados.has(s.toLowerCase())) s = `${s.slice(0, 28)} ${k++}`
  usados.add(s.toLowerCase())
  return s
}

export function gerarXlsx(abas: Aba[]): Buffer {
  const usados = new Set<string>()
  const nomes = abas.map((a) => nomeAba(a.nome, usados))
  const files: Array<{ name: string; data: Buffer }> = []
  const add = (name: string, xml: string) => files.push({ name, data: Buffer.from(xml, 'utf8') })
  add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)
  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)
  add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`)
  add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)
  add('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`)
  abas.forEach((a, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(a)))
  return zip(files)
}

function zip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const comp = zlib.deflateRawSync(f.data)
    const crc = crc32(f.data)
    const h = Buffer.alloc(30)
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8)
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(f.data.length, 22)
    h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28)
    parts.push(h, name, comp)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10)
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(f.data.length, 24)
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42)
    central.push(c, name)
    offset += 30 + name.length + comp.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, end])
}

/** Leitor mínimo para testes: devolve os arquivos do zip (apenas entradas deflate/store geradas por zip acima ou por Excel comum). */
export function lerZip(buf: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {}
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('zip inválido')
  const n = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42)
    const name = buf.slice(p + 46, p + 46 + nl).toString('utf8')
    const lnl = buf.readUInt16LE(lho + 26), lel = buf.readUInt16LE(lho + 28)
    const raw = buf.slice(lho + 30 + lnl + lel, lho + 30 + lnl + lel + csize)
    out[name] = method === 8 ? zlib.inflateRawSync(raw) : raw
    p += 46 + nl + el + cl
  }
  return out
}
