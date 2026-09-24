/**
 * @revah/dentalpos-one-adapter
 *
 * Único ponto de contato entre o DentalPos One e o REVAH. O DentalPos não conhece o banco
 * nem o código do REVAH: tudo passa por API assinada, SSO e eventos.
 *
 *  - provisionClinic / setLicense: servidor-a-servidor, assinados com o segredo compartilhado.
 *  - createSsoToken / ssoUrl: abre o REVAH (como "Marketing") dentro do DentalPos One.
 *  - sendEvent(s) / syncPatients: eventos da clínica (agendamento, falta, orçamento, cobrança, recall, pós-operatório).
 *  - verifyRevahWebhook: valida notificações que o REVAH envia de volta (opt-out, pedido de agendamento, ligação concluída).
 */
import crypto from 'crypto'

export type RevahPlan = 'TRIAL' | 'START' | 'PRO' | 'ENTERPRISE'

export type DentalPosEventType =
  | 'appointment.scheduled'
  | 'appointment.reminder'
  | 'appointment.no_show'
  | 'appointment.canceled'
  | 'budget.pending'
  | 'billing.due'
  | 'recall.due'
  | 'postop.followup'

export interface RevahPatient {
  id: string | number
  name: string
  phone?: string | null
  email?: string | null
  document?: string | null
  birthDate?: string | null
  tags?: string[]
  /** Opt-outs já registrados no DentalPos; viram suppression list no REVAH. */
  optOut?: { whatsapp?: boolean; sms?: boolean; email?: boolean; voice?: boolean }
}

/** Variáveis usadas nos modelos de mensagem ({{data}}, {{hora}}, {{profissional}}, {{procedimento}}, {{valor}}, {{vencimento}}, {{link_pagamento}}). */
export interface RevahEventData {
  data?: string
  hora?: string
  profissional?: string
  procedimento?: string
  valor?: string
  vencimento?: string
  link_pagamento?: string
  unidade?: string
  [k: string]: string | number | boolean | undefined
}

export interface RevahEvent {
  /** Identificador estável (idempotência): o REVAH ignora repetidos. */
  id: string
  type: DentalPosEventType
  occurredAt?: string
  patient: RevahPatient
  data?: RevahEventData
}

export interface ProvisionInput {
  clinicId: string | number
  clinicName: string
  ownerEmail: string
  ownerName?: string
  document?: string
  plan?: RevahPlan
  /** URL do DentalPos que recebe notificações do REVAH. */
  webhookUrl?: string
  rotateApiKey?: boolean
}

export interface ProvisionResult {
  tenantId: string
  created: boolean
  plan: RevahPlan
  status: string
  /** Só vem na criação (ou rotateApiKey): guarde criptografado. */
  apiKey: string | null
  /** Só vem na criação (ou rotateApiKey): segredo para validar webhooks do REVAH. */
  webhookSecret: string | null
}

export interface RevahWebhookPayload {
  type: 'revah.opt_out' | 'revah.appointment_requested' | 'revah.call_completed' | string
  tenantId: string
  occurredAt: string
  data: Record<string, unknown>
}

export class RevahError extends Error {
  constructor(message: string, public status: number, public code?: string, public body?: unknown) {
    super(message)
  }
}

