import type { SecurityConfig } from './config'

/** Validação de arquivos enviados pelo usuário: tipo real (assinatura), tamanho e re-codificação segura. */

export class SecurityError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
  }
}

const MB = 1024 * 1024

export type ImageKind = 'jpeg' | 'png' | 'webp'

export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  return null
}

/** Assinaturas de executáveis/scripts/pacotes que NUNCA devem entrar (mesmo renomeados). */
export function sniffDangerous(b: Uint8Array): string | null {
  const t = (n: number) => String.fromCharCode(...b.slice(0, n))
  if (b.length >= 2 && t(2) === 'MZ') return 'executável do Windows'
  if (b.length >= 4 && b[0] === 0x7f && t(4).slice(1) === 'ELF') return 'executável Linux'
  if (b.length >= 4 && (b[0] === 0xcf || b[0] === 0xce || b[0] === 0xca) && b[1] === 0xfa) return 'executável macOS'
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05)) return 'arquivo compactado (ZIP/APK/JAR)'
  if (b.length >= 2 && t(2) === '#!') return 'script'
  if (b.length >= 5 && /^<\?php/i.test(t(5))) return 'script PHP'
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b.slice(0, 256)).trimStart().toLowerCase()
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<script')) return 'documento com marcação ativa (SVG/HTML)'
  if (b.length >= 6 && t(6) === '%PDF-1') return 'PDF'
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'documento Office antigo'
  return null
}

const readHead = async (f: Blob, n = 4096) => new Uint8Array(await f.slice(0, n).arrayBuffer())

/**
 * Foto: valida tamanho, assinatura, dimensões e **re-codifica** em JPEG via canvas — isso descarta metadados
 * (EXIF/GPS) e qualquer carga escondida (polyglots) dentro do arquivo.
 */
export async function sanitizePhoto(file: File, cfg: SecurityConfig): Promise<{ blob: Blob; bitmap: ImageBitmap }> {
  if (file.size > cfg.maxPhotoMB * MB) throw new SecurityError(`Foto maior que ${cfg.maxPhotoMB} MB.`, 'size')
  if (file.size < 512) throw new SecurityError('Arquivo muito pequeno para ser uma foto.', 'size')
  const head = await readHead(file)
  const bad = sniffDangerous(head)
  if (bad) throw new SecurityError(`Arquivo bloqueado: parece ser ${bad}.`, 'dangerous')
  if (!sniffImage(head)) throw new SecurityError('Formato não permitido. Envie JPG, PNG ou WebP.', 'type')
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    throw new SecurityError('A imagem está corrompida ou não pôde ser lida.', 'decode')
  }
  if (bmp.width < 200 || bmp.height < 200 || bmp.width > 16000 || bmp.height > 16000) {
    bmp.close?.()
    throw new SecurityError('Dimensões fora do permitido (mínimo 200 px, máximo 16000 px).', 'dim')
  }
  const k = Math.min(1, 3000 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new SecurityError('Falha ao processar a imagem.', 'decode'))), 'image/jpeg', 0.93))
  const clean = await createImageBitmap(blob)
  return { blob, bitmap: clean }
}

/** Modelo 3D (STL/OBJ/PLY): tamanho, assinaturas perigosas e coerência básica do formato. */
export async function validateModelFile(file: File, cfg: SecurityConfig): Promise<ArrayBuffer> {
  if (file.size > cfg.maxModelMB * MB) throw new SecurityError(`Modelo maior que ${cfg.maxModelMB} MB.`, 'size')
  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (!['stl', 'obj', 'ply'].includes(ext)) throw new SecurityError('Use arquivos STL, OBJ ou PLY.', 'type')
  const buf = await file.arrayBuffer()
  const head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096))
  const bad = sniffDangerous(head)
  if (bad) throw new SecurityError(`Arquivo bloqueado: parece ser ${bad}.`, 'dangerous')
  if (ext === 'stl') {
    const dv = new DataView(buf)
    const nTri = buf.byteLength >= 84 ? dv.getUint32(80, true) : -1
    const binary = nTri >= 0 && 84 + nTri * 50 === buf.byteLength
    const ascii = new TextDecoder().decode(head).trimStart().toLowerCase().startsWith('solid')
    if (!binary && !ascii) throw new SecurityError('STL inválido.', 'format')
    if (binary && nTri > 4_000_000) throw new SecurityError('Modelo com triângulos demais (máx. 4 milhões).', 'size')
  } else if (ext === 'ply') {
    if (new TextDecoder().decode(head.slice(0, 3)) !== 'ply') throw new SecurityError('PLY inválido.', 'format')
  } else {
    // OBJ é texto: sem bytes nulos nem caracteres de controle
    for (let i = 0; i < head.length; i++) if (head[i] === 0) throw new SecurityError('OBJ inválido (conteúdo binário).', 'format')
  }
  return buf
}
