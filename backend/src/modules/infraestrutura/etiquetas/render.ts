// Motor de layout de etiquetas patrimoniais: QR Code + Code 128 + textos, em SVG, PDF ou HTML imprimível.
import { barrasCode128 } from './code128'
import { montarPdf, mm, PdfPagina, larguraTexto, truncarTexto, type Cor } from './pdf'
import { gerarQr, qrSvgPath, type QrResultado } from './qr'

export const CAMPOS_ETIQUETA = ['instituicao', 'codigo', 'nome', 'departamento', 'local', 'responsavel', 'categoria'] as const
export type CampoEtiqueta = (typeof CAMPOS_ETIQUETA)[number]

export interface LayoutEtiqueta {
  nome?: string
  formato: 'A4_COLUNAS' | 'ROLO'
  larguraMm: number
  alturaMm: number
  colunas: number
  linhas: number
  margemSupMm: number
  margemEsqMm: number
  gapXMm: number
  gapYMm: number
  campos: string[]
  mostrarQr: boolean
  mostrarBarras: boolean
  qrPosicao: 'ESQUERDA' | 'DIREITA'
  fonteBasePt: number
  borda: boolean
}

export interface DadosEtiqueta {
  codigo: string
  nome?: string | null
  departamento?: string | null
  local?: string | null
  responsavel?: string | null
  categoria?: string | null
  instituicao?: string | null
  /** Conteúdo do QR Code (padrão: EDU:BEM:<codigo>). */
  qr?: string
}

export const A4 = { larguraMm: 210, alturaMm: 297 }

/** Presets prontos (equivalentes a folhas comuns e rolos térmicos). */
export const LAYOUTS_PADRAO: Array<LayoutEtiqueta & { nome: string; padrao?: boolean }> = [
  { nome: 'A4 - 3 colunas (63,5 x 33,9 mm)', formato: 'A4_COLUNAS', larguraMm: 63.5, alturaMm: 33.9, colunas: 3, linhas: 8, margemSupMm: 12.9, margemEsqMm: 7.2, gapXMm: 2.5, gapYMm: 0, campos: ['instituicao', 'codigo', 'nome', 'departamento', 'local'], mostrarQr: true, mostrarBarras: true, qrPosicao: 'ESQUERDA', fonteBasePt: 6.5, borda: true, padrao: true },
  { nome: 'A4 - 2 colunas (95 x 38 mm)', formato: 'A4_COLUNAS', larguraMm: 95, alturaMm: 38, colunas: 2, linhas: 7, margemSupMm: 15.5, margemEsqMm: 7.5, gapXMm: 3, gapYMm: 0, campos: ['instituicao', 'codigo', 'nome', 'departamento', 'local', 'responsavel'], mostrarQr: true, mostrarBarras: true, qrPosicao: 'ESQUERDA', fonteBasePt: 8, borda: true },
  { nome: 'Rolo térmico 60 x 30 mm', formato: 'ROLO', larguraMm: 60, alturaMm: 30, colunas: 1, linhas: 1, margemSupMm: 0, margemEsqMm: 0, gapXMm: 0, gapYMm: 0, campos: ['codigo', 'nome', 'departamento'], mostrarQr: true, mostrarBarras: false, qrPosicao: 'ESQUERDA', fonteBasePt: 6.5, borda: false },
  { nome: 'Rolo térmico 100 x 50 mm', formato: 'ROLO', larguraMm: 100, alturaMm: 50, colunas: 1, linhas: 1, margemSupMm: 0, margemEsqMm: 0, gapXMm: 0, gapYMm: 0, campos: ['instituicao', 'codigo', 'nome', 'departamento', 'local', 'responsavel'], mostrarQr: true, mostrarBarras: true, qrPosicao: 'ESQUERDA', fonteBasePt: 9, borda: false },
]