export interface RevahClientOptions {
  /** URL da API do REVAH, ex.: https://api.revah.com.br */
  apiUrl: string
  /** URL do painel do REVAH, ex.: https://app.revah.com.br */
  appUrl?: string
  /** DENTALPOS_SHARED_SECRET (mesmo valor nos dois sistemas). */
  sharedSecret?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url')

export function hmacHex(secret: string, payload: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

/** JWT HS256 de curta duração aceito por POST /auth/sso/dentalpos no REVAH. */
export function createSsoToken(
  sharedSecret: string,
  claims: { clinicId: string | number; email: string; name?: string; role?: string },
  ttlSeconds = 120,
) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({
      clinicId: String(claims.clinicId),
      email: claims.email,
      name: claims.name,
      role: claims.role,
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + Math.min(ttlSeconds, 300),
      aud: 'revah',
      iss: 'dentalpos-one',
    }),
  )
  const sig = crypto.createHmac('sha256', sharedSecret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

/** Valida X-Revah-Timestamp / X-Revah-Signature de uma notificação do REVAH. */
export function verifyRevahWebhook(rawBody: string | Buffer, timestamp: string | undefined, signature: string | undefined, secret: string, toleranceSeconds = 300) {
  if (!timestamp || !signature || !secret) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false
  return safeEqual(hmacHex(secret, `${timestamp}.${rawBody.toString()}`), signature)
}

export class RevahClient {
  private apiUrl: string
  private appUrl: string
  private fetchImpl: typeof fetch

  constructor(private opts: RevahClientOptions) {
    this.apiUrl = opts.apiUrl.replace(/\/$/, '')
    this.appUrl = (opts.appUrl || 'https://app.revah.com.br').replace(/\/$/, '')
    this.fetchImpl = opts.fetchImpl || fetch
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
    const body = init.body === undefined ? undefined : JSON.stringify(init.body)
    const res = await this.fetchImpl(`${this.apiUrl}${path}`, {
      method: init.method || (body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
      body,
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15000),
    })
    const text = await res.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { raw: text }
    }
    if (!res.ok) throw new RevahError(data?.error || `REVAH respondeu HTTP ${res.status}`, res.status, data?.code, data)
    return data as T
  }

  private signed<T>(path: string, body: unknown) {
    if (!this.opts.sharedSecret) throw new Error('sharedSecret não configurado.')
    const raw = JSON.stringify(body)
    const ts = Math.floor(Date.now() / 1000).toString()
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.parse(raw),
      headers: { 'X-Revah-Timestamp': ts, 'X-Revah-Signature': hmacHex(this.opts.sharedSecret, `${ts}.${raw}`) },
    })
  }

  /** Cria (ou atualiza) a empresa da clínica no REVAH. */
  provisionClinic(input: ProvisionInput) {
    return this.signed<ProvisionResult>('/integrations/dentalpos/provision', { ...input, clinicId: String(input.clinicId) })
  }

  /** Feature flag/licença: ativa ou suspende o Marketing da clínica. */
  setLicense(clinicId: string | number, active: boolean, plan?: RevahPlan) {
    return this.signed<{ tenantId: string; status: string; plan: RevahPlan }>('/integrations/dentalpos/license', { clinicId: String(clinicId), active, plan })
  }

  /** URL para abrir o REVAH embutido (iframe) já autenticado. */
  ssoUrl(user: { clinicId: string | number; email: string; name?: string; role?: string }) {
    if (!this.opts.sharedSecret) throw new Error('sharedSecret não configurado.')
    return `${this.appUrl}/sso?embed=1&token=${encodeURIComponent(createSsoToken(this.opts.sharedSecret, user))}`
  }

  sendEvent(apiKey: string, event: RevahEvent) {
    return this.request<{ duplicate: boolean; contactId?: string; actionsScheduled?: number }>('/integrations/dentalpos/events', {
      method: 'POST',
      body: event,
      headers: { 'X-Api-Key': apiKey },
    })
  }

  sendEvents(apiKey: string, events: RevahEvent[]) {
    return this.request<{ results: { id: string; duplicate?: boolean; actionsScheduled?: number; error?: string }[] }>('/integrations/dentalpos/events', {
      method: 'POST',
      body: { events },
      headers: { 'X-Api-Key': apiKey },
    })
  }

  syncPatients(apiKey: string, patients: RevahPatient[]) {
    return this.request<{ synced: number }>('/integrations/dentalpos/patients/sync', { method: 'POST', body: { patients }, headers: { 'X-Api-Key': apiKey } })
  }

  status(apiKey: string) {
    return this.request<{ tenantId: string; plan: RevahPlan; status: string; channels: { channel: string; provider: string; label: string }[] }>(
      '/integrations/dentalpos/status',
      { headers: { 'X-Api-Key': apiKey } },
    )
  }
}
