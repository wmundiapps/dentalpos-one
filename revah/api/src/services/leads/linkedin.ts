// LinkedIn Lead Sync: importa os leads dos formulários de anúncios (Lead Gen Forms) da própria empresa.
// Via oficial: OAuth da empresa + app da WMundi aprovado no produto "Lead Sync API" do LinkedIn.
// Nada de raspagem de perfis.
import type { LeadSource } from '@prisma/client'
import { config } from '../../config'
import { prisma } from '../../lib/prisma'
import { decryptJson, encryptJson, signPayload, verifyPayload } from '../../lib/crypto'
import { HttpError, badRequest } from '../../lib/errors'
import { normalizeEmail, normalizePhone } from '../../lib/normalize'
import { httpJson } from '../channels/types'
import { ingestAndImportAdLead } from './index'
import type { RawLead } from './providers'

const SCOPES = ['r_ads', 'r_marketing_leadgen_automation']
const API = 'https://api.linkedin.com/rest'

interface Tokens {
  accessToken: string
  expiresAt: number
  refreshToken?: string
  refreshExpiresAt?: number
}

export const linkedinRedirectUri = () => `${config.publicApiUrl}/integrations/linkedin/callback`

export function linkedinAvailable() {
  return Boolean(config.linkedin.clientId && config.linkedin.clientSecret)
}

export function linkedinAuthUrl(tenantId: string, userId: string) {
  if (!linkedinAvailable()) throw new HttpError(503, 'Conexão com o LinkedIn ainda não liberada. Fale com o suporte.', 'LINKEDIN_UNAVAILABLE')
  const state = signPayload({ t: tenantId, u: userId, e: String(Date.now() + 15 * 60_000) })
  const q = new URLSearchParams({ response_type: 'code', client_id: config.linkedin.clientId, redirect_uri: linkedinRedirectUri(), state, scope: SCOPES.join(' ') })
  return `https://www.linkedin.com/oauth/v2/authorization?${q}`
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const d = await httpJson('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: config.linkedin.clientId, client_secret: config.linkedin.clientSecret }).toString(),
  })
  const now = Date.now()
  return {
    accessToken: d.access_token,
    expiresAt: now + Number(d.expires_in || 0) * 1000,
    refreshToken: d.refresh_token,
    refreshExpiresAt: d.refresh_token_expires_in ? now + Number(d.refresh_token_expires_in) * 1000 : undefined,
  }
}

function api(token: string, pathAndQuery: string) {
  return httpJson(`${API}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}`, 'LinkedIn-Version': config.linkedin.apiVersion, 'X-Restli-Protocol-Version': '2.0.0' },
    timeoutMs: 20000,
  })
}

const accountId = (urn: string) => String(urn).split(':').pop() || ''

// Callback do OAuth: guarda uma fonte por conta de anúncios que o usuário administra.
export async function linkedinCallback(code: string, state: string) {
  const s = verifyPayload<{ t: string; u: string; e: string }>(state)
  if (!s || Number(s.e) < Date.now()) throw badRequest('Link de conexão expirado. Tente conectar novamente.')
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: linkedinRedirectUri() })
  const users = await api(tokens.accessToken, '/adAccountUsers?q=authenticatedUser')
  const accounts = [...new Set<string>((users.elements || []).map((e: any) => accountId(e.account)).filter(Boolean))]
  if (!accounts.length) throw badRequest('Nenhuma conta de anúncios do LinkedIn encontrada para este usuário.')
  let saved = 0
  for (const id of accounts) {
    const info = await api(tokens.accessToken, `/adAccounts/${id}`).catch(() => null)
    const label = info?.name ? `LinkedIn — ${info.name}` : `LinkedIn — conta ${id}`
    await prisma.leadSource.upsert({
      where: { tenantId_provider_externalId: { tenantId: s.t, provider: 'LINKEDIN', externalId: id } },
      create: { tenantId: s.t, provider: 'LINKEDIN', externalId: id, label, encryptedCredentials: encryptJson(tokens) },
      update: { label, encryptedCredentials: encryptJson(tokens), isActive: true, lastError: null },
    })
    saved++
  }
  return { tenantId: s.t, accounts: saved }
}

