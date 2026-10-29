import { createHash } from 'crypto'
import { normalizar, soDigitos } from './util2'

// Lógica PURA do monitor do Diário Oficial da União (sem banco, sem rede):
// parsers (XML do INLABS, RSS/Atom, texto colado), classificação por palavras-chave
// da instituição, tema, relevância e prazo de ação sugerido.

export interface DouItem {
  dataPublicacao: Date
  secao?: number | null
  pagina?: string | null
  orgaoRaw?: string | null
  tipoRaw?: string | null
  numero?: string | null
  titulo: string
  ementa?: string | null
  texto?: string | null
  url?: string | null
  idExterno?: string | null
}

export interface PalavraDou { termo: string; tipo: string; peso: number }

export type Relevancia = 'ALTA' | 'MEDIA' | 'BAIXA' | 'NENHUMA'

export interface ClassificacaoDou {
  relevancia: Relevancia
  score: number
  tema: string
  palavrasEncontradas: string[]
  orgao: string
  tipoAto: string
  numero: string | null
  prazoAcaoEm: Date | null
  identificador: string
}

// ---------------- utilidades de texto ----------------

const ENTIDADES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' }
export function decodificar(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTIDADES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}
export function semHtml(s: string): string {
  return decodificar(s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
}
function desembrulhar(s: string): string {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return m ? m[1] : s
}
function tag(corpo: string, nome: string): string | null {
  const m = corpo.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i'))
  if (!m) return null
  const v = semHtml(desembrulhar(m[1]))
  return v || null
}
function atributos(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = decodificar(m[2])
  return out
}

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Aceita dd/mm/aaaa, aaaa-mm-dd, "28 de outubro de 2026" e RFC 822 (RSS). Meio-dia UTC-3 para não "voltar" de dia. */
export function parseDataDou(s: string | null | undefined): Date | null {
  if (!s) return null
  const t = s.trim()
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return mk(Number(m[3]), Number(m[2]), Number(m[1]))
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return mk(Number(m[1]), Number(m[2]), Number(m[3]))
  m = normalizar(t).match(/(\d{1,2})\s*(?:º|o)?\s*de\s+([a-z]+)\s+de\s+(\d{4})/)
  if (m) { const mes = MESES.indexOf(m[2]); if (mes >= 0) return mk(Number(m[3]), mes + 1, Number(m[1])) }
  const d = new Date(t)
  if (!isNaN(d.getTime())) return mk(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  return null
}
function mk(a: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(`${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00-03:00`)
  return isNaN(dt.getTime()) ? null : dt
}

// ---------------- parsers ----------------

/** XML do INLABS (<article ...><body><Identifica/><Ementa/><Texto/></body></article>), um ou vários artigos. */
export function parseInlabsXml(xml: string): DouItem[] {
  const itens: DouItem[] = []
  for (const m of xml.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)) {
    const at = atributos(m[1])
    const corpo = m[2]
    const titulo = tag(corpo, 'Identifica') ?? at.name ?? null
    if (!titulo) continue
    const data = parseDataDou(at.pubDate) ?? parseDataDou(tag(corpo, 'Data')) ?? parseDataDou(titulo)
    if (!data) continue
    const secao = at.pubName ? Number((at.pubName.match(/(\d)/) || [])[1]) || null : null
    itens.push({
      dataPublicacao: data, secao, pagina: at.numberPage || null, orgaoRaw: at.artCategory || null, tipoRaw: at.artType || null,
      numero: extrairNumero(titulo), titulo, ementa: tag(corpo, 'Ementa'), texto: tag(corpo, 'Texto'),
      url: at.pdfPage || null, idExterno: at.id || at.idMateria || null,
    })
  }
  return itens
}

/** RSS 2.0 ou Atom. */
export function parseRss(xml: string): DouItem[] {
  const itens: DouItem[] = []
  for (const m of xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const corpo = m[2]
    const titulo = tag(corpo, 'title')
    if (!titulo) continue
    const link = tag(corpo, 'link') ?? (corpo.match(/<link[^>]*href="([^"]+)"/i) || [])[1] ?? null
    const desc = tag(corpo, 'description') ?? tag(corpo, 'summary') ?? tag(corpo, 'content')
    const data = parseDataDou(tag(corpo, 'pubDate') ?? tag(corpo, 'updated') ?? tag(corpo, 'published')) ?? parseDataDou(titulo)
    if (!data) continue
    const cat = tag(corpo, 'category')
    itens.push({ dataPublicacao: data, orgaoRaw: cat, numero: extrairNumero(titulo), titulo, ementa: desc && desc.length <= 600 ? desc : null, texto: desc, url: link, idExterno: tag(corpo, 'guid') ?? tag(corpo, 'id') })
  }
  return itens
}

const RE_CABECALHO_ATO = /^\s*(PORTARIA|RESOLU[ÇC][ÃA]O|DESPACHO|PARECER|EDITAL|DECRETO|INSTRU[ÇC][ÃA]O NORMATIVA|ATO|RETIFICA[ÇC][ÃA]O|AVISO)\b[^\n]*/im

/** Colagem manual: blocos separados por "---" (ou por novos cabeçalhos de ato). */
export function parseTextoColado(texto: string, dataPadrao?: Date | null): DouItem[] {
  const linhas = texto.replace(/\r/g, '').split('\n')
  const blocos: string[][] = []
  let atual: string[] = []
  const fecha = () => { if (atual.some((l) => l.trim())) blocos.push(atual); atual = [] }
  for (const l of linhas) {
    if (/^\s*-{3,}\s*$/.test(l) || /^\s*={3,}\s*$/.test(l)) { fecha(); continue }
    if (RE_CABECALHO_ATO.test(l) && /\b(N[º°o.]?|n[º°o.]?)\s*\d/.test(l) && atual.some((x) => RE_CABECALHO_ATO.test(x) && /\d/.test(x))) fecha()
    atual.push(l)
  }
  fecha()
  const itens: DouItem[] = []
  for (const b of blocos) {
    const corpo = b.join('\n')
    const head = corpo.match(RE_CABECALHO_ATO)
    if (!head) continue
    const titulo = head[0].trim().replace(/\s+/g, ' ')
    const resto = corpo.slice((head.index ?? 0) + head[0].length).trim()
    const paragrafos = resto.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean)
    const ementa = paragrafos[0] && paragrafos[0].length <= 600 ? paragrafos[0] : null
    const sec = corpo.match(/Se[çc][ãa]o\s*(\d)/i)
    const pag = corpo.match(/P[áa]gina\s*:?\s*(\d+)/i)
    const dataCab = parseDataDou((corpo.match(/(\d{2}\/\d{2}\/\d{4})/) || [])[1]) 
    const data = parseDataDou(titulo) ?? dataCab ?? dataPadrao ?? null
    if (!data) continue
    const orgao = corpo.match(/(Minist[ée]rio da Educa[çc][ãa]o[^\n]*|Instituto Nacional de Estudos[^\n]*|Conselho Nacional de Educa[çc][ãa]o[^\n]*|Secretaria de Regula[çc][ãa]o[^\n]*|CAPES[^\n]*|INEP[^\n]*)/i)
    itens.push({
      dataPublicacao: data, secao: sec ? Number(sec[1]) : null, pagina: pag ? pag[1] : null, orgaoRaw: orgao ? orgao[0].trim() : null,
      tipoRaw: titulo.split(/\s+/)[0], numero: extrairNumero(titulo), titulo, ementa, texto: resto || null,
    })
  }
  return itens
}

