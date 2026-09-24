// Integração com o DentalPos One (via @revah/dentalpos-one-adapter).
// Nada de código compartilhado: só API assinada, SSO e eventos.
import jwt from 'jsonwebtoken'
import type { Tenant } from '@prisma/client'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { hmacHex, randomToken, safeEqual } from '../lib/crypto'
import { badRequest, HttpError } from '../lib/errors'
import { normalizeEmail, normalizePhone, slugify, type Channel } from '../lib/normalize'
import { createApiKey } from './apiKeys'
import { audit } from './audit'
import { emitEvent } from './automations'
import { upsertContact } from './contacts'
import { suppress } from './suppression'

export const DENTALPOS_EVENT_TYPES = [
  'appointment.scheduled',
  'appointment.reminder',
  'appointment.no_show',
  'appointment.canceled',
  'budget.pending',
  'billing.due',
  'recall.due',
  'postop.followup',
] as const

function secret() {
  if (!config.dentalpos.sharedSecret) throw new HttpError(503, 'Integração DentalPos não configurada (DENTALPOS_SHARED_SECRET).')
  return config.dentalpos.sharedSecret
}

// Requisições servidor-a-servidor: X-Revah-Timestamp + X-Revah-Signature = HMAC-SHA256(segredo, `${ts}.${corpo}`).
export function verifyServerSignature(raw: Buffer | undefined, ts: string | undefined, sig: string | undefined) {
  if (!raw || !ts || !sig) throw new HttpError(401, 'Assinatura ausente.', 'UNAUTHENTICATED')
  const age = Math.abs(Date.now() / 1000 - Number(ts))
  if (!Number.isFinite(age) || age > 300) throw new HttpError(401, 'Requisição expirada.', 'UNAUTHENTICATED')
  const expected = hmacHex(secret(), `${ts}.${raw.toString('utf8')}`)
  if (!safeEqual(expected, sig)) throw new HttpError(401, 'Assinatura inválida.', 'UNAUTHENTICATED')
}

const PLANS = ['TRIAL', 'START', 'PRO', 'ENTERPRISE']