export function validarLayout(l: LayoutEtiqueta): string | null {
  if (l.larguraMm < 20 || l.larguraMm > 210 || l.alturaMm < 15 || l.alturaMm > 297) return 'Dimensões da etiqueta fora do permitido (20-210 x 15-297 mm).'
  if (l.formato === 'A4_COLUNAS') {
    const w = l.margemEsqMm * 2 + l.colunas * l.larguraMm + (l.colunas - 1) * l.gapXMm
    const h = l.margemSupMm + l.linhas * l.alturaMm + (l.linhas - 1) * l.gapYMm
    if (w > A4.larguraMm + 0.5) return `As colunas não cabem na largura do A4 (${w.toFixed(1)} mm > 210 mm).`
    if (h > A4.alturaMm + 0.5) return `As linhas não cabem na altura do A4 (${h.toFixed(1)} mm > 297 mm).`
  }
  if (!l.mostrarQr && !l.mostrarBarras && !l.campos.length) return 'A etiqueta ficaria vazia.'
  return null
}

// ---------- Superfícies de desenho (coordenadas em mm) ----------
interface Superficie {
  rect(x: number, y: number, w: number, h: number, cor?: Cor): void
  contorno(x: number, y: number, w: number, h: number, cor?: Cor): void
  texto(x: number, yBase: number, s: string, pt: number, bold?: boolean, cor?: Cor): void
  qr(x: number, y: number, lado: number, qr: QrResultado): void
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const rgb = (c: Cor) => `rgb(${c[0]},${c[1]},${c[2]})`
const PT_MM = 25.4 / 72

class SvgSup implements Superficie {
  partes: string[] = []
  rect(x: number, y: number, w: number, h: number, cor: Cor = [0, 0, 0]) { this.partes.push(`<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}" fill="${rgb(cor)}"/>`) }
  contorno(x: number, y: number, w: number, h: number, cor: Cor = [0, 0, 0]) { this.partes.push(`<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}" fill="none" stroke="${rgb(cor)}" stroke-width="0.15"/>`) }
  texto(x: number, yBase: number, s: string, pt: number, bold = false, cor: Cor = [0, 0, 0]) {
    this.partes.push(`<text x="${x.toFixed(3)}" y="${yBase.toFixed(3)}" font-family="Helvetica, Arial, sans-serif" font-size="${(pt * PT_MM).toFixed(3)}" font-weight="${bold ? 700 : 400}" fill="${rgb(cor)}">${esc(s)}</text>`)
  }
  qr(x: number, y: number, lado: number, qr: QrResultado) {
    const { path, lado: unidades } = qrSvgPath(qr, 0)
    this.partes.push(`<path transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${(lado / unidades).toFixed(5)})" d="${path}" fill="#000" shape-rendering="crispEdges"/>`)
  }
}

class PdfSup implements Superficie {
  constructor(public pg: PdfPagina) {}
  rect(x: number, y: number, w: number, h: number, cor: Cor = [0, 0, 0]) { this.pg.rect(mm(x), mm(y), mm(w), mm(h), cor) }
  contorno(x: number, y: number, w: number, h: number, cor: Cor = [0, 0, 0]) { this.pg.contorno(mm(x), mm(y), mm(w), mm(h), 0.4, cor) }
  texto(x: number, yBase: number, s: string, pt: number, bold = false, cor: Cor = [0, 0, 0]) { this.pg.texto(mm(x), mm(yBase), s, pt, bold, cor) }
  qr(x: number, y: number, lado: number, qr: QrResultado) {
    const u = lado / qr.tamanho
    for (let r = 0; r < qr.tamanho; r++) {
      let c = 0
      while (c < qr.tamanho) {
        if (qr.modulos[r][c]) {
          let fim = c
          while (fim < qr.tamanho && qr.modulos[r][fim]) fim++
          this.pg.rect(mm(x + c * u), mm(y + r * u), mm((fim - c) * u), mm(u + 0.002))
          c = fim
        } else c++
      }
    }
  }
}

// Quebra de texto por palavras respeitando a largura (aprox. Helvetica).
function quebrar(s: string, pt: number, larguraMm: number, maxLinhas: number, bold = false): string[] {
  const larguraPt = larguraMm / PT_MM
  const palavras = s.split(/\s+/).filter(Boolean)
  const linhas: string[] = []
  let atual = ''
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p
    if (larguraTexto(teste, pt, bold) <= larguraPt) atual = teste
    else { if (atual) linhas.push(atual); atual = p }
  }
  if (atual) linhas.push(atual)
  const out = linhas.slice(0, maxLinhas)
  if (linhas.length > maxLinhas) out[maxLinhas - 1] = truncarTexto(out[maxLinhas - 1] + ' …', pt, larguraPt, bold)
  return out.map((l) => truncarTexto(l, pt, larguraPt, bold))
}

