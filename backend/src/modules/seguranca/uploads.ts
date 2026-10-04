import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import { prisma } from '../../lib/prisma'
import { consultarVirusTotal, varrerClamav, clamavConfigurado } from './antivirus'
import { deveRegistrarComLimite, registrarEvento } from './eventos'
import { moderarImagem, moderarTexto, politicaModeracao } from './moderacao'
import { Categoria, checarNomeArquivo, detectarPerigoBinario, detectarTipo, ehFamiliaZip, extensaoDe, LIMITE_BYTES, MIMES_BLOQUEADOS, pareceTexto, TIPOS, textoDe, textoEhHtmlOuScript } from './tipos'
import { validarUrlExternaDns } from './url'
import { EntradaZip, lerEntrada, lerIndiceZip, ZipInvalidoError } from './zip'

// ============================================================
// scanUpload — varredura central de arquivos enviados (anti-malware / anti-pornografia).
// Camadas: nome/extensão -> tipo real (magic bytes) -> allowlist/tamanho -> conteúdo perigoso por tipo
// -> EICAR -> ClamAV (opcional) -> VirusTotal por hash (opcional) -> moderação de imagem por IA.
// Veredito: LIMPO | SUSPEITO (aceita e registra) | BLOQUEADO (recusa com 422).
// LIMITE HONESTO: nenhuma varredura estática garante ausência de malware (ver docs/SEGURANCA.md).
// ============================================================

export type Veredito = 'LIMPO' | 'SUSPEITO' | 'BLOQUEADO'

export interface ContextoVarredura {
  tenantId?: string
  userId?: string
  ip?: string
  origem?: string        // módulo/rota que recebeu o arquivo (aparece no log)
  registrar?: boolean    // false = não grava SegArquivoVerificado/SegEvento (uso em testes puros)
}

export interface ScanInput {
  filename?: string
  declaredMime?: string
  /** Buffer, ou data URL ("data:image/png;base64,..."). */
  data?: Buffer | string
  /** URL externa de anexo (apenas validada; o conteúdo NÃO é baixado). */
  url?: string
  /** Categorias aceitas neste ponto de upload (padrão: todas as seguras). */
  permitir?: Categoria[]
  /** Moderação de imagem por IA (padrão: true). */
  moderar?: boolean
  contexto?: ContextoVarredura
}

export interface ScanResult {
  ok: boolean
  veredito: Veredito
  motivo?: string
  motivos: string[]
  avisos: string[]
  sha256?: string
  tamanho?: number
  tipo?: string          // id do tipo detectado (png, pdf, docx...)
  mime?: string          // mime canônico do tipo detectado
  categoria?: Categoria
}

const ASSINATURA_EICAR = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE'
const MAX_PIXELS = Number(process.env.UPLOAD_MAX_PIXELS || 100_000_000)
const MAX_DESCOMPRIMIDO = Number(process.env.UPLOAD_MAX_DESCOMPRIMIDO || 500 * 1024 * 1024)
const MAX_RAZAO_ZIP = Number(process.env.UPLOAD_MAX_RAZAO_ZIP || 100)
const MAX_ENTRADAS_ZIP = 2000

class Acumulador {
  bloqueios: string[] = []
  suspeitas: string[] = []
  avisos: string[] = []
  bloquear(m: string) { if (!this.bloqueios.includes(m)) this.bloqueios.push(m) }
  suspeitar(m: string) { if (!this.suspeitas.includes(m)) this.suspeitas.push(m) }
}

// ---------------------------------------------------------------
// Data URL
// ---------------------------------------------------------------
export interface DataUrlLida { mime: string; buffer: Buffer }