export async function provisionClinic(body: any) {
  const clinicId = String(body.clinicId || '').trim()
  const ownerEmail = normalizeEmail(body.ownerEmail)
  if (!clinicId || !ownerEmail) throw badRequest('Informe clinicId e ownerEmail.')
  // Pacote DentalPos + REVAH: a cobrança é feita pelo DentalPos. "TRIAL" = 14 dias com recursos do START.
  const trial = body.plan === 'TRIAL'
  const plan = trial ? 'START' : PLANS.includes(body.plan) ? body.plan : 'PRO'
  const externalRef = `dentalpos:${clinicId}`
  let tenant = await prisma.tenant.findUnique({ where: { externalRef } })
  let created = false
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: String(body.clinicName || 'Clínica'),
        slug: `${slugify(String(body.clinicName || 'clinica'))}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        document: body.document ? String(body.document).replace(/\D/g, '') : null,
        source: 'DENTALPOS',
        externalRef,
        plan,
        status: trial ? 'TRIAL' : 'ACTIVE',
        trialEndsAt: trial ? new Date(Date.now() + 14 * 86_400_000) : null,
        trialEligible: false,
        integrationWebhookUrl: body.webhookUrl || null,
        integrationSecret: randomToken(32),
      },
    })
    created = true
  } else {
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        ...(body.clinicName ? { name: String(body.clinicName) } : {}),
        ...(body.webhookUrl !== undefined ? { integrationWebhookUrl: body.webhookUrl || null } : {}),
        ...(PLANS.includes(body.plan) && body.plan !== 'TRIAL' ? { plan: body.plan, status: 'ACTIVE' } : {}),
        ...(tenant.integrationSecret ? {} : { integrationSecret: randomToken(32) }),
      },
    })
  }
  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } })
  if (!owner) {
    await prisma.user.create({ data: { tenantId: tenant.id, email: ownerEmail, name: String(body.ownerName || ownerEmail), role: 'OWNER' } })
  }
  const apiKey = created || body.rotateApiKey ? await createApiKey(tenant.id, 'DentalPos One') : null
  await audit(tenant.id, null, created ? 'DENTALPOS_PROVISIONED' : 'DENTALPOS_UPDATED', 'Tenant', tenant.id, { clinicId, plan })
  return {
    tenantId: tenant.id,
    created,
    plan: tenant.plan,
    status: tenant.status,
    apiKey: apiKey?.key || null,
    webhookSecret: created || body.rotateApiKey ? tenant.integrationSecret : null,
  }
}

// Licença/feature flag: DentalPos ativa ou desativa o REVAH da clínica.
export async function setLicense(body: any) {
  const tenant = await prisma.tenant.findUnique({ where: { externalRef: `dentalpos:${String(body.clinicId || '')}` } })
  if (!tenant) throw new HttpError(404, 'Clínica não provisionada no REVAH.')
  const active = Boolean(body.active)
  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      status: active ? (tenant.trialEndsAt && tenant.trialEndsAt > new Date() && body.plan === undefined ? 'TRIAL' : 'ACTIVE') : 'SUSPENDED',
      ...(PLANS.includes(body.plan) && body.plan !== 'TRIAL' ? { plan: body.plan } : {}),
    },
  })
  await audit(tenant.id, null, active ? 'LICENSE_ACTIVATED' : 'LICENSE_SUSPENDED', 'Tenant', tenant.id, body)
  return { tenantId: updated.id, status: updated.status, plan: updated.plan }
}

interface SsoClaims {
  clinicId: string
  email: string
  name?: string
  role?: string
  jti: string
}

const ROLE_MAP: Record<string, string> = { OWNER: 'OWNER', ADMIN: 'ADMIN', MANAGER: 'ADMIN', GESTOR: 'ADMIN' }

// SSO: o DentalPos One assina um JWT curto (HS256, aud "revah"); o REVAH troca por uma sessão própria.
export async function ssoExchange(token: string) {
  let claims: SsoClaims
  try {
    claims = jwt.verify(token, secret(), { algorithms: ['HS256'], audience: 'revah', issuer: 'dentalpos-one', maxAge: '5m' }) as SsoClaims
  } catch {
    throw new HttpError(401, 'Link de acesso inválido ou expirado. Abra o Marketing novamente pelo DentalPos One.', 'UNAUTHENTICATED')
  }
  if (!claims.jti) throw new HttpError(401, 'Token sem identificador.', 'UNAUTHENTICATED')
  const tenant = await prisma.tenant.findUnique({ where: { externalRef: `dentalpos:${claims.clinicId}` } })
  if (!tenant) throw new HttpError(404, 'O Marketing ainda não foi ativado para esta clínica.', 'NOT_PROVISIONED')
  if (tenant.status === 'SUSPENDED') throw new HttpError(403, 'O Marketing está desativado para esta clínica.', 'LICENSE_INACTIVE')

  // Anti-replay: cada jti só pode ser usado uma vez.
  try {
    await prisma.integrationEvent.create({ data: { tenantId: tenant.id, source: 'DENTALPOS', externalId: `sso:${claims.jti}`, type: 'sso', payload: { email: claims.email }, status: 'PROCESSED' } })
  } catch {
    throw new HttpError(401, 'Este link de acesso já foi utilizado.', 'UNAUTHENTICATED')
  }

  const email = normalizeEmail(claims.email)
  if (!email) throw badRequest('E-mail inválido no SSO.')
  let user = await prisma.user.findUnique({ where: { email } })
  if (user && user.tenantId !== tenant.id) throw new HttpError(409, 'Este e-mail já está vinculado a outra empresa no REVAH.', 'EMAIL_IN_USE')
  if (!user) user = await prisma.user.create({ data: { tenantId: tenant.id, email, name: claims.name || email, role: ROLE_MAP[String(claims.role).toUpperCase()] || 'AGENT' } })
  if (!user.isActive) throw new HttpError(403, 'Usuário desativado no REVAH.')
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  return { user, tenant }
}

function helperVars(data: Record<string, any>) {
  return {
    ...data,
    profissional_com: data.profissional ? ` com ${data.profissional}` : '',
    procedimento_de: data.procedimento ? ` de ${data.procedimento}` : '',
    link_pagamento: data.link_pagamento ? `Link para pagamento: ${data.link_pagamento}.` : '',
  }
}

const OPT_OUT_CHANNELS: Record<string, Channel> = { whatsapp: 'WHATSAPP', sms: 'SMS', email: 'EMAIL', voice: 'VOICE', telegram: 'TELEGRAM' }

async function upsertPatient(tenant: Tenant, patient: any) {
  if (!patient?.id) throw badRequest('Evento sem paciente (patient.id).')
  const { contact } = await upsertContact(
    tenant.id,
    {
      name: patient.name,
      phone: patient.phone,
      email: patient.email,
      document: patient.document,
      source: 'DENTALPOS',
      externalRef: `dentalpos:patient:${patient.id}`,
      customFields: patient.birthDate ? { nascimento: patient.birthDate } : undefined,
      tags: Array.isArray(patient.tags) ? patient.tags : ['Paciente'],
    },
    { emit: false },
  )
  // Opt-outs registrados no DentalPos também valem no REVAH.
  for (const [k, ch] of Object.entries(OPT_OUT_CHANNELS)) {
    if (!patient.optOut?.[k]) continue
    const value = ch === 'EMAIL' ? contact.email : contact.phone
    if (value) await suppress(tenant.id, ch, value, 'INTEGRATION', { contactId: contact.id, detail: 'Opt-out registrado no DentalPos One' })
  }
  return contact
}

export async function ingestDentalposEvent(tenant: Tenant, body: any) {
  const id = String(body.id || '').trim()
  const type = String(body.type || '')
  if (!id) throw badRequest('Evento sem id (idempotência).')
  if (!(DENTALPOS_EVENT_TYPES as readonly string[]).includes(type)) throw badRequest(`Tipo de evento não suportado: ${type}`)
  const existing = await prisma.integrationEvent.findUnique({ where: { tenantId_source_externalId: { tenantId: tenant.id, source: 'DENTALPOS', externalId: id } } })
  if (existing) return { duplicate: true, status: existing.status }

  const event = await prisma.integrationEvent.create({ data: { tenantId: tenant.id, source: 'DENTALPOS', externalId: id, type, payload: body } })
  try {
    const contact = await upsertPatient(tenant, body.patient)
    const scheduled = await emitEvent(tenant.id, `dentalpos.${type}`, { contactId: contact.id, data: helperVars(body.data || {}) })
    await prisma.integrationEvent.update({ where: { id: event.id }, data: { status: scheduled ? 'PROCESSED' : 'IGNORED' } })
    return { duplicate: false, contactId: contact.id, actionsScheduled: scheduled }
  } catch (e: any) {
    await prisma.integrationEvent.update({ where: { id: event.id }, data: { status: 'FAILED', error: String(e?.message || e).slice(0, 500) } })
    throw e
  }
}

export async function syncPatients(tenant: Tenant, patients: any[]) {
  if (!Array.isArray(patients)) throw badRequest('Envie { patients: [...] }.')
  let synced = 0
  for (const p of patients.slice(0, 1000)) {
    await upsertPatient(tenant, p)
    synced++
  }
  return { synced }
}

export { normalizePhone }