export function extrairNumero(titulo: string): string | null {
  const m = titulo.match(/N[º°o.]*\s*([\d.]+(?:\s*\/\s*\d{2,4})?)/i)
  return m ? m[1].replace(/\s+/g, '') : null
}

// ---------------- classificação ----------------

export function orgaoCanonico(raw?: string | null): string {
  const n = normalizar(raw ?? '')
  if (/\binep\b|estudos e pesquisas educacionais/.test(n)) return 'INEP'
  if (/conselho nacional de educacao|\bcne\b/.test(n)) return 'CNE'
  if (/regulacao e supervisao|\bseres\b/.test(n)) return 'SERES'
  if (/\bcapes\b|coordenacao de aperfeicoamento/.test(n)) return 'CAPES'
  if (/ministerio da educacao|\bmec\b/.test(n)) return 'MEC'
  return raw ? 'OUTRO' : 'OUTRO'
}

export function tipoAtoCanonico(tipoRaw?: string | null, titulo?: string): string {
  const n = normalizar(`${tipoRaw ?? ''} ${titulo ?? ''}`)
  if (/\bportaria\b/.test(n)) return 'PORTARIA'
  if (/\bresolucao\b/.test(n)) return 'RESOLUCAO'
  if (/\bdespacho\b/.test(n)) return 'DESPACHO'
  if (/\bparecer\b/.test(n)) return 'PARECER'
  if (/\bedital\b/.test(n)) return 'EDITAL'
  return 'OUTRO'
}