export function lerDataUrl(s: string): DataUrlLida | null {
  const m = /^data:([^,;]*)((?:;[^,;=]+(?:=[^,;]*)?)*),([\s\S]*)$/i.exec(s.trim())
  if (!m) return null
  const mime = (m[1] || 'text/plain').toLowerCase()
  const base64 = /;base64/i.test(m[2])
  try {
    const buffer = base64 ? Buffer.from(m[3].replace(/\s+/g, ''), 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8')
    return { mime, buffer }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------
// Verificações por tipo
// ---------------------------------------------------------------

/** Polyglots: arquivo "imagem/pdf" com outro formato ou código escondido dentro. */
function checarPolyglot(b: Buffer, tipo: string, ac: Acumulador) {
  const s = b.length > 40_000_000 ? '' : b.toString('latin1')
  if (/<\s*script\b/i.test(s) && tipo !== 'pdf') ac.bloquear('código <script> embutido no arquivo (polyglot)')
  if (/<\?php/i.test(s)) ac.bloquear('código PHP embutido no arquivo (polyglot)')
  if (tipo !== 'pdf' && tipo !== 'zip' && !ehFamiliaZip(tipo) && tipo !== 'ole') {
    const pdf = s.indexOf('%PDF-')
    if (pdf >= 0 && tipo !== 'texto' && tipo !== 'rtf') ac.bloquear('PDF embutido dentro de outro formato (polyglot)')
    const pk = s.indexOf('PK\u0003\u0004', 4)
    if (pk >= 0 && s.lastIndexOf('PK\u0005\u0006') > pk) ac.bloquear('arquivo ZIP embutido dentro de outro formato (polyglot)')
    const mz = s.indexOf('MZ', 4)
    if (mz >= 0 && s.includes('This program cannot be run in DOS mode')) ac.bloquear('executável Windows embutido (polyglot)')
  }
}

function dimensoes(b: Buffer, tipo: string): { w: number; h: number } | null {
  try {
    if (tipo === 'png' && b.length >= 24) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
    if (tipo === 'gif' && b.length >= 10) return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) }
    if (tipo === 'jpeg') {
      let p = 2
      while (p + 9 < b.length) {
        if (b[p] !== 0xff) { p++; continue }
        const marcador = b[p + 1]
        if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) return { h: b.readUInt16BE(p + 5), w: b.readUInt16BE(p + 7) }
        if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { p += 2; continue }
        p += 2 + b.readUInt16BE(p + 2)
      }
    }
  } catch { /* ignora */ }
  return null
}

function analisarImagem(b: Buffer, tipo: string, ac: Acumulador) {
  const d = dimensoes(b, tipo)
  if (d && d.w * d.h > MAX_PIXELS) ac.bloquear(`imagem com dimensões absurdas (${d.w}x${d.h}) — possível bomba de descompressão`)
  checarPolyglot(b, tipo, ac)
}

