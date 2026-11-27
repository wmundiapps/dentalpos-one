// Gerador mínimo de PDF vetorial (1.4): retângulos preenchidos, linhas e texto Helvetica (WinAnsi). Sem dependências.

export type Cor = [number, number, number]
const PT_MM = 72 / 25.4
export const mm = (v: number) => v * PT_MM

// cp1252 para os caracteres acentuados usados em português.
function winAnsi(s: string): Buffer {
  const bytes: number[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c < 0x80) bytes.push(c)
    else if (c >= 0xa0 && c <= 0xff) bytes.push(c)
    else if (c === 0x2013) bytes.push(0x96)
    else if (c === 0x2014) bytes.push(0x97)
    else if (c === 0x2022) bytes.push(0x95)
    else if (c === 0x2026) bytes.push(0x85)
    else bytes.push(0x3f)
  }
  return Buffer.from(bytes)
}
const escPdf = (b: Buffer) => b.toString('latin1').replace(/([\\()])/g, '\\$1')

// Larguras aproximadas Helvetica (1000 unidades/em) para truncar/centralizar texto.
const W_HELV: Record<string, number> = { ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, I: 278, J: 500, M: 833, W: 944, i: 222, j: 222, l: 222, m: 833, t: 278, f: 278, r: 333, w: 722 }
export function larguraTexto(s: string, pt: number, bold = false): number {
  let w = 0
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    let u = W_HELV[ch]
    if (u === undefined) u = c >= 48 && c <= 57 ? 556 : c >= 65 && c <= 90 ? 667 : 556
    w += u
  }
  return ((bold ? w * 1.06 : w) / 1000) * pt
}

export function truncarTexto(s: string, pt: number, larguraPt: number, bold = false): string {
  if (larguraTexto(s, pt, bold) <= larguraPt) return s
  let t = s
  while (t.length > 1 && larguraTexto(t + '…', pt, bold) > larguraPt) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

export class PdfPagina {
  ops: string[] = []
  constructor(public larguraPt: number, public alturaPt: number) {}
  private cor(c: Cor) { return `${c.map((x) => (x / 255).toFixed(3)).join(' ')}` }
  /** Origem no canto superior esquerdo (y cresce para baixo), unidades em pontos. */
  rect(x: number, y: number, w: number, h: number, cor: Cor = [0, 0, 0]) {
    this.ops.push(`${this.cor(cor)} rg ${x.toFixed(3)} ${(this.alturaPt - y - h).toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)} re f`)
  }
  contorno(x: number, y: number, w: number, h: number, espessura = 0.5, cor: Cor = [0, 0, 0]) {
    this.ops.push(`${this.cor(cor)} RG ${espessura} w ${x.toFixed(3)} ${(this.alturaPt - y - h).toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)} re S`)
  }
  texto(x: number, yBase: number, s: string, pt: number, bold = false, cor: Cor = [0, 0, 0]) {
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${pt.toFixed(2)} Tf ${this.cor(cor)} rg ${x.toFixed(3)} ${(this.alturaPt - yBase).toFixed(3)} Td (${escPdf(winAnsi(s))}) Tj ET`)
  }
}

export function montarPdf(paginas: PdfPagina[], titulo = 'Etiquetas'): Buffer {
  const objetos: Buffer[] = []
  const add = (conteudo: string | Buffer) => { objetos.push(Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, 'latin1')); return objetos.length }
  const catalogo = add('')           // 1
  const arvore = add('')             // 2
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')       // 3
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>') // 4
  const filhos: number[] = []
  for (const p of paginas) {
    const stream = Buffer.from(p.ops.join('\n'), 'latin1')
    const conteudo = add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'), stream, Buffer.from('\nendstream', 'latin1')]))
    const pg = add(`<< /Type /Page /Parent ${arvore} 0 R /MediaBox [0 0 ${p.larguraPt.toFixed(3)} ${p.alturaPt.toFixed(3)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${conteudo} 0 R >>`)
    filhos.push(pg)
  }
  const info = add(`<< /Title (${escPdf(winAnsi(titulo))}) /Producer (EduMaster Pro) >>`)
  objetos[catalogo - 1] = Buffer.from(`<< /Type /Catalog /Pages ${arvore} 0 R >>`, 'latin1')
  objetos[arvore - 1] = Buffer.from(`<< /Type /Pages /Kids [${filhos.map((k) => `${k} 0 R`).join(' ')}] /Count ${filhos.length} >>`, 'latin1')
  const partes: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')]
  const offsets: number[] = []
  let pos = partes[0].length
  objetos.forEach((o, i) => {
    offsets.push(pos)
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), o, Buffer.from('\nendobj\n', 'latin1')])
    partes.push(b)
    pos += b.length
  })
  const xref = [`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('')
  partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'))
  return Buffer.concat(partes)
}