export const TEMAS = ['AUTORIZACAO', 'RECONHECIMENTO', 'RENOVACAO', 'CREDENCIAMENTO', 'ENADE_CPC', 'FIES_PROUNI', 'EAD', 'SUPERVISAO', 'PENALIDADE', 'REGULAMENTACAO', 'OUTRO'] as const

export function classificarTema(texto: string): string {
  const n = normalizar(texto)
  if (/(aplic(a|ac)\w* de penalidade|\bpenalidade|suspensao de (ingresso|vestibular|processo seletivo)|desativacao|descredenciamento|cassacao|medida cautelar)/.test(n)) return 'PENALIDADE'
  if (/renovacao de reconhecimento/.test(n)) return 'RENOVACAO'
  if (/(recredenciamento|credenciamento)/.test(n)) return 'CREDENCIAMENTO'
  if (/reconhece|reconhecimento/.test(n)) return 'RECONHECIMENTO'
  if (/autoriza\w*.{0,60}(curso|funcionamento|vagas|polo)|autorizacao de curso/.test(n)) return 'AUTORIZACAO'
  if (/(enade|\bcpc\b|conceito preliminar|\bigc\b|sinaes|conceito de curso)/.test(n)) return 'ENADE_CPC'
  if (/\bfies\b|prouni|financiamento estudantil/.test(n)) return 'FIES_PROUNI'
  if (/(educacao a distancia|\bead\b|polos? de apoio)/.test(n)) return 'EAD'
  if (/(supervisao|diligencia|processo administrativo|saneador|termo de saneamento|fiscalizacao)/.test(n)) return 'SUPERVISAO'
  if (/(diretrizes|regulament|institui |altera a portaria|calendario|cadastro e-mec|marco regulatorio)/.test(n)) return 'REGULAMENTACAO'
  return 'OUTRO'
}

const PRAZO_TEMA: Record<string, number> = { PENALIDADE: 10, SUPERVISAO: 10, AUTORIZACAO: 30, RECONHECIMENTO: 30, RENOVACAO: 30, CREDENCIAMENTO: 30, ENADE_CPC: 15, FIES_PROUNI: 15, EAD: 20 }

