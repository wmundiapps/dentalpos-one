// ============================================================
// Detecção de tipo REAL por magic bytes + listas de bloqueio. Funções puras (sem I/O).
// ============================================================

export type Categoria = 'imagem' | 'documento' | 'planilha' | 'apresentacao' | 'texto' | 'video' | 'audio' | 'compactado' | 'clinico'

export interface Tipo { id: string; mime: string; categoria: Categoria; exts: string[] }

const T = (id: string, mime: string, categoria: Categoria, exts: string[]): Tipo => ({ id, mime, categoria, exts })

export const TIPOS: Record<string, Tipo> = {
  png: T('png', 'image/png', 'imagem', ['png']),
  jpeg: T('jpeg', 'image/jpeg', 'imagem', ['jpg', 'jpeg', 'jpe', 'jfif']),
  gif: T('gif', 'image/gif', 'imagem', ['gif']),
  webp: T('webp', 'image/webp', 'imagem', ['webp']),
  bmp: T('bmp', 'image/bmp', 'imagem', ['bmp']),
  tiff: T('tiff', 'image/tiff', 'imagem', ['tif', 'tiff']),
  heic: T('heic', 'image/heic', 'imagem', ['heic', 'heif', 'avif']),
  svg: T('svg', 'image/svg+xml', 'imagem', ['svg']),
  dicom: T('dicom', 'application/dicom', 'clinico', ['dcm', 'dicom']),
  pdf: T('pdf', 'application/pdf', 'documento', ['pdf']),
  docx: T('docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'documento', ['docx', 'dotx']),
  xlsx: T('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'planilha', ['xlsx', 'xltx']),
  pptx: T('pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'apresentacao', ['pptx', 'potx']),
  odt: T('odt', 'application/vnd.oasis.opendocument.text', 'documento', ['odt', 'ott']),
  ods: T('ods', 'application/vnd.oasis.opendocument.spreadsheet', 'planilha', ['ods', 'ots']),
  odp: T('odp', 'application/vnd.oasis.opendocument.presentation', 'apresentacao', ['odp', 'otp']),
  ole: T('ole', 'application/x-ole-storage', 'documento', ['doc', 'xls', 'ppt', 'dot']),
  rtf: T('rtf', 'application/rtf', 'documento', ['rtf']),
  texto: T('texto', 'text/plain', 'texto', ['txt', 'csv', 'tsv', 'md', 'json', 'xml', 'log']),
  zip: T('zip', 'application/zip', 'compactado', ['zip']),
  mp4: T('mp4', 'video/mp4', 'video', ['mp4', 'm4v', 'mov', '3gp']),
  m4a: T('m4a', 'audio/mp4', 'audio', ['m4a']),
  webm: T('webm', 'video/webm', 'video', ['webm', 'mkv']),
  mp3: T('mp3', 'audio/mpeg', 'audio', ['mp3']),
  wav: T('wav', 'audio/wav', 'audio', ['wav']),
  ogg: T('ogg', 'audio/ogg', 'audio', ['ogg', 'oga', 'opus']),
  flac: T('flac', 'audio/flac', 'audio', ['flac']),
}

/** Tipos cuja extensão do nome pode divergir de forma inofensiva (ex.: .docx dentro de .zip). */
const ZIP_FAMILIA = new Set(['zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'])
export const ehFamiliaZip = (id: string) => ZIP_FAMILIA.has(id)

export const LIMITE_BYTES: Record<Categoria, number> = {
  imagem: 15 * 1024 * 1024,
  clinico: 200 * 1024 * 1024,
  documento: 30 * 1024 * 1024,
  planilha: 30 * 1024 * 1024,
  apresentacao: 50 * 1024 * 1024,
  texto: 5 * 1024 * 1024,
  video: 300 * 1024 * 1024,
  audio: 60 * 1024 * 1024,
  compactado: 50 * 1024 * 1024,
}

// ---------- extensões ----------

export const EXT_BLOQUEADAS = new Set([
  'exe', 'dll', 'bat', 'cmd', 'com', 'pif', 'scr', 'cpl', 'msi', 'msp', 'mst', 'lnk', 'reg', 'inf', 'hta', 'htm', 'html', 'xhtml', 'shtml', 'mht', 'mhtml',
  'ps1', 'psm1', 'psd1', 'sh', 'bash', 'zsh', 'csh', 'ksh', 'js', 'mjs', 'cjs', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ws', 'sct', 'jar', 'war', 'class',
  'apk', 'aab', 'ipa', 'app', 'dmg', 'pkg', 'deb', 'rpm', 'run', 'bin', 'elf', 'so', 'dylib', 'appimage', 'gadget', 'swf', 'jnlp', 'chm', 'cab',
  'py', 'pyc', 'pl', 'rb', 'php', 'phtml', 'php3', 'php4', 'php5', 'phar', 'asp', 'aspx', 'ashx', 'jsp', 'jspx', 'cgi', 'vb', 'wsc', 'xll', 'iso', 'vhd', 'vhdx',
  'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'ppsm', 'sldm', 'xlsb', 'svgz',
])
/** Em extensões INTERMEDIÁRIAS (dupla extensão) estas são comuns em nomes legítimos (ex.: "site.com.pdf"); só valem como extensão final. */
const EXT_AMBIGUAS = new Set(['com', 'app', 'bin', 'run', 'so', 'inf', 'ws', 'pkg', 'vb', 'class', 'cab', 'iso'])

const CTRL_OU_BIDI = /[\u0000-\u001f\u007f‪-‮⁦-⁩‎‏]/

export function extensaoDe(nome: string): string {
  const base = String(nome || '').split(/[\\/]/).pop() || ''
  const i = base.lastIndexOf('.')
  const ext = i > 0 && i < base.length - 1 ? base.slice(i + 1) : ''
  return /^[A-Za-z0-9]{1,10}$/.test(ext) ? ext.toLowerCase() : ''
}

export function checarNomeArquivo(nome: string): { ok: boolean; motivo?: string; ext: string } {
  const bruto = String(nome || '')
  const ext = extensaoDe(bruto)
  if (!bruto) return { ok: true, ext }
  if (CTRL_OU_BIDI.test(bruto)) return { ok: false, motivo: 'nome do arquivo contém caracteres de controle/invertidos (disfarce de extensão)', ext }
  if (/[. ]$/.test(bruto)) return { ok: false, motivo: 'nome do arquivo termina em ponto ou espaço (disfarce de extensão)', ext }
  const base = bruto.split(/[\\/]/).pop() || ''
  const partes = base.split('.')
  if (EXT_BLOQUEADAS.has(ext)) return { ok: false, motivo: `extensão .${ext} não é permitida`, ext }
  if (partes.length > 2) {
    const inter = partes.slice(1, -1).map((p) => p.toLowerCase().trim())
    const ruim = inter.find((p) => EXT_BLOQUEADAS.has(p) && !EXT_AMBIGUAS.has(p))
    if (ruim) return { ok: false, motivo: `dupla extensão suspeita (.${ruim} dentro do nome)`, ext }
  }
  return { ok: true, ext }
}

export const MIMES_BLOQUEADOS = new Set([
  'application/x-msdownload', 'application/x-msdos-program', 'application/x-dosexec', 'application/vnd.microsoft.portable-executable', 'application/x-executable',
  'application/x-sh', 'application/x-shellscript', 'text/x-shellscript', 'application/x-csh', 'application/x-bat', 'application/x-msi', 'application/x-ms-installer',
  'application/java-archive', 'application/x-java-archive', 'application/vnd.android.package-archive', 'application/x-apple-diskimage',
  'application/javascript', 'text/javascript', 'application/x-javascript', 'application/ecmascript', 'text/vbscript', 'application/x-powershell',
  'text/html', 'application/xhtml+xml', 'application/hta', 'application/x-httpd-php', 'application/x-php', 'text/x-php', 'application/x-python-code',
  'application/vnd.ms-word.document.macroenabled.12', 'application/vnd.ms-excel.sheet.macroenabled.12', 'application/vnd.ms-powerpoint.presentation.macroenabled.12',
  'application/x-shockwave-flash', 'application/x-ms-shortcut',
])

// ---------- detecção ----------

export type Perigo = 'executavel Windows (PE)' | 'executável Linux (ELF)' | 'executável macOS (Mach-O)' | 'classe/binário Java' | 'script com shebang (#!)' | 'atalho do Windows (.lnk)' | 'pacote Android (dex)' | 'instalador/cabinet (CAB/MSI)'

const startsWith = (b: Buffer, ...bytes: number[]) => bytes.every((v, i) => b[i] === v)
const ascii = (b: Buffer, ini: number, s: string) => b.length >= ini + s.length && b.toString('latin1', ini, ini + s.length) === s

/** Executáveis/scripts binários identificados pelo conteúdo, independentemente do nome. */
export function detectarPerigoBinario(b: Buffer): Perigo | null {
  if (b.length < 4) return null
  if (b[0] === 0x4d && b[1] === 0x5a) { // "MZ"
    if (b.length >= 64) {
      const pe = b.readUInt32LE(0x3c)
      if (pe > 0 && pe + 4 <= b.length && b.toString('latin1', pe, pe + 4) === 'PE\0\0') return 'executavel Windows (PE)'
    }
    if (b.toString('latin1', 0, Math.min(b.length, 512)).includes('This program cannot be run in DOS mode')) return 'executavel Windows (PE)'
    if (b.length < 64) return null
  }
  if (startsWith(b, 0x7f, 0x45, 0x4c, 0x46)) return 'executável Linux (ELF)'
  if (startsWith(b, 0xfe, 0xed, 0xfa, 0xce) || startsWith(b, 0xfe, 0xed, 0xfa, 0xcf) || startsWith(b, 0xce, 0xfa, 0xed, 0xfe) || startsWith(b, 0xcf, 0xfa, 0xed, 0xfe)) return 'executável macOS (Mach-O)'
  if (startsWith(b, 0xca, 0xfe, 0xba, 0xbe)) return 'classe/binário Java'
  if (b[0] === 0x23 && b[1] === 0x21) return 'script com shebang (#!)'
  if (startsWith(b, 0x4c, 0, 0, 0, 0x01, 0x14, 0x02, 0)) return 'atalho do Windows (.lnk)'
  if (ascii(b, 0, 'dex\n')) return 'pacote Android (dex)'
  if (ascii(b, 0, 'MSCF')) return 'instalador/cabinet (CAB/MSI)'
  return null
}

/** Heurística de "é texto" (sem NUL, poucos caracteres de controle). Aceita UTF-8 e UTF-16 com BOM. */
export function pareceTexto(b: Buffer): boolean {
  if (!b.length) return true
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return true
  const n = Math.min(b.length, 16384)
  let ctrl = 0
  for (let i = 0; i < n; i++) {
    const c = b[i]
    if (c === 0) return false
    if (c < 9 || (c > 13 && c < 32)) ctrl++
  }
  return ctrl / n < 0.01
}

export function textoDe(b: Buffer, max = 2_000_000): string {
  const fatia = b.subarray(0, max)
  if (fatia[0] === 0xff && fatia[1] === 0xfe) return fatia.toString('utf16le')
  return fatia.toString('utf8')
}

/** Tipo pelos magic bytes. Retorna id de TIPOS ou null (desconhecido). Zip é refinado depois (OOXML/ODF). */
export function detectarTipo(b: Buffer): string | null {
  if (b.length < 4) return b.length && pareceTexto(b) ? 'texto' : null
  if (startsWith(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png'
  if (startsWith(b, 0xff, 0xd8, 0xff)) return 'jpeg'
  if (ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a')) return 'gif'
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return 'webp'
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE')) return 'wav'
  if (startsWith(b, 0x49, 0x49, 0x2a, 0x00) || startsWith(b, 0x4d, 0x4d, 0x00, 0x2a)) return 'tiff'
  if (b[0] === 0x42 && b[1] === 0x4d && b.length > 30 && [12, 40, 52, 56, 108, 124].includes(b.readUInt32LE(14))) return 'bmp'
  if (b.length > 132 && ascii(b, 128, 'DICM')) return 'dicom'
  // PDF: o cabeçalho pode vir até o byte 1024 (spec), mas qualquer lixo antes é suspeito e tratado em uploads.ts.
  if (b.toString('latin1', 0, Math.min(b.length, 1024)).includes('%PDF-')) return 'pdf'
  if (ascii(b, 0, '{\\rtf')) return 'rtf'
  if (startsWith(b, 0x50, 0x4b, 0x03, 0x04) || startsWith(b, 0x50, 0x4b, 0x05, 0x06)) return 'zip'
  if (startsWith(b, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return 'ole'
  if (ascii(b, 4, 'ftyp')) {
    const marca = b.toString('latin1', 8, 12)
    if (marca === 'M4A ' || marca === 'M4B ') return 'm4a'
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1', 'avif'].includes(marca)) return 'heic'
    return 'mp4'
  }
  if (startsWith(b, 0x1a, 0x45, 0xdf, 0xa3)) return 'webm'
  if (ascii(b, 0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) return 'mp3'
  if (ascii(b, 0, 'OggS')) return 'ogg'
  if (ascii(b, 0, 'fLaC')) return 'flac'
  if (pareceTexto(b)) {
    const ini = textoDe(b.subarray(0, 4096)).replace(/^﻿/, '').trimStart().toLowerCase()
    if (ini.startsWith('<svg') || (/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg\b/.test(ini))) return 'svg'
    return 'texto'
  }
  return null
}

/** Texto que é, na verdade, HTML/script disfarçado de .txt/.csv/etc. */
export function textoEhHtmlOuScript(texto: string): string | null {
  const ini = texto.replace(/^﻿/, '').trimStart().slice(0, 4000).toLowerCase()
  if (/^(<!doctype\s+html|<html\b|<head\b|<body\b|<script\b|<iframe\b|<meta\b|<frameset\b|<object\b|<embed\b|<form\b|<link\b|<style\b)/.test(ini)) return 'HTML/script disfarçado de texto'
  if (/^<\?xml[^>]*\?>\s*<(html|!doctype html)/.test(ini)) return 'XHTML disfarçado de texto'
  return null
}
