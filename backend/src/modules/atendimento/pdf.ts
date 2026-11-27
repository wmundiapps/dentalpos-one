import { qrMatrix } from './qr'

// Gerador mínimo de PDF (A4, Helvetica, WinAnsi) sem dependências: título, parágrafos, tabela simples, QR vetorial e rodapé.
const W: Record<string, number> = {}
const widths = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584'.split(' ').map(Number)
widths.forEach((w, i) => { W[String.fromCharCode(32 + i)] = w })
const BOLD_FACTOR = 1.06

const base = (ch: string) => ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
export function textWidth(s: string, size: number, bold = false) {
  let t = 0
  for (const ch of s) t += W[base(ch)[0]] ?? 556
  return (t / 1000) * size * (bold ? BOLD_FACTOR : 1)
}
function enc(s: string) {
  const out: number[] = []
  for (const ch of s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')) {
    const c = ch.codePointAt(0)!
    out.push(c < 256 ? c : 63)
  }
  return Buffer.from(out)
}
const esc = (b: Buffer) => b.toString('latin1').replace(/([\\()])/g, '\\$1').replace(/\r/g, '')

export function wrap(s: string, size: number, maxW: number, bold = false): string[] {
  const lines: string[] = []
  for (const par of String(s).split('\n')) {
    let cur = ''
    for (const w of par.split(/\s+/).filter(Boolean)) {
      const t = cur ? cur + ' ' + w : w
      if (textWidth(t, size, bold) <= maxW || !cur) cur = t
      else { lines.push(cur); cur = w }
    }
    lines.push(cur)
  }
  return lines
}

export interface PdfInput {
  titulo: string
  instituicao?: string
  paragrafos: string[]
  tabela?: { cabecalho: string[]; linhas: string[][] }
  rodape: string[]
  qrTexto?: string
  marcaDagua?: string
  assinaturaLinha?: string[]
  metadata?: string
}

export function gerarPdf(inp: PdfInput): Buffer {
  const pages: string[] = []
  let cmd: string[] = []
  const PW = 595, PH = 842, MX = 56
  let y = PH - 64
  const newPage = () => { if (cmd.length) pages.push(cmd.join('\n')); cmd = []; y = PH - 64 }
  const text = (s: string, x: number, yy: number, size: number, bold = false, gray = 0) => cmd.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} Td (${esc(enc(s))}) Tj ET 0 g`)
  const line = (x1: number, y1: number, x2: number, y2: number, w = 0.6) => cmd.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`)

  cmd.push('0.12 0.25 0.55 RG 2 w 24 24 547 794 re S 0.5 w 30 30 535 782 re S 0 G')
  if (inp.instituicao) { text(inp.instituicao.toUpperCase(), MX, y, 11, true, 0.35); y -= 8; line(MX, y, PW - MX, y, 1); y -= 30 }
  for (const l of wrap(inp.titulo.toUpperCase(), 20, PW - 2 * MX, true)) { text(l, (PW - textWidth(l, 20, true)) / 2, y, 20, true); y -= 26 }
  y -= 14
  for (const p of inp.paragrafos) {
    for (const l of wrap(p, 12, PW - 2 * MX)) { if (y < 190) newPage(); text(l, MX, y, 12); y -= 18 }
    y -= 8
  }
  if (inp.tabela) {
    const cols = inp.tabela.cabecalho.length, cw = (PW - 2 * MX) / cols
    const row = (cells: string[], bold: boolean) => {
      const wrapped = cells.map((c) => wrap(c, 8.5, cw - 6, bold).slice(0, 2)); const h = Math.max(...wrapped.map((w) => w.length)) * 11 + 5
      if (y - h < 190) newPage()
      wrapped.forEach((w, i) => w.forEach((l, k) => text(l, MX + i * cw + 3, y - 10 - k * 11, 8.5, bold)))
      y -= h; line(MX, y, PW - MX, y, 0.3)
    }
    row(inp.tabela.cabecalho, true); for (const r of inp.tabela.linhas) row(r, false); y -= 10
  }
  if (inp.assinaturaLinha?.length) {
    if (y < 230) newPage()
    y = Math.min(y - 24, 250)
    line(PW / 2 - 120, y, PW / 2 + 120, y, 0.8); y -= 13
    inp.assinaturaLinha.forEach((l, i) => { text(l, (PW - textWidth(l, 10, i === 0)) / 2, y, 10, i === 0, i ? 0.35 : 0); y -= 13 })
  }
  // rodapé + QR na última página
  const qy = 48
  if (inp.qrTexto) {
    const m = qrMatrix(inp.qrTexto), n = m.length, sz = 72 / (n + 8), ox = PW - MX - 72 - 4 * sz, oy = qy + 72 + 4 * sz - 4 * sz
    cmd.push('1 g ' + `${ox - 4 * sz} ${qy - 4 * sz + 0} ${72 + 8 * sz} ${72 + 8 * sz} re f 0 g`)
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) cmd.push(`${(ox + c * sz).toFixed(2)} ${(qy + 72 - (r + 1) * sz + 0).toFixed(2)} ${sz.toFixed(2)} ${sz.toFixed(2)} re f`)
    void oy
  }
  let fy = qy + 56
  for (const l of inp.rodape) for (const w of wrap(l, 8, PW - 2 * MX - 100)) { text(w, MX, fy, 8, false, 0.3); fy -= 10 }
  if (inp.marcaDagua) cmd.unshift(`BT /F2 80 Tf 0.9 g 0.87 0.5 -0.5 0.87 120 300 Tm (${esc(enc(inp.marcaDagua))}) Tj ET 0 g`)
  pages.push(cmd.join('\n'))

  // montagem dos objetos
  const objs: Buffer[] = []
  const add = (s: string | Buffer) => { objs.push(Buffer.isBuffer(s) ? s : Buffer.from(s, 'latin1')); return objs.length }
  const catalog = add(''), pagesRoot = add(''), f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  const kids: number[] = []
  for (const content of pages) {
    const stream = Buffer.from(content, 'latin1')
    const cid = add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('\nendstream')]))
    kids.push(add(`<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cid} 0 R >>`))
  }
  objs[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`)
  objs[pagesRoot - 1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`)
  const info = add(`<< /Title (${esc(enc(inp.titulo))}) /Producer (EduMaster Pro) ${inp.metadata ? `/Subject (${esc(enc(inp.metadata))})` : ''} >>`)
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')]
  const offs: number[] = []
  let pos = parts[0].length
  objs.forEach((o, i) => { offs.push(pos); const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]); parts.push(b); pos += b.length })
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offs) xref += `${String(o).padStart(10, '0')} 00000 n \n`
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`))
  return Buffer.concat(parts)
}
