// Sanitização do contexto técnico enviado pelos usuários (LGPD: minimização). Funções PURAS, usadas no servidor
// (e espelhadas no frontend antes do envio). Nada de segredo, token, CPF, e-mail ou telefone chega ao banco.
import { redigirTexto, sanitizarUrl } from '../lgpd/mascara'

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const RE_TEL = /(?<!\d)(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}(?!\d)/g
const RE_CARTAO = /\b(?:\d[ -]?){13,19}\b/g
const RE_LONGO_HEX = /\b[a-f0-9]{32,}\b/gi
const RE_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const RE_BASE64_LONGO = /\b[A-Za-z0-9+/_-]{40,}={0,2}/g
const RE_DATA_URL = /data:[\w.+/-]+;base64,[A-Za-z0-9+/=]+/g
const RE_CHAVE_API = /\b(?:sk|pk|rk|key|api)[-_][A-Za-z0-9_-]{12,}\b/gi

export const MAX_LOG = 8000

/** Remove segredos e dados pessoais de texto livre (logs de console, mensagens de erro). */
export function sanitizarTexto(s: string, max = MAX_LOG): string {
  if (!s) return ''
  let t = String(s)
  t = t.replace(RE_DATA_URL, '[data-url-omitida]')
  t = redigirTexto(t)
  t = t.replace(RE_CHAVE_API, '[chave-omitida]')
  t = t.replace(RE_EMAIL, '[e-mail]')
  t = t.replace(RE_CARTAO, (m) => (m.replace(/\D/g, '').length >= 13 ? '[numero-omitido]' : m))
  t = t.replace(RE_TEL, '[telefone]')
  t = t.replace(RE_LONGO_HEX, '[hash]')
  t = t.replace(RE_UUID, '[id]')
  t = t.replace(RE_BASE64_LONGO, '[token-omitido]')
  // URLs dentro do texto: remove query strings inteiras
  t = t.replace(/(https?:\/\/[^\s"')]+)\?[^\s"')]*/g, '$1?[query-omitida]')
  // caracteres de controle (exceto \n e \t)
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  return t.length > max ? t.slice(0, max) + '\n[...truncado]' : t
}

/** Rota/URL da tela: só caminho; query com valores omitidos; ids numéricos/uuid longos viram :id. */
export function sanitizarRota(rota?: string | null): string | null {
  if (!rota) return null
  let r = String(rota).trim().slice(0, 300)
  r = r.replace(/^https?:\/\/[^/]+/i, '').replace(/#.*$/, '')
  const [path, query] = r.split('?', 2)
  let p = sanitizarUrl(path).replace(RE_UUID, ':id').replace(/\/\d{4,}(?=\/|$)/g, '/:id')
  if (query) p += '?' + query.split('&').map((q) => q.split('=')[0]).filter(Boolean).map((k) => `${k.slice(0, 40)}=…`).join('&')
  return p.slice(0, 200)
}

/** User-Agent resumido (navegador/SO sem versão detalhada) — minimização. */
export function resumirNavegador(ua?: string | null): string | null {
  if (!ua) return null
  const s = String(ua)
  const nav = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Outro'
  const m = s.match(/(?:Chrome|Firefox|Version|Edg|OPR)\/(\d+)/)
  const so = /Android/.test(s) ? 'Android' : /iPhone|iPad|iOS/.test(s) ? 'iOS' : /Windows/.test(s) ? 'Windows' : /Mac OS/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : 'Outro'
  return `${nav}${m ? ' ' + m[1] : ''} / ${so}`
}

/** Similaridade simples (Jaccard de palavras >3 letras) para sugerir duplicados. */
export function similaridade(a: string, b: string): number {
  const tok = (x: string) => new Set(x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 3))
  const A = tok(a), B = tok(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}

export const TRANSICOES: Record<string, string[]> = {
  NOVO: ['EM_TRIAGEM', 'PLANEJADO', 'EM_ANDAMENTO', 'RESOLVIDO', 'RECUSADO', 'DUPLICADO'],
  EM_TRIAGEM: ['PLANEJADO', 'EM_ANDAMENTO', 'RESOLVIDO', 'RECUSADO', 'DUPLICADO'],
  PLANEJADO: ['EM_ANDAMENTO', 'RESOLVIDO', 'RECUSADO', 'EM_TRIAGEM'],
  EM_ANDAMENTO: ['RESOLVIDO', 'PLANEJADO', 'RECUSADO'],
  RESOLVIDO: ['EM_TRIAGEM', 'EM_ANDAMENTO'],
  RECUSADO: ['EM_TRIAGEM'],
  DUPLICADO: ['EM_TRIAGEM'],
}
