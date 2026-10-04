import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// ============================================================
// TOTP (RFC 6238) / HOTP (RFC 4226) com node:crypto — sem dependências externas.
// Padrão: SHA-1, 6 dígitos, passo de 30 s, janela de tolerância ±1 passo.
// ============================================================

const ALFABETO_B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let valor = 0
  let out = ''
  for (const byte of buf) {
    valor = (valor << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALFABETO_B32[(valor >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALFABETO_B32[(valor << (5 - bits)) & 31]
  return out
}

export function base32Decode(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/=+$/g, '').replace(/[\s-]/g, '')
  let bits = 0
  let valor = 0
  const bytes: number[] = []
  for (const ch of limpo) {
    const idx = ALFABETO_B32.indexOf(ch)
    if (idx < 0) throw new Error('Segredo base32 inválido.')
    valor = (valor << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** Gera um segredo aleatório de 160 bits (20 bytes) em base32 (32 caracteres), como recomenda a RFC 4226. */
export function gerarSegredoBase32(): string {
  return base32Encode(randomBytes(20))
}

/** HOTP (RFC 4226). `segredo` em bytes. */
export function hotp(segredo: Buffer, contador: number, digitos = 6, algoritmo: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(contador))
  const h = createHmac(algoritmo, segredo).update(msg).digest()
  const offset = h[h.length - 1] & 0x0f
  const bin =
    ((h[offset] & 0x7f) << 24) | ((h[offset + 1] & 0xff) << 16) | ((h[offset + 2] & 0xff) << 8) | (h[offset + 3] & 0xff)
  return String(bin % 10 ** digitos).padStart(digitos, '0')
}

export const PASSO_SEGUNDOS = 30

export function passoAtual(agoraMs = Date.now(), passo = PASSO_SEGUNDOS): number {
  return Math.floor(agoraMs / 1000 / passo)
}

/** TOTP (RFC 6238) para o instante informado (em ms). */
export function totp(segredo: Buffer, agoraMs = Date.now(), digitos = 6, passo = PASSO_SEGUNDOS, algoritmo: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  return hotp(segredo, passoAtual(agoraMs, passo), digitos, algoritmo)
}

function iguaisConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export interface OpcoesVerificacao {
  janela?: number          // passos para cada lado (padrão 1)
  agoraMs?: number
  digitos?: number
  /** Último passo já aceito: códigos de passo <= este valor são recusados (anti-reutilização). */
  ultimoPasso?: number | null
}

/**
 * Verifica um código TOTP. Retorna o passo (contador) que casou, ou null.
 * Todas as posições da janela são sempre comparadas (tempo constante em relação ao acerto).
 */
export function verificarTotp(segredoBase32: string, codigo: string, op: OpcoesVerificacao = {}): number | null {
  const digitos = op.digitos ?? 6
  const limpo = String(codigo || '').replace(/\s+/g, '')
  if (!new RegExp(`^\\d{${digitos}}$`).test(limpo)) return null
  const segredo = base32Decode(segredoBase32)
  const janela = op.janela ?? 1
  const atual = passoAtual(op.agoraMs ?? Date.now())
  let achado: number | null = null
  for (let d = -janela; d <= janela; d++) {
    const passo = atual + d
    if (passo < 0) continue
    const esperado = hotp(segredo, passo, digitos)
    const ok = iguaisConstante(esperado, limpo)
    if (ok && achado === null && (op.ultimoPasso == null || passo > op.ultimoPasso)) achado = passo
  }
  return achado
}

export function otpauthUri(params: { segredo: string; conta: string; emissor: string }): string {
  const label = `${encodeURIComponent(params.emissor)}:${encodeURIComponent(params.conta)}`
  const q = new URLSearchParams({ secret: params.segredo, issuer: params.emissor, algorithm: 'SHA1', digits: '6', period: '30' })
  return `otpauth://totp/${label}?${q.toString()}`
}
