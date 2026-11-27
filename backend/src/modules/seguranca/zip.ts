import { constants as zc, inflateRawSync } from 'node:zlib'

// ============================================================
// Leitor mínimo e DEFENSIVO de ZIP (diretório central) para inspeção — não extrai nada em disco.
// Serve para: OOXML/ODF/ZIP (macros, executáveis, path traversal, zip-bomb, ZIP protegido por senha).
// ============================================================

export interface EntradaZip {
  nome: string
  metodo: number
  flags: number
  tamComprimido: number
  tamDescomprimido: number
  offsetLocal: number
  diretorio: boolean
}

export interface IndiceZip {
  entradas: EntradaZip[]
  zip64: boolean
}

export class ZipInvalidoError extends Error {}

export function lerIndiceZip(buf: Buffer): IndiceZip {
  // EOCD: assinatura 0x06054b50 nos últimos 22 + 65535 bytes.
  const minPos = Math.max(0, buf.length - 22 - 65535)
  let eocd = -1
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new ZipInvalidoError('ZIP sem diretório central (arquivo corrompido ou truncado).')
  const total = buf.readUInt16LE(eocd + 10)
  const tamCd = buf.readUInt32LE(eocd + 12)
  const offCd = buf.readUInt32LE(eocd + 16)
  if (total === 0xffff || tamCd === 0xffffffff || offCd === 0xffffffff) return { entradas: [], zip64: true }
  if (offCd + tamCd > buf.length) throw new ZipInvalidoError('Diretório central do ZIP inconsistente.')
  const entradas: EntradaZip[] = []
  let p = offCd
  for (let i = 0; i < total; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipInvalidoError('Entrada de ZIP inválida.')
    const flags = buf.readUInt16LE(p + 8)
    const metodo = buf.readUInt16LE(p + 10)
    const tamComprimido = buf.readUInt32LE(p + 20)
    const tamDescomprimido = buf.readUInt32LE(p + 24)
    const nLen = buf.readUInt16LE(p + 28)
    const eLen = buf.readUInt16LE(p + 30)
    const cLen = buf.readUInt16LE(p + 32)
    const offsetLocal = buf.readUInt32LE(p + 42)
    if (p + 46 + nLen > buf.length) throw new ZipInvalidoError('Nome de entrada do ZIP fora dos limites.')
    // bit 11 = UTF-8; caso contrário CP437 (aproximado por latin1, suficiente para inspeção)
    const nome = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nLen)
    entradas.push({ nome, metodo, flags, tamComprimido, tamDescomprimido, offsetLocal, diretorio: nome.endsWith('/') })
    p += 46 + nLen + eLen + cLen
  }
  return { entradas, zip64: false }
}

/** Lê o conteúdo (até `max` bytes de saída) de uma entrada. Retorna null se não for possível (método exótico, etc.). */
export function lerEntrada(buf: Buffer, e: EntradaZip, max: number, apenasPrefixo = false): Buffer | null {
  const o = e.offsetLocal
  if (o + 30 > buf.length || buf.readUInt32LE(o) !== 0x04034b50) return null
  const ini = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28)
  if (ini > buf.length) return null
  let dados = buf.subarray(ini, Math.min(buf.length, ini + e.tamComprimido))
  if (e.metodo === 0) return dados.subarray(0, max)
  if (e.metodo !== 8) return null
  if (apenasPrefixo) dados = dados.subarray(0, 4096)
  try {
    const out = inflateRawSync(dados, { finishFlush: apenasPrefixo ? zc.Z_SYNC_FLUSH : zc.Z_FINISH, maxOutputLength: apenasPrefixo ? 8 * 1024 * 1024 : max })
    return apenasPrefixo ? out.subarray(0, max) : out
  } catch (err: any) {
    if (err?.code === 'ERR_BUFFER_TOO_LARGE') throw new ZipInvalidoError('Conteúdo descomprimido maior que o declarado (possível zip-bomb).')
    return null
  }
}
