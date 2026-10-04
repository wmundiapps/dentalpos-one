import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

// ============================================================
// Cifra de segredos do módulo de segurança (AES-256-GCM).
// Chave: SECURITY_ENC_KEY (64 hex ou qualquer texto >= 16 caracteres, derivado por SHA-256).
// Fallback: derivada de JWT_SECRET (HKDF). Em produção sem nenhum dos dois, falha com mensagem clara.
// Para rotacionar JWT_SECRET sem perder os segredos 2FA, defina SECURITY_ENC_KEY ANTES.
// ============================================================

export class ChaveSegurancaAusenteError extends Error {
  status = 500
  constructor() {
    super('Configuração de segurança ausente: defina SECURITY_ENC_KEY (recomendado) ou JWT_SECRET para usar a autenticação em dois fatores.')
  }
}

function chaveDeSecurityEncKey(): Buffer | null {
  const raw = String(process.env.SECURITY_ENC_KEY || '').trim()
  if (!raw) return null
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')
  if (raw.length < 16) throw new Error('SECURITY_ENC_KEY muito curta: use pelo menos 16 caracteres (ideal: 64 caracteres hexadecimais).')
  return createHash('sha256').update('dentalpos-seg-enc:' + raw).digest()
}

function chaveDeJwt(): Buffer | null {
  const jwt = String(process.env.JWT_SECRET || '')
  if (!jwt) return null
  return Buffer.from(hkdfSync('sha256', jwt, 'dentalpos-seguranca', 'seg-2fa-v1', 32))
}

/** Chaves candidatas: a primeira cifra; todas tentam decifrar (permite adotar SECURITY_ENC_KEY depois). */
function chaves(): Buffer[] {
  const lista = [chaveDeSecurityEncKey(), chaveDeJwt()].filter((k): k is Buffer => !!k)
  if (lista.length) return lista
  if (process.env.NODE_ENV === 'production') throw new ChaveSegurancaAusenteError()
  // Fora de produção (dev/testes) sem nenhuma chave: chave fixa de desenvolvimento.
  return [createHash('sha256').update('dentalpos-seg-dev-key').digest()]
}

export function cifrar(texto: string): string {
  const key = chaves()[0]
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':')
}

export function decifrar(payload: string): string {
  const [v, iv, tag, ct] = String(payload).split(':')
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Segredo cifrado em formato inválido.')
  for (const key of chaves()) {
    try {
      const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
      d.setAuthTag(Buffer.from(tag, 'base64'))
      return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8')
    } catch {
      /* tenta a próxima chave */
    }
  }
  throw new Error('Não foi possível decifrar o segredo (chave de segurança alterada?).')
}

// ---------- códigos de recuperação ----------

const ALFABETO_REC = 'abcdefghjkmnpqrstuvwxyz23456789' // sem caracteres ambíguos (i, l, o, 0, 1)

export function gerarCodigoRecuperacao(): string {
  let s = ''
  for (let i = 0; i < 10; i++) s += ALFABETO_REC[randomInt(ALFABETO_REC.length)]
  return `${s.slice(0, 5)}-${s.slice(5)}`
}

export function normalizarCodigoRecuperacao(c: string): string {
  return String(c || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** HMAC-SHA256 do código normalizado (a chave nunca é guardada junto do hash). */
export function hashCodigoRecuperacao(c: string): string {
  return createHmac('sha256', chaves()[0]).update('rec:' + normalizarCodigoRecuperacao(c)).digest('hex')
}

/** Compara o código informado com um hash guardado, em tempo constante, tentando todas as chaves. */
export function conferirCodigoRecuperacao(c: string, hashGuardado: string): boolean {
  const alvo = Buffer.from(String(hashGuardado), 'hex')
  let ok = false
  for (const key of chaves()) {
    const h = createHmac('sha256', key).update('rec:' + normalizarCodigoRecuperacao(c)).digest()
    if (h.length === alvo.length && timingSafeEqual(h, alvo)) ok = true
  }
  return ok
}
