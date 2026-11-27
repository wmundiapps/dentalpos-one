import { createHmac, createHash, randomBytes, timingSafeEqual, scryptSync } from 'crypto'

// ============================================================
// Mascaramento, hash e redação de dados pessoais (LGPD art. 6, III e VII - necessidade e segurança).
// Funções PURAS (sem banco): usadas em listagens, logs e trilhas de auditoria.
// ============================================================

export const soDigitos = (s: unknown) => String(s ?? '').replace(/\D+/g, '')

/** 123.456.789-09 -> ***.456.789-** (mostra só o miolo). */
export function mascararCpf(v: unknown): string {
  const d = soDigitos(v)
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
  if (d.length === 14) return `**.***.${d.slice(5, 8)}/****-**`   // CNPJ
  if (!d) return ''
  return '*'.repeat(Math.max(0, d.length - 2)) + d.slice(-2)
}

export function mascararEmail(v: unknown): string {
  const s = String(v ?? '')
  const i = s.indexOf('@')
  if (i < 1) return s ? '***' : ''
  return `${s[0]}***${s.slice(i)}`
}

export function mascararTelefone(v: unknown): string {
  const d = soDigitos(v)
  if (d.length < 8) return d ? '****' : ''
  return `(**) *****-${d.slice(-4)}`
}

export function mascararNome(v: unknown): string {
  const p = String(v ?? '').trim().split(/\s+/).filter(Boolean)
  if (!p.length) return ''
  return p.map((x, i) => (i === 0 ? x : x[0] + '.')).join(' ')
}

// ------------------------------------------------------------------ redação para logs
const CHAVE_SEGREDO = /(senha|password|passwd|secret|segredo|token|authorization|cookie|apikey|api[-_]?key|otp|recovery|recuperacao|private[-_]?key|credential|credencial|cvv|cartao|card[-_]?number)/i
const CHAVE_CPF = /(^|[^a-z])(cpf|cnpj|documento|doc|rg|nis|pis|ssn)([^a-z]|$)/i
const CHAVE_EMAIL = /(^|[^a-z])e?-?mail([^a-z]|$)/i
const CHAVE_TEL = /(telefone|celular|phone|whatsapp|fone)/i

const RE_CPF = /\b(\d{3})\.(\d{3})\.(\d{3})-(\d{2})\b/g
const RE_CPF_CRU = /(cpf|documento|doc)(["'\s:=]{1,6})(\d{11})\b/gi
const RE_JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g
const RE_BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{8,}/gi
const RE_PAR_SEGREDO = /((?:senha|password|passwd|secret|token|api[-_]?key|authorization|access[-_]?token|refresh[-_]?token)["']?\s*[:=]\s*["']?)([^"'\s&,;}{]{1,200})/gi

/** Mascara CPFs, JWTs, Bearer e pares senha=/token= dentro de um texto livre. */
export function redigirTexto(s: string): string {
  if (!s) return s
  return s
    .replace(RE_JWT, '[jwt-omitido]')
    .replace(RE_BEARER, '$1 [omitido]')
    .replace(RE_PAR_SEGREDO, '$1[omitido]')
    .replace(RE_CPF, '***.$2.$3-**')
    .replace(RE_CPF_CRU, (_m, k, sep, n) => `${k}${sep}***.${n.slice(3, 6)}.${n.slice(6, 9)}-**`)
}

/** Copia profunda com redação: segredos viram [omitido]; CPF/CNPJ/documento mascarados; e-mail e telefone parcialmente. */
export function redigirLog(valor: unknown, profundidade = 0, opts: { email?: boolean } = {}): unknown {
  if (valor == null) return valor
  if (typeof valor === 'string') return redigirTexto(valor.length > 2000 ? valor.slice(0, 2000) + '…' : valor)
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor
  if (valor instanceof Date) return valor.toISOString()
  if (profundidade > 6) return '[...]'
  if (Array.isArray(valor)) return valor.slice(0, 50).map((v) => redigirLog(v, profundidade + 1, opts))
  if (valor instanceof Error) return { name: valor.name, message: redigirTexto(valor.message) }
  if (typeof valor === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CHAVE_SEGREDO.test(k) && typeof v !== 'boolean') out[k] = '[omitido]'
      else if (CHAVE_CPF.test(k) && (typeof v === 'string' || typeof v === 'number')) out[k] = mascararCpf(v)
      else if (opts.email !== false && CHAVE_EMAIL.test(k) && typeof v === 'string') out[k] = mascararEmail(v)
      else if (CHAVE_TEL.test(k) && typeof v === 'string') out[k] = mascararTelefone(v)
      else out[k] = redigirLog(v, profundidade + 1, opts)
    }
    return out
  }
  return String(valor)
}

