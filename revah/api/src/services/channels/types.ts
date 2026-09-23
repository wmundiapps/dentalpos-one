import type { ChannelAccount } from '@prisma/client'

export interface WaTemplate {
  name: string
  language?: string
  params?: string[]
}

export interface SendInput {
  account: ChannelAccount
  creds: Record<string, any>
  to: string
  text: string
  subject?: string | null
  template?: WaTemplate | null
  unsubscribeUrl?: string | null
}

export interface SendResult {
  providerMessageId?: string
  simulated: boolean
  raw?: unknown
}

export interface ProviderAdapter {
  send(input: SendInput): Promise<SendResult>
  // Valida as credenciais e executa passos de conexão (ex.: registrar webhook).
  connect?(account: ChannelAccount, creds: Record<string, any>): Promise<{ ok: boolean; info?: string }>
}

export class ProviderError extends Error {
  constructor(message: string, public status?: number, public raw?: unknown) {
    super(message)
  }
}

export async function httpJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    const text = await res.text()
    let data: any
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { raw: text }
    }
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || data?.error || data?.description || `HTTP ${res.status}`
      throw new ProviderError(typeof msg === 'string' ? msg : JSON.stringify(msg), res.status, data)
    }
    return data
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new ProviderError('Tempo esgotado ao falar com o provedor.')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