async function validToken(source: LeadSource) {
  const t = decryptJson<Tokens>(source.encryptedCredentials)
  if (!t?.accessToken) throw new Error('Conexão sem credenciais. Conecte o LinkedIn novamente.')
  if (t.expiresAt - Date.now() > 24 * 3600_000) return t.accessToken
  if (!t.refreshToken || (t.refreshExpiresAt && t.refreshExpiresAt < Date.now())) {
    if (t.expiresAt > Date.now()) return t.accessToken
    throw new Error('A conexão com o LinkedIn expirou. Conecte novamente.')
  }
  const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refreshToken })
  const merged = { ...t, ...fresh, refreshToken: fresh.refreshToken || t.refreshToken }
  await prisma.leadSource.update({ where: { id: source.id }, data: { encryptedCredentials: encryptJson(merged) } })
  return merged.accessToken
}

// Mapeia as respostas do formulário para os campos do lead, usando os campos pré-definidos do formulário.
export function linkedinLeadFromResponse(el: any, form: any): RawLead {
  const fields = new Map<string, string>()
  for (const q of form?.content?.questions || []) if (q.questionId != null && q.predefinedField) fields.set(String(q.questionId), String(q.predefinedField))
  const v: Record<string, string> = {}
  for (const a of el?.formResponse?.answers || []) {
    const key = fields.get(String(a.questionId))
    const ans = a.answerDetails?.textQuestionAnswer?.answer ?? a.answerDetails?.multipleChoiceAnswer?.options?.join(', ')
    if (key && ans != null) v[key] = String(ans)
  }
  const name = [v.FIRST_NAME, v.LAST_NAME].filter(Boolean).join(' ') || 'Lead do LinkedIn'
  return {
    name,
    company: v.COMPANY_NAME || null,
    phone: normalizePhone(v.PHONE_NUMBER || v.MOBILE_PHONE_NUMBER),
    email: normalizeEmail(v.WORK_EMAIL || v.EMAIL),
    city: v.CITY || null,
    state: v.STATE || null,
    category: v.JOB_TITLE || v.INDUSTRY || null,
    origin: 'linkedin_form',
    originRef: String(el.id || el.leadId || ''),
  }
}

export async function syncLinkedinSource(source: LeadSource) {
  const token = await validToken(source)
  const since = (source.lastSyncAt?.getTime() || Date.now() - 30 * 86400_000) - 3600_000
  const owner = encodeURIComponent(`urn:li:sponsoredAccount:${source.externalId}`)
  const forms = new Map<string, any>()
  let start = 0
  let imported = 0
  for (let page = 0; page < 20; page++) {
    const d = await api(token, `/leadFormResponses?q=owner&owner=(sponsoredAccount:${owner})&leadType=(leadType:SPONSORED)&limitedToTestLeads=false&submittedAtTimeRange=(start:${since},end:${Date.now()})&start=${start}&count=100`)
    const els: any[] = d.elements || []
    for (const el of els) {
      const formUrn = String(el.versionedLeadGenFormUrn || el.leadGenFormUrn || '')
      const formId = formUrn.match(/leadGenForm:(\d+)/)?.[1]
      if (formId && !forms.has(formId)) forms.set(formId, await api(token, `/leadForms/${formId}`).catch(() => null))
      const raw = linkedinLeadFromResponse(el, formId ? forms.get(formId) : null)
      if (!raw.originRef) continue
      await ingestAndImportAdLead(source.tenantId, raw, 'LinkedIn', 'linkedin')
      imported++
    }
    if (els.length < 100) break
    start += 100
  }
  await prisma.leadSource.update({ where: { id: source.id }, data: { lastSyncAt: new Date(), lastError: null } })
  return imported
}

// Chamado pelo cron: sincroniza as fontes com mais de 15 minutos desde a última leitura.
export async function syncDueLeadSources(max = 5) {
  if (!linkedinAvailable()) return { synced: 0 }
  const due = await prisma.leadSource.findMany({
    where: { isActive: true, provider: 'LINKEDIN', OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - 15 * 60_000) } }] },
    orderBy: { lastSyncAt: 'asc' },
    take: max,
  })
  let leads = 0
  for (const s of due) {
    try {
      leads += await syncLinkedinSource(s)
    } catch (e: any) {
      await prisma.leadSource.update({ where: { id: s.id }, data: { lastSyncAt: new Date(), lastError: String(e?.message || e).slice(0, 500) } })
    }
  }
  return { synced: due.length, leads }
}