/** Desenha UMA etiqueta com o canto superior esquerdo em (x, y). */
export function desenharEtiqueta(sup: Superficie, x: number, y: number, L: LayoutEtiqueta, d: DadosEtiqueta) {
  const W = L.larguraMm, H = L.alturaMm
  const pad = Math.max(1, Math.min(2, W * 0.025))
  if (L.borda) sup.contorno(x, y, W, H, [120, 120, 120])
  const campos = new Set(L.campos)
  const base = L.fonteBasePt
  let textoX = x + pad
  let textoW = W - pad * 2
  if (L.mostrarQr) {
    const lado = Math.min(H - pad * 2, W * 0.42)
    const qx = L.qrPosicao === 'DIREITA' ? x + W - pad - lado : x + pad
    sup.qr(qx, y + pad, lado, gerarQr(d.qr || `EDU:BEM:${d.codigo}`))
    textoW = W - pad * 3 - lado
    textoX = L.qrPosicao === 'DIREITA' ? x + pad : x + pad * 2 + lado
  }
  // faixa inferior para o código de barras
  const alturaBarras = L.mostrarBarras ? Math.max(5, Math.min(H * 0.26, 11)) : 0
  const yMax = y + H - pad - (alturaBarras ? alturaBarras + 0.8 : 0)
  let cy = y + pad
  const linha = (txt: string | null | undefined, pt: number, bold = false, cor: Cor = [0, 0, 0], max = 1) => {
    if (!txt) return
    for (const ln of quebrar(String(txt), pt, textoW, max, bold)) {
      const h = pt * PT_MM * 1.18
      if (cy + h > yMax + 0.01) return
      sup.texto(textoX, cy + pt * PT_MM * 0.9, ln, pt, bold, cor)
      cy += h
    }
  }
  if (campos.has('instituicao')) linha(d.instituicao, base * 0.85, true, [80, 80, 80])
  if (campos.has('codigo')) linha(d.codigo, base * 1.5, true)
  if (campos.has('nome')) linha(d.nome, base * 1.05, false, [0, 0, 0], H >= 28 ? 2 : 1)
  if (campos.has('categoria')) linha(d.categoria, base * 0.9, false, [90, 90, 90])
  if (campos.has('departamento')) linha(d.departamento ? `Depto: ${d.departamento}` : null, base * 0.95)
  if (campos.has('local')) linha(d.local ? `Local: ${d.local}` : null, base * 0.95)
  if (campos.has('responsavel')) linha(d.responsavel ? `Resp.: ${d.responsavel}` : null, base * 0.95)
  if (L.mostrarBarras) {
    const { barras, largura } = barrasCode128(d.codigo)
    const areaW = textoW
    const mod = areaW / largura
    const by = y + H - pad - alturaBarras
    const bx = textoX
    for (const [bxm, lw] of barras) sup.rect(bx + bxm * mod, by, lw * mod, alturaBarras)
  }
}

export interface Saida { paginas: number }

interface PaginaPlano { larguraMm: number; alturaMm: number; itens: Array<{ x: number; y: number; dados: DadosEtiqueta }> }