function analisarSvg(texto: string, ac: Acumulador) {
  const t = texto
  if (/<\s*script\b/i.test(t)) ac.bloquear('SVG com <script>')
  if (/[\s"'/]on[a-z]+\s*=/i.test(t)) ac.bloquear('SVG com atributo de evento (on*=)')
  if (/javascript\s*:/i.test(t)) ac.bloquear('SVG com javascript:')
  if (/<\s*foreignObject\b/i.test(t)) ac.bloquear('SVG com foreignObject')
  if (/<\s*(iframe|embed|object|audio|video|link|meta|base|animate|set)\b/i.test(t)) ac.bloquear('SVG com elemento ativo/externo (iframe/object/animate...)')
  if (/<!ENTITY/i.test(t) || /<!DOCTYPE[^>]*\[/i.test(t)) ac.bloquear('SVG com declaração de entidade (XXE)')
  if (/(?:xlink:)?href\s*=\s*["']\s*(?!#|data:image\/(?:png|jpe?g|gif|webp);base64,)[^"']/i.test(t)) ac.bloquear('SVG com referência externa (href)')
  if (/@import|url\(\s*["']?\s*(?:https?:|\/\/|javascript:|data:text)/i.test(t)) ac.bloquear('SVG com CSS que carrega recurso externo')
}

function analisarPdf(b: Buffer, ac: Acumulador) {
  // PDF com lixo antes do cabeçalho %PDF- (truque de polyglot)
  const pos = b.indexOf('%PDF-', 0, 'latin1')
  if (pos > 16) ac.bloquear('PDF com conteúdo estranho antes do cabeçalho (polyglot)')
  const analisa = (texto: string, origem: string) => {
    const t = texto.replace(/#([0-9a-fA-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))) // /J#61vaScript
    if (/\/(?:JavaScript|JS)(?![A-Za-z])/.test(t)) ac.bloquear(`PDF com JavaScript (/JavaScript ou /JS${origem})`)
    if (/\/Launch(?![A-Za-z])/.test(t)) ac.bloquear(`PDF com ação /Launch${origem}`)
    if (/\/EmbeddedFiles?(?![A-Za-z])/.test(t)) ac.bloquear(`PDF com arquivo embutido (/EmbeddedFile)${origem}`)
    if (/\/RichMedia(?![A-Za-z])|\/(?:Flash|Movie|Sound)(?![A-Za-z])/.test(t)) ac.bloquear(`PDF com mídia ativa embutida${origem}`)
    for (const m of t.matchAll(/\/(?:OpenAction|AA)(?![A-Za-z])/g)) {
      const trecho = t.slice(m.index!, m.index! + 500)
      if (/\/S\s*\/(?:JavaScript|Launch|URI|SubmitForm|GoToR|GoToE|ImportData|Rendition)(?![A-Za-z])/.test(trecho)) {
        ac.bloquear(`PDF com /OpenAction//AA suspeito${origem}`)
        break
      }
    }
    if (/\/SubmitForm(?![A-Za-z])/.test(t)) ac.suspeitar(`PDF com formulário que envia dados a servidor externo${origem}`)
  }
  const bruto = b.toString('latin1')
  analisa(bruto, '')
  if (/\/Encrypt(?![A-Za-z])/.test(bruto)) ac.suspeitar('PDF criptografado: conteúdo não pôde ser inspecionado')
  // Fluxos de objetos comprimidos (/ObjStm) podem esconder as ações acima: descomprime (com limite) e re-analisa.
  let total = 0
  let n = 0
  for (const m of bruto.matchAll(/stream\r?\n/g)) {
    if (n >= 60 || total > 20 * 1024 * 1024) break
    const ini = m.index! + m[0].length
    const dict = bruto.slice(Math.max(0, m.index! - 400), m.index!)
    if (!/\/ObjStm/.test(dict.slice(dict.lastIndexOf('obj')))) continue
    const fim = bruto.indexOf('endstream', ini)
    if (fim < 0) continue
    n++
    try {
      const out = inflateSync(b.subarray(ini, fim), { maxOutputLength: 5 * 1024 * 1024, finishFlush: 2 /* Z_SYNC_FLUSH */ })
      total += out.length
      analisa(out.toString('latin1'), ' (em fluxo comprimido)')
    } catch { ac.avisos.push('fluxo de objetos do PDF não pôde ser descomprimido') }
  }
}

function analisarOle(b: Buffer, ac: Acumulador) {
  // Nomes de streams do formato OLE são UTF-16LE: "_VBA_PROJECT" (Excel/Word/PowerPoint) ou storage "Macros" + "VBA" (Word).
  const u = (t: string) => Buffer.from(t, 'utf16le')
  if (b.includes(u('_VBA_PROJECT')) || (b.includes(u('Macros')) && b.includes(u('VBA')))) ac.bloquear('documento Office com macros VBA')
  if (b.includes(u('Ole10Native'))) ac.suspeitar('documento Office com objeto OLE embutido (Ole10Native)')
}

function analisarRtf(texto: string, ac: Acumulador) {
  if (/\\(?:objdata|objemb|objautlink|objupdate)\b|\\\*\\objclass/i.test(texto)) ac.bloquear('RTF com objeto embutido (vetor comum de exploits)')
}

function analisarTexto(texto: string, ext: string, ac: Acumulador) {
  const html = textoEhHtmlOuScript(texto)
  if (html) ac.bloquear(html)
  if (/<\?php\b|<%@|<%=/i.test(texto)) ac.bloquear('código de servidor (PHP/ASP/JSP) dentro de arquivo de texto')
  if (/WScript\.Shell|ActiveXObject\s*\(|Invoke-Expression|\bIEX\s*\(|powershell(?:\.exe)?\s+-(?:e|enc|encodedcommand|nop|w\s+hidden)\b|mshta(?:\.exe)?\s+(?:https?:|vbscript:|javascript:)|regsvr32\s+\/s|cmd(?:\.exe)?\s+\/c\s/i.test(texto)) {
    ac.bloquear('comandos de script malicioso (PowerShell/WScript/mshta) dentro de arquivo de texto')
  }
  if (/<\s*script\b/i.test(texto)) ac.suspeitar('texto contém marcação <script>')
  if (['csv', 'tsv', 'txt'].includes(ext)) {
    if (/(^|[\r\n,;\t"])\s*[=+\-@]\s*(?:cmd|powershell|mshta|msexcel|calc|regsvr32)[^\r\n]{0,40}\|/i.test(texto)) ac.bloquear('planilha com injeção de fórmula/DDE (=cmd|...)')
    else if (/(^|[\r\n,;\t"])\s*=\s*(?:HYPERLINK|WEBSERVICE|IMPORTXML|IMPORTDATA)\s*\(/i.test(texto)) ac.suspeitar('planilha com fórmula que acessa recurso externo')
  }
  if (ext === 'xml' && /<!ENTITY/i.test(texto)) ac.bloquear('XML com declaração de entidade (XXE)')
}

/** Inspeciona um ZIP/OOXML/ODF. Retorna o subtipo detectado (docx, xlsx, pptx, odt..., zip). */
function analisarZip(b: Buffer, ac: Acumulador, profundidade = 0): string {
  let idx
  try {
    idx = lerIndiceZip(b)
  } catch (e) {
    ac.bloquear(e instanceof ZipInvalidoError ? e.message : 'ZIP inválido')
    return 'zip'
  }
  if (idx.zip64) { ac.bloquear('ZIP64 não é aceito'); return 'zip' }
  const { entradas } = idx
  if (entradas.length > MAX_ENTRADAS_ZIP) ac.bloquear(`ZIP com ${entradas.length} entradas (máximo ${MAX_ENTRADAS_ZIP})`)

  let somaDesc = 0
  let somaComp = 0
  for (const e of entradas) {
    somaDesc += e.tamDescomprimido
    somaComp += e.tamComprimido
    if (e.flags & 1) ac.bloquear('ZIP com arquivo protegido por senha (não pode ser inspecionado)')
    const n = e.nome.replace(/\\/g, '/')
    if (/(^|\/)\.\.(\/|$)/.test(n) || n.startsWith('/') || /^[a-zA-Z]:/.test(n)) ac.bloquear('ZIP com caminho malicioso (path traversal)')
    if (!e.diretorio) {
      const nome = checarNomeArquivo(n.split('/').pop() || '')
      if (!nome.ok) ac.bloquear(`ZIP contém arquivo proibido: ${n.split('/').pop()} (${nome.motivo})`)
    }
    if (e.tamComprimido > 0 && e.tamDescomprimido > 1024 * 1024 && e.tamDescomprimido / e.tamComprimido > MAX_RAZAO_ZIP * 10) ac.bloquear('ZIP com entrada de razão de compressão absurda (zip-bomb)')
  }
  if (somaDesc > MAX_DESCOMPRIMIDO) ac.bloquear(`ZIP descompactaria para ${Math.round(somaDesc / 1048576)} MB (limite ${Math.round(MAX_DESCOMPRIMIDO / 1048576)} MB) — possível zip-bomb`)
  if (somaDesc > 5 * 1024 * 1024 && somaComp > 0 && somaDesc / somaComp > MAX_RAZAO_ZIP) ac.bloquear(`ZIP com razão de compressão ${Math.round(somaDesc / somaComp)}:1 (limite ${MAX_RAZAO_ZIP}:1) — possível zip-bomb`)
  if (ac.bloqueios.length) return 'zip'

  const nomes = entradas.map((e) => e.nome.replace(/\\/g, '/'))
  const tem = (re: RegExp) => nomes.some((n) => re.test(n))
  let subtipo = 'zip'
  if (tem(/^\[Content_Types\]\.xml$/)) {
    subtipo = tem(/^word\//) ? 'docx' : tem(/^xl\//) ? 'xlsx' : tem(/^ppt\//) ? 'pptx' : 'zip'
    if (tem(/(^|\/)vbaProject\.bin$/i) || tem(/(^|\/)vbaData\.xml$/i) || tem(/^xl\/macrosheets\//i)) ac.bloquear('documento Office com macros (vbaProject.bin)')
    if (tem(/(^|\/)activeX\//i)) ac.bloquear('documento Office com controles ActiveX')
    const ct = entradas.find((e) => e.nome === '[Content_Types].xml')
    const conteudo = ct ? safeLer(b, ct, 1024 * 1024) : null
    if (conteudo && /macroEnabled/i.test(conteudo.toString('utf8'))) ac.bloquear('documento Office habilitado para macros (macroEnabled)')
    for (const e of entradas.filter((x) => /\.rels$/i.test(x.nome) && x.tamDescomprimido < 262144)) {
      const r = safeLer(b, e, 262144)?.toString('utf8') || ''
      if (/attachedTemplate[^>]*TargetMode="External"|TargetMode="External"[^>]*attachedTemplate/i.test(r)) ac.bloquear('documento Office com modelo remoto (template injection)')
      if (/oleObject[^>]*TargetMode="External"|TargetMode="External"[^>]*oleObject/i.test(r)) ac.bloquear('documento Office com objeto OLE remoto')
    }
    if (tem(/(^|\/)embeddings\//i)) ac.suspeitar('documento Office com objetos embutidos')
  } else if (nomes[0] === 'mimetype') {
    const mt = safeLer(b, entradas[0], 256)?.toString('latin1') || ''
    subtipo = /text$/.test(mt) ? 'odt' : /spreadsheet$/.test(mt) ? 'ods' : /presentation$/.test(mt) ? 'odp' : 'zip'
    if (tem(/^Scripts\//i) || tem(/^Basic\//i)) ac.bloquear('documento OpenDocument com macros/scripts')
  }
  if (tem(/^META-INF\/MANIFEST\.MF$/i) && tem(/\.class$/i)) ac.bloquear('pacote Java (JAR) dentro do ZIP')
  if (tem(/^AndroidManifest\.xml$/i)) ac.bloquear('pacote Android (APK) dentro do ZIP')

  // Conteúdo das entradas: executáveis, EICAR, ZIP aninhado.
  let inspecionadas = 0
  for (const e of entradas) {
    if (e.diretorio || inspecionadas >= 400) continue
    inspecionadas++
    let amostra: Buffer | null = null
    try { amostra = lerEntrada(b, e, 2048, true) } catch (err) { ac.bloquear((err as Error).message); continue }
    if (!amostra) continue
    const perigo = detectarPerigoBinario(amostra)
    if (perigo) ac.bloquear(`ZIP contém ${perigo}: ${e.nome.split('/').pop()}`)
    if (amostra.includes(ASSINATURA_EICAR, 0, 'latin1')) ac.bloquear('assinatura de teste EICAR dentro do ZIP')
    if (amostra.length >= 4 && amostra[0] === 0x50 && amostra[1] === 0x4b && amostra[2] === 3 && amostra[3] === 4) {
      if (profundidade >= 2) { ac.bloquear('ZIP com aninhamento excessivo (>2 níveis)'); continue }
      if (e.tamDescomprimido > 20 * 1024 * 1024) { ac.suspeitar('ZIP aninhado grande não inspecionado'); continue }
      let interno: Buffer | null = null
      try { interno = lerEntrada(b, e, Math.max(e.tamDescomprimido, 1) + 1024) } catch (err) { ac.bloquear((err as Error).message); continue }
      if (interno) analisarZip(interno, ac, profundidade + 1)
    }
  }
  return subtipo
}

function safeLer(b: Buffer, e: EntradaZip, max: number): Buffer | null {
  try { return lerEntrada(b, e, max) } catch { return null }
}

// ---------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------

const GENERICOS = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/x-download', 'application/force-download', 'application/unknown'])
const ALIAS_MIME: Record<string, string> = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/mp3': 'audio/mpeg', 'video/x-m4v': 'video/mp4', 'video/quicktime': 'video/mp4', 'image/x-png': 'image/png' }

function mimeDivergente(declarado: string, tipoId: string): boolean {
  const d = ALIAS_MIME[declarado] || declarado
  const t = TIPOS[tipoId]
  if (!t || GENERICOS.has(d) || d.startsWith('multipart/')) return false
  if (d.startsWith('image/')) {
    if (['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff'].includes(d)) return t.mime !== d
    return t.categoria !== 'imagem' && t.categoria !== 'clinico'
  }
  if (d === 'application/pdf') return tipoId !== 'pdf'
  if (d.startsWith('video/')) return t.categoria !== 'video'
  if (d.startsWith('audio/')) return t.categoria !== 'audio'
  if (d === 'application/zip' || d === 'application/x-zip-compressed') return !ehFamiliaZip(tipoId)
  if (d === 'application/dicom') return tipoId !== 'dicom'
  for (const k of ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp']) if (d === TIPOS[k].mime) return tipoId !== k && tipoId !== 'zip'
  if (d.startsWith('text/') || d === 'application/json' || d === 'application/xml') return tipoId !== 'texto' && tipoId !== 'svg'
  return false
}

const TODAS: Categoria[] = ['imagem', 'documento', 'planilha', 'apresentacao', 'texto', 'video', 'audio', 'compactado', 'clinico']

function montar(ac: Acumulador, extra: Partial<ScanResult>): ScanResult {
  const veredito: Veredito = ac.bloqueios.length ? 'BLOQUEADO' : ac.suspeitas.length ? 'SUSPEITO' : 'LIMPO'
  const motivos = [...ac.bloqueios, ...ac.suspeitas]
  return { ok: veredito !== 'BLOQUEADO', veredito, motivo: motivos[0], motivos, avisos: ac.avisos, ...extra }
}

/** Varredura SÍNCRONA e local (sem rede): nome, tipo real, allowlist, conteúdo perigoso, EICAR. Útil em testes. */
export function analisarLocal(buf: Buffer, opt: { filename?: string; declaredMime?: string; permitir?: Categoria[] } = {}): ScanResult {
  const ac = new Acumulador()
  const nome = checarNomeArquivo(opt.filename || '')
  if (!nome.ok) ac.bloquear(nome.motivo!)
  const ext = nome.ext
  const declarado = String(opt.declaredMime || '').toLowerCase().split(';')[0].trim()
  if (MIMES_BLOQUEADOS.has(declarado)) ac.bloquear(`tipo MIME ${declarado} não é permitido`)
  if (!buf.length) { ac.bloquear('arquivo vazio'); return montar(ac, { tamanho: 0 }) }

  const perigo = detectarPerigoBinario(buf)
  if (perigo) ac.bloquear(`o conteúdo é ${perigo}, mesmo que o nome/tipo informado diga outra coisa`)
  if (buf.includes(ASSINATURA_EICAR, 0, 'latin1')) ac.bloquear('assinatura de teste antivírus EICAR detectada')

  let tipo = detectarTipo(buf)
  if (!tipo) {
    if (!perigo) ac.bloquear('tipo de arquivo não reconhecido/permitido')
    return montar(ac, { tamanho: buf.length })
  }

  if (tipo === 'zip') tipo = analisarZip(buf, ac)
  const info = TIPOS[tipo]

  // allowlist de categoria e tamanho
  const permitidas = opt.permitir?.length ? opt.permitir : TODAS
  if (!permitidas.includes(info.categoria)) ac.bloquear(`arquivos do tipo "${info.categoria}" não são aceitos neste campo`)
  if (buf.length > LIMITE_BYTES[info.categoria]) ac.bloquear(`arquivo acima do limite de ${Math.round(LIMITE_BYTES[info.categoria] / 1048576)} MB para ${info.categoria}`)

  // extensão x conteúdo
  if (ext) {
    const compat = info.exts.includes(ext) || (ext === 'zip' && ehFamiliaZip(tipo)) || (tipo === 'texto' && ['txt', 'csv', 'tsv', 'md', 'json', 'xml', 'log'].includes(ext))
    const extConhecida = Object.values(TIPOS).some((t) => t.exts.includes(ext))
    if (!extConhecida) ac.bloquear(`extensão .${ext} não está na lista de tipos permitidos`)
    else if (!compat) ac.bloquear(`o conteúdo é ${info.id.toUpperCase()}, mas a extensão informada é .${ext} (divergência extensão x conteúdo)`)
  }
  if (declarado && mimeDivergente(declarado, tipo)) ac.bloquear(`o conteúdo é ${info.mime}, mas o tipo informado é ${declarado} (divergência)`)

  // conteúdo por tipo
  if (info.categoria === 'imagem' && tipo !== 'svg') analisarImagem(buf, tipo, ac)
  if (tipo === 'svg') analisarSvg(textoDe(buf), ac)
  if (tipo === 'pdf') { analisarPdf(buf, ac); checarPolyglot(buf, 'pdf', ac) }
  if (tipo === 'ole') analisarOle(buf, ac)
  if (tipo === 'rtf') analisarRtf(textoDe(buf), ac)
  if (tipo === 'texto') analisarTexto(textoDe(buf), ext, ac)
  if (['mp4', 'm4a', 'webm', 'mp3', 'wav', 'ogg', 'flac', 'dicom', 'tiff', 'bmp', 'heic'].includes(tipo)) checarPolyglot(buf, tipo, ac)

  return montar(ac, { tamanho: buf.length, tipo, mime: info.mime, categoria: info.categoria })
}

export async function scanUpload(input: ScanInput): Promise<ScanResult> {
  const ctx = input.contexto || {}
  const registrar = ctx.registrar !== false
  const finalizar = async (r: ScanResult, nome?: string) => {
    if (registrar) await registrarVeredito(r, { nome, mime: input.declaredMime, ctx })
    return r
  }

  // --- somente URL ---
  if (input.data == null && input.url != null) {
    const ac = new Acumulador()
    const v = await validarUrlExternaDns(input.url)
    if (!v.ok) ac.bloquear(v.motivo || 'URL não permitida')
    else {
      const nomeUrl = decodeURIComponent(v.url!.pathname.split('/').pop() || '')
      const n = checarNomeArquivo(nomeUrl)
      if (!n.ok) ac.bloquear(`o link aponta para um arquivo proibido (${n.motivo})`)
      const mod = moderarTexto(input.url)
      if (mod.acao === 'BLOQUEAR') ac.bloquear(`link para domínio bloqueado (${mod.motivos[0]})`)
      else if (mod.acao === 'REVISAR') ac.suspeitar(`link suspeito: ${mod.motivos[0]}`)
    }
    const r = montar(ac, {})
    if (registrar && r.veredito !== 'LIMPO') {
      await registrarEvento({
        tenantId: ctx.tenantId, userId: ctx.userId, ip: ctx.ip, tipo: r.veredito === 'BLOQUEADO' ? 'url_bloqueada' : 'url_suspeita',
        severidade: 'ATENCAO', detalhe: { origem: ctx.origem, motivo: r.motivo, host: safeHost(input.url!) },
      })
    }
    return r
  }

  // --- conteúdo ---
  let buf: Buffer
  let declarado = input.declaredMime
  if (Buffer.isBuffer(input.data)) buf = input.data
  else if (typeof input.data === 'string') {
    const d = lerDataUrl(input.data)
    if (!d) return finalizar(montar(Object.assign(new Acumulador(), { bloqueios: ['data URL inválida'] }), {}), input.filename)
    buf = d.buffer
    declarado = declarado || d.mime
  } else {
    return montar(Object.assign(new Acumulador(), { bloqueios: ['nenhum arquivo informado'] }), {})
  }

  const sha256 = createHash('sha256').update(buf).digest('hex')
  const local = analisarLocal(buf, { filename: input.filename, declaredMime: declarado, permitir: input.permitir })
  local.sha256 = sha256
  if (local.veredito === 'BLOQUEADO') return finalizar(local, input.filename)

  const ac = new Acumulador()
  ac.suspeitas.push(...local.motivos)
  ac.avisos.push(...local.avisos)

  // Cache por hash no tenant: arquivo já recusado antes continua recusado; já limpo pula as camadas externas (rede/IA).
  let jaLimpo = false
  if (registrar && ctx.tenantId) {
    try {
      const antes = await prisma.segArquivoVerificado.findFirst({ where: { tenantId: ctx.tenantId, sha256, veredito: { in: ['BLOQUEADO', 'LIMPO'] } }, orderBy: { createdAt: 'desc' } })
      if (antes?.veredito === 'BLOQUEADO' && antes.motivo && !antes.motivo.startsWith('moderação indisponível')) {
        ac.bloquear(antes.motivo)
        return finalizar(montar(ac, { sha256, tamanho: buf.length, tipo: local.tipo, mime: local.mime, categoria: local.categoria }), input.filename)
      }
      jaLimpo = antes?.veredito === 'LIMPO'
    } catch { /* tabela ausente: segue sem cache */ }
  }

  if (!jaLimpo) {
    // ClamAV (opcional)
    if (clamavConfigurado()) {
      const av = await varrerClamav(buf)
      if (av.estado === 'infectado') ac.bloquear(`antivírus ClamAV detectou: ${av.assinatura}`)
      else if (av.estado === 'indisponivel') ac.avisos.push(`ClamAV indisponível (${av.motivo})`)
    }
    // VirusTotal por hash (opcional)
    if (!ac.bloqueios.length && process.env.VIRUSTOTAL_API_KEY) {
      const vt = await consultarVirusTotal(sha256)
      if (vt.estado === 'infectado') ac.bloquear(`VirusTotal: ${vt.assinatura}`)
      else if (vt.estado === 'indisponivel') ac.avisos.push(`VirusTotal indisponível (${vt.motivo})`)
    }
    // Moderação de imagem por IA
    const ehRaster = local.categoria === 'imagem' && local.tipo !== 'svg'
    if (!ac.bloqueios.length && ehRaster && input.moderar !== false) {
      const pol = politicaModeracao()
      const m = await moderarImagem(buf, local.mime || '')
      if (m.estado === 'bloquear') ac.bloquear(`imagem recusada pela moderação: ${m.motivo}`)
      else if (m.estado === 'revisar') {
        ac.suspeitar(`imagem para revisão: ${m.motivo}`)
        if (registrar) await registrarEvento({ tenantId: ctx.tenantId, userId: ctx.userId, ip: ctx.ip, tipo: 'moderacao_revisao', severidade: 'ATENCAO', detalhe: { sha256, origem: ctx.origem, motivo: m.motivo } })
      } else if (m.estado === 'indisponivel' && pol !== 'off') {
        if (pol === 'strict') ac.bloquear(`moderação indisponível (${m.motivo}) e UPLOAD_MODERATION=strict: imagem recusada`)
        else {
          ac.suspeitar(`moderação indisponível: ${m.motivo}`)
          if (registrar && deveRegistrarComLimite(`mod-indisp:${ctx.tenantId}`, 10 * 60_000)) {
            await registrarEvento({ tenantId: ctx.tenantId, userId: ctx.userId, ip: ctx.ip, tipo: 'moderacao_indisponivel', detalhe: { sha256, origem: ctx.origem, motivo: m.motivo } })
          }
        }
      }
    }
  }

  const r = montar(ac, { sha256, tamanho: buf.length, tipo: local.tipo, mime: local.mime, categoria: local.categoria })
  return finalizar(r, input.filename)
}

function safeHost(u: string) { try { return new URL(u).hostname } catch { return '?' } }

async function registrarVeredito(r: ScanResult, d: { nome?: string; mime?: string; ctx: ContextoVarredura }) {
  try {
    if (r.sha256) {
      await prisma.segArquivoVerificado.create({
        data: {
          tenantId: d.ctx.tenantId || 'global', sha256: r.sha256, veredito: r.veredito, motivo: r.motivos.join('; ').slice(0, 500) || null,
          tamanho: r.tamanho ?? 0, tipoDetectado: r.tipo ?? null, nomeOriginal: d.nome ? d.nome.slice(0, 200) : null,
          mimeDeclarado: d.mime ? String(d.mime).slice(0, 100) : null, origem: d.ctx.origem?.slice(0, 120) ?? null, userId: d.ctx.userId ?? null,
        },
      })
    }
  } catch (e: any) {
    console.warn('[seguranca] não foi possível registrar veredito de arquivo:', String(e?.code || e?.message).slice(0, 100))
  }
  if (r.veredito === 'BLOQUEADO' || (r.veredito === 'SUSPEITO' && !r.motivo?.startsWith('moderação indisponível'))) {
    await registrarEvento({
      tenantId: d.ctx.tenantId, userId: d.ctx.userId, ip: d.ctx.ip, tipo: r.veredito === 'BLOQUEADO' ? 'upload_bloqueado' : 'upload_suspeito',
      severidade: r.veredito === 'BLOQUEADO' ? 'ATENCAO' : 'INFO',
      detalhe: { origem: d.ctx.origem, nome: d.nome, tipo: r.tipo, tamanho: r.tamanho, sha256: r.sha256, motivos: r.motivos.slice(0, 5) },
    })
  }
}

/** Mensagem em português para respostas 422. */
export function mensagemBloqueio(r: ScanResult): string {
  return `Arquivo bloqueado pela verificação de segurança: ${r.motivo || 'conteúdo não permitido'}.`
}

/** Lança erro 422 (compatível com academicErrorHandler) se o arquivo/URL for bloqueado. */
export async function assertUploadSeguro(input: ScanInput): Promise<ScanResult> {
  const r = await scanUpload(input)
  if (!r.ok) throw Object.assign(new Error(mensagemBloqueio(r)), { status: 422, scan: r })
  return r
}

// Verificação só de METADADOS (uploads por URL pré-assinada, em que o servidor não recebe os bytes).
export function checarMetadadosArquivo(m: { filename?: string; mime?: string }): ScanResult {
  const ac = new Acumulador()
  const n = checarNomeArquivo(m.filename || '')
  if (!n.ok) ac.bloquear(n.motivo!)
  const d = String(m.mime || '').toLowerCase().split(';')[0].trim()
  if (MIMES_BLOQUEADOS.has(d)) ac.bloquear(`tipo MIME ${d} não é permitido`)
  return montar(ac, {})
}

export { extensaoDe }
export type { Categoria }
export { pareceTexto }
