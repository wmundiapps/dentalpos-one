// Cliente HTTP da REVAH API: anexa o token, padroniza erros e encerra a sessão em 401.

export const API_URL = String(import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '')

const SESSION_KEY = 'revah.session'
let memorySession: string | null = null

// Dentro de iframe o navegador pode bloquear o localStorage: cai para memória.
export function readStoredSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY) ?? memorySession
  } catch {
    return memorySession
  }
}

export function writeStoredSession(value: string | null) {
  memorySession = value
  try {
    if (value === null) localStorage.removeItem(SESSION_KEY)
    else localStorage.setItem(SESSION_KEY, value)
  } catch {
    /* sem armazenamento persistente */
  }
}

export function getToken(): string | null {
  const raw = readStoredSession()
  if (!raw) return null
  try {
    return JSON.parse(raw)?.token || null
  } catch {
    return null
  }
}

export class ApiError extends Error {
  status: number
  code?: string
  details?: any
  constructor(status: number, message: string, code?: string, details?: any) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

let unauthorizedHandler: (() => void) | null = null
export function onUnauthorized(fn: () => void) {
  unauthorizedHandler = fn
}

type Query = Record<string, string | number | boolean | undefined | null>

export interface RequestOptions {
  method?: string
  body?: unknown
  query?: Query
}

function buildUrl(path: string, query?: Query) {
  const url = new URL(API_URL + path)
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  return url.toString()
}

// Mensagem legível para erros de validação (zod flatten).
function validationMessage(details: any): string | null {
  const fe = details?.fieldErrors
  if (!fe || typeof fe !== 'object') return null
  const parts = Object.entries(fe)
    .filter(([, v]) => Array.isArray(v) && v.length)
    .map(([k, v]) => `${k}: ${(v as string[])[0]}`)
  return parts.length ? parts.join(' · ') : null
}

export async function api<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), { method: opts.method || 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined })
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.', 'NETWORK')
  }
  const text = await res.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text }
    }
  }
  if (!res.ok) {
    const code = data?.code || data?.details?.code
    let message = data?.error || `Erro ${res.status}.`
    if (code === 'VALIDATION') message = validationMessage(data?.details) ? `Dados inválidos — ${validationMessage(data.details)}` : message
    if (res.status === 429) message = data?.error || 'Muitas requisições. Aguarde um instante.'
    const err = new ApiError(res.status, message, code, data?.details ?? data)
    if (res.status === 401 && code === 'UNAUTHENTICATED' && token) unauthorizedHandler?.()
    throw err
  }
  return data as T
}

export const get = <T = any>(path: string, query?: Query) => api<T>(path, { query })
export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body })
export const put = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body })
export const patch = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'PATCH', body })
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' })

// Códigos 402/serviço que pedem upgrade ou ação do cliente.
export const UPGRADE_CODES = new Set([
  'TRIAL_EXHAUSTED',
  'TRIAL_RECIPIENT_LIMIT',
  'MONTHLY_LIMIT',
  'PLAN_FEATURE',
  'PLAN_LIMIT',
  'PAYMENT_PAST_DUE',
  'SUBSCRIPTION_CANCELED',
  'UPGRADE_REQUIRED',
  'LEADS_ADDON_REQUIRED',
  'LEADS_TERMS_REQUIRED',
])

export function isUpgradeError(e: unknown): e is ApiError {
  return e instanceof ApiError && (e.status === 402 || (!!e.code && UPGRADE_CODES.has(e.code)))
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Algo deu errado. Tente novamente.'
}