/** Distribui as etiquetas em páginas conforme o formato (A4 em grade ou rolo = uma etiqueta por página). */
export function planejarPaginas(L: LayoutEtiqueta, dados: DadosEtiqueta[], opt: { copias?: number; pularPosicoes?: number } = {}): PaginaPlano[] {
  const lista: DadosEtiqueta[] = []
  for (const d of dados) for (let i = 0; i < Math.max(1, opt.copias ?? 1); i++) lista.push(d)
  if (L.formato === 'ROLO') return lista.map((d) => ({ larguraMm: L.larguraMm, alturaMm: L.alturaMm, itens: [{ x: 0, y: 0, dados: d }] }))
  const porPagina = L.colunas * L.linhas
  const paginas: PaginaPlano[] = []
  const vazios = Math.max(0, Math.min(porPagina - 1, opt.pularPosicoes ?? 0))
  const seq: Array<DadosEtiqueta | null> = [...new Array(vazios).fill(null), ...lista]
  for (let i = 0; i < seq.length; i += porPagina) {
    const pg: PaginaPlano = { larguraMm: A4.larguraMm, alturaMm: A4.alturaMm, itens: [] }
    seq.slice(i, i + porPagina).forEach((d, k) => {
      if (!d) return
      const col = k % L.colunas, lin = Math.floor(k / L.colunas)
      pg.itens.push({ x: L.margemEsqMm + col * (L.larguraMm + L.gapXMm), y: L.margemSupMm + lin * (L.alturaMm + L.gapYMm), dados: d })
    })
    paginas.push(pg)
  }
  return paginas.length ? paginas : [{ larguraMm: A4.larguraMm, alturaMm: A4.alturaMm, itens: [] }]
}

export function renderSvgPagina(L: LayoutEtiqueta, pg: PaginaPlano): string {
  const sup = new SvgSup()
  for (const it of pg.itens) desenharEtiqueta(sup, it.x, it.y, L, it.dados)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pg.larguraMm}mm" height="${pg.alturaMm}mm" viewBox="0 0 ${pg.larguraMm} ${pg.alturaMm}">${L.formato === 'A4_COLUNAS' ? `<rect width="${pg.larguraMm}" height="${pg.alturaMm}" fill="#fff"/>` : ''}${sup.partes.join('')}</svg>`
}

export function renderPdf(L: LayoutEtiqueta, paginas: PaginaPlano[], titulo = 'Etiquetas de patrimônio'): Buffer {
  const pdfPaginas = paginas.map((pg) => {
    const p = new PdfPagina(mm(pg.larguraMm), mm(pg.alturaMm))
    const sup = new PdfSup(p)
    for (const it of pg.itens) desenharEtiqueta(sup, it.x, it.y, L, it.dados)
    return p
  })
  return montarPdf(pdfPaginas, titulo)
}

export function renderHtml(L: LayoutEtiqueta, paginas: PaginaPlano[], titulo = 'Etiquetas de patrimônio'): string {
  const size = L.formato === 'ROLO' ? `${L.larguraMm}mm ${L.alturaMm}mm` : 'A4'
  const corpo = paginas.map((pg) => `<section class="pg" style="width:${pg.larguraMm}mm;height:${pg.alturaMm}mm">${renderSvgPagina(L, pg)}</section>`).join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title>
<style>@page{size:${size};margin:0}html,body{margin:0;background:#e5e7eb}.pg{background:#fff;margin:8px auto;page-break-after:always;break-after:page;overflow:hidden}.pg svg{display:block}.aviso{font:13px sans-serif;text-align:center;padding:8px}@media print{html,body{background:#fff}.pg{margin:0}.aviso{display:none}}</style></head>
<body><div class="aviso">Use Imprimir (Ctrl+P), escala 100% e sem margens. ${paginas.length} página(s).</div>${corpo}</body></html>`
}