/** Prazo explícito no texto ("prazo de 10 (dez) dias") ou, na falta, o padrão por tema/relevância. */
export function prazoSugerido(dataPub: Date, tema: string, relevancia: Relevancia, texto: string): Date | null {
  if (relevancia === 'NENHUMA' || relevancia === 'BAIXA') return null
  const m = normalizar(texto).match(/prazo (?:de|improrrogavel de|maximo de) (\d{1,3})(?: \([a-z ]+\))? (dias uteis|dias corridos|dias)/)
  let dias = m ? Number(m[1]) : (PRAZO_TEMA[tema] ?? (relevancia === 'ALTA' ? 15 : 30))
  if (m && m[2] === 'dias uteis') dias = Math.ceil(dias * 1.45)
  if (!Number.isFinite(dias) || dias <= 0 || dias > 365) dias = 30
  return new Date(dataPub.getTime() + dias * 86_400_000)
}

function termoCasa(textoNorm: string, textoDigitos: string, p: PalavraDou): boolean {
  const t = normalizar(p.termo)
  if (!t) return false
  if (p.tipo === 'CNPJ') { const d = soDigitos(p.termo); return d.length >= 8 && textoDigitos.includes(d) }
  if (p.tipo === 'EMEC') {
    const d = soDigitos(p.termo)
    return d.length > 0 && new RegExp(`(?:^|[^\\d])${d}(?:[^\\d]|$)`).test(textoNorm)
  }
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`).test(textoNorm)
}

export function identificadorDou(i: DouItem): string {
  if (i.idExterno) return `ext:${i.idExterno}`
  const base = [i.dataPublicacao.toISOString().slice(0, 10), i.secao ?? '', tipoAtoCanonico(i.tipoRaw, i.titulo), i.numero ?? '', orgaoCanonico(i.orgaoRaw), normalizar(i.titulo)].join('|')
  return 'h:' + createHash('sha1').update(base).digest('hex').slice(0, 24)
}

export function classificarItem(i: DouItem, palavras: PalavraDou[]): ClassificacaoDou {
  const bruto = `${i.titulo}\n${i.ementa ?? ''}\n${(i.texto ?? '').slice(0, 20_000)}`
  const norm = normalizar(bruto)
  const dig = soDigitos(bruto)
  const achadas = palavras.filter((p) => termoCasa(norm, dig, p))
  const orgao = orgaoCanonico(i.orgaoRaw)
  const tipoAto = tipoAtoCanonico(i.tipoRaw, i.titulo)
  const tema = classificarTema(`${i.titulo} ${i.ementa ?? ''} ${(i.texto ?? '').slice(0, 3000)}`)
  const direto = achadas.some((p) => ['INSTITUICAO', 'CNPJ', 'EMEC'].includes(p.tipo))
  const curso = achadas.some((p) => p.tipo === 'CURSO')
  let score = Math.min(100, achadas.reduce((s, p) => s + p.peso, 0))
  if (['MEC', 'INEP', 'CNE', 'SERES', 'CAPES'].includes(orgao)) score += 2
  if (['PENALIDADE', 'SUPERVISAO', 'AUTORIZACAO', 'RECONHECIMENTO', 'RENOVACAO', 'CREDENCIAMENTO'].includes(tema)) score += 3
  let relevancia: Relevancia
  if (direto) relevancia = 'ALTA'
  else if (curso) relevancia = ['PENALIDADE', 'SUPERVISAO', 'AUTORIZACAO', 'RECONHECIMENTO', 'RENOVACAO', 'ENADE_CPC'].includes(tema) ? 'ALTA' : 'MEDIA'
  else if (achadas.length) relevancia = score >= 7 ? 'MEDIA' : 'BAIXA'
  else if (['MEC', 'INEP', 'CNE', 'SERES'].includes(orgao) && ['REGULAMENTACAO', 'ENADE_CPC', 'FIES_PROUNI', 'EAD'].includes(tema)) relevancia = 'BAIXA'
  else relevancia = 'NENHUMA'
  return {
    relevancia, score, tema, palavrasEncontradas: achadas.map((p) => p.termo), orgao, tipoAto, numero: i.numero ?? null,
    prazoAcaoEm: prazoSugerido(i.dataPublicacao, tema, relevancia, bruto), identificador: identificadorDou(i),
  }
}

export function tipoRegAto(tema: string, tipoAto: string, titulo: string): string {
  const n = normalizar(titulo)
  if (tema === 'AUTORIZACAO') return 'PORTARIA_AUTORIZACAO'
  if (tema === 'RENOVACAO') return 'PORTARIA_RENOVACAO'
  if (tema === 'RECONHECIMENTO') return 'PORTARIA_RECONHECIMENTO'
  if (tema === 'CREDENCIAMENTO') return /recredenciamento/.test(n) ? 'PORTARIA_RECREDENCIAMENTO' : 'PORTARIA_CREDENCIAMENTO'
  if (tipoAto === 'RESOLUCAO') return 'RESOLUCAO'
  if (tipoAto === 'PARECER') return 'PARECER'
  return 'OUTRO'
}

export function referenciaDouTexto(p: { dataPublicacao: Date; secao?: number | null; pagina?: string | null }): string {
  const d = p.dataPublicacao.toISOString().slice(0, 10).split('-').reverse().join('/')
  return `DOU${p.secao ? ` Seção ${p.secao}` : ''}${p.pagina ? `, p. ${p.pagina}` : ''}, ${d}`
}

// ---------------- provedores de coleta ----------------

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

export interface DouEntrada { conteudo?: string; url?: string; dataPadrao?: Date | null }
export interface DouProvider { nome: string; modo: string; coletar(e: DouEntrada, fetcher?: Fetcher): Promise<DouItem[]> }

/** Bloqueia SSRF: só https, sem IP literal privado/loopback e sem host interno. */
export function urlColetaSegura(u: string): string {
  let url: URL
  try { url = new URL(u) } catch { throw Object.assign(new Error('URL inválida.'), { status: 400 }) }
  const h = url.hostname.toLowerCase()
  if (url.protocol !== 'https:') throw Object.assign(new Error('Somente URLs https são permitidas.'), { status: 400 })
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') || /^(\d+\.){3}\d+$/.test(h) || h.includes(':') || h.startsWith('[')) {
    throw Object.assign(new Error('Host não permitido para coleta.'), { status: 400 })
  }
  return url.toString()
}

async function obterConteudo(e: DouEntrada, fetcher?: Fetcher): Promise<string> {
  if (e.conteudo) return e.conteudo
  if (!e.url) throw Object.assign(new Error('Informe "conteudo" ou "url".'), { status: 400 })
  const f = fetcher ?? ((u: string) => fetch(u, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'EduMasterPro-DOU/1.0', Accept: 'application/xml,text/xml,application/rss+xml,text/plain' } }) as any)
  const r = await f(urlColetaSegura(e.url))
  if (!r.ok) throw Object.assign(new Error(`Fonte respondeu HTTP ${r.status}.`), { status: 424 })
  const txt = await r.text()
  if (txt.length > 15_000_000) throw Object.assign(new Error('Conteúdo grande demais (máx. 15 MB).'), { status: 413 })
  return txt
}

export const PROVEDORES: Record<string, DouProvider> = {
  INLABS_XML: { nome: 'INLABS (XML)', modo: 'XML', coletar: async (e, f) => parseInlabsXml(await obterConteudo(e, f)) },
  RSS: { nome: 'RSS/Atom', modo: 'RSS', coletar: async (e, f) => parseRss(await obterConteudo(e, f)) },
  MANUAL: { nome: 'Colagem manual', modo: 'TEXTO', coletar: async (e) => parseTextoColado(e.conteudo ?? '', e.dataPadrao) },
}

export function provedorPorFormato(formato: string): DouProvider | null {
  const f = formato.toUpperCase()
  if (f === 'XML' || f === 'INLABS_XML') return PROVEDORES.INLABS_XML
  if (f === 'RSS' || f === 'ATOM') return PROVEDORES.RSS
  if (f === 'TEXTO' || f === 'MANUAL') return PROVEDORES.MANUAL
  return null
}