const QUERY_SEGREDO = /^(token|access_token|refresh_token|id_token|jwt|auth|authorization|senha|password|pass|secret|code|otp|key|apikey|api_key|signature|sig)$/i
const QUERY_CPF = /^(cpf|cnpj|documento|doc|rg)$/i

/** Remove segredos/CPF da query string e CPFs de segmentos do caminho (para o log de acesso HTTP). */
export function sanitizarUrl(url: string): string {
  if (!url) return url
  const [path, query] = url.split('?', 2)
  const p = redigirTexto(path).replace(/\/(\d{11})(?=\/|$)/g, '/***********')
  if (query === undefined) return p
  const q = query.split('&').map((par) => {
    const i = par.indexOf('=')
    if (i < 0) return redigirTexto(par)
    const k = par.slice(0, i)
    let kd = k
    try { kd = decodeURIComponent(k) } catch { /* mantém */ }
    if (QUERY_SEGREDO.test(kd)) return `${k}=[omitido]`
    if (QUERY_CPF.test(kd)) return `${k}=[cpf-omitido]`
    return `${k}=${redigirTexto(par.slice(i + 1))}`
  })
  return `${p}?${q.join('&')}`
}

// ------------------------------------------------------------------ hashes
function chaveHash(): string {
  const k = process.env.LGPD_HASH_KEY || process.env.SECURITY_ENC_KEY || process.env.JWT_SECRET || ''
  if (!k && process.env.NODE_ENV === 'production') throw new Error('Defina LGPD_HASH_KEY (ou JWT_SECRET) para gerar hashes de IP/documento.')
  return k || 'lgpd-dev-key'
}

/** HMAC-SHA256 truncado (pseudonimização de IP/UA/documento; não reversível sem a chave). */
export function hmacCurto(valor: string, tenantId = '', tamanho = 40): string {
  return createHmac('sha256', chaveHash()).update(`${tenantId}|${valor}`).digest('hex').slice(0, tamanho)
}
export const hashIp = (ip: string | undefined | null, tenantId = '') => (ip ? hmacCurto(`ip:${String(ip).replace(/^::ffff:/, '')}`, tenantId, 32) : null)
export const hashUa = (ua: string | undefined | null, tenantId = '') => (ua ? hmacCurto(`ua:${String(ua).slice(0, 300)}`, tenantId, 32) : null)
/** Hash estável do CPF (só dígitos) para localizar o titular sem guardar o número. */
export const hashDocumento = (doc: unknown, tenantId = '') => { const d = soDigitos(doc); return d.length >= 11 ? hmacCurto(`doc:${d}`, tenantId, 40) : null }
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

// ------------------------------------------------------------------ segredo de acompanhamento / recibo
export function gerarCodigo(bytes = 6): string {
  // sem caracteres ambíguos (0/O, 1/I)
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const b = randomBytes(bytes * 2)
  let s = ''
  for (let i = 0; i < bytes * 2; i++) s += alfabeto[b[i] % alfabeto.length]
  return s.match(/.{1,4}/g)!.join('-')
}
export function hashSegredo(segredo: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex')
  return { salt, hash: scryptSync(segredo.toUpperCase().replace(/[^A-Z0-9]/g, ''), salt, 32).toString('hex') }
}
export function conferirSegredo(segredo: string, hash: string, salt: string): boolean {
  try {
    const h = scryptSync(String(segredo).toUpperCase().replace(/[^A-Z0-9]/g, ''), salt, 32)
    const e = Buffer.from(hash, 'hex')
    return e.length === h.length && timingSafeEqual(e, h)
  } catch { return false }
}

/** Instala redação nos console.* para que logs do processo nunca tragam senha/token/CPF completo. */
let instalado = false
export function instalarLogSeguro() {
  if (instalado) return
  instalado = true
  const limpar = (a: unknown): unknown => {
    if (typeof a === 'string') return redigirTexto(a)
    if (a instanceof Error) {
      const e: any = new Error(redigirTexto(a.message))
      e.name = a.name
      e.stack = a.stack ? redigirTexto(a.stack) : a.stack
      if ((a as any).code) e.code = (a as any).code
      if ((a as any).status) e.status = (a as any).status
      return e
    }
    if (a && typeof a === 'object') { try { return redigirLog(a, 0, { email: false }) } catch { return '[objeto]' } }
    return a
  }
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const orig = console[nivel].bind(console)
    ;(console as any)[nivel] = (...args: unknown[]) => orig(...args.map(limpar))
  }
}
