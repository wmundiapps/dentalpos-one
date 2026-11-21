// Cadastro Incorporado do WhatsApp (Embedded Signup): cada cliente conecta e valida o PRÓPRIO número na Meta,
// dentro do painel, sem copiar tokens. O REVAH atua como provedor de tecnologia (app da WMundi na Meta).
import crypto from 'crypto'
import type { Tenant } from '@prisma/client'
import { config } from '../../config'
import { prisma } from '../../lib/prisma'
import { decryptJson, encryptJson, randomToken } from '../../lib/crypto'
import { badRequest } from '../../lib/errors'
import { normalizeDestination } from '../../lib/normalize'
import { assertCanAddChannel } from '../plans'
import { httpJson } from './types'

export function embeddedSignupConfig() {
  const enabled = Boolean(config.meta.appId && config.meta.appSecret && config.meta.embeddedSignupConfigId)
  return { enabled, appId: config.meta.appId || null, configId: config.meta.embeddedSignupConfigId || null, graphVersion: config.meta.graphVersion }
}

const graph = () => `https://graph.facebook.com/${config.meta.graphVersion}`

export interface EmbeddedSignupInput {
  code: string
  wabaId: string
  phoneNumberId: string
  label?: string | null
}

export async function completeEmbeddedSignup(tenant: Tenant, input: EmbeddedSignupInput) {
  const cfg = embeddedSignupConfig()
  if (!cfg.enabled) throw badRequest('A conexão automática do WhatsApp ainda não foi configurada pela WMundi (META_APP_ID, META_APP_SECRET e META_EMBEDDED_SIGNUP_CONFIG_ID).')
  if (!/^\d{5,25}$/.test(input.wabaId) || !/^\d{5,25}$/.test(input.phoneNumberId)) throw badRequest('Dados da Meta incompletos. Refaça a conexão.')

  // 1. Troca o código de uma só vez por um token da empresa (o cliente autorizou o REVAH na janela da Meta).
  const tokenRes = await httpJson(
    `${graph()}/oauth/access_token?client_id=${encodeURIComponent(config.meta.appId)}&client_secret=${encodeURIComponent(config.meta.appSecret)}&code=${encodeURIComponent(input.code)}`,
  )
  const accessToken = String(tokenRes?.access_token || '')
  if (!accessToken) throw badRequest('A Meta não liberou o acesso. Refaça a conexão.')
  const auth = { Authorization: `Bearer ${accessToken}` }

  // 2. Assina o webhook do app para a conta do WhatsApp Business do cliente (mensagens, status e modelos).
  await httpJson(`${graph()}/${input.wabaId}/subscribed_apps`, { method: 'POST', headers: auth })

  // 3. Registra o número na API (PIN de verificação em duas etapas guardado cifrado, para reconectar depois).
  const existing = await prisma.channelAccount.findFirst({ where: { tenantId: tenant.id, provider: 'META_CLOUD', externalId: input.phoneNumberId } })
  const previous = decryptJson<Record<string, any>>(existing?.encryptedCredentials) || {}
  const pin = previous.pin || String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  await httpJson(`${graph()}/${input.phoneNumberId}/register`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
  }).catch((e) => {
    // Número já registrado (reconexão) não é erro.
    if (!/already registered|já registrado/i.test(String(e?.message))) throw e
  })

  // 4. Dados do número para o painel.
  const info = await httpJson(`${graph()}/${input.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,name_status`, { headers: auth })
  const address = normalizeDestination('WHATSAPP', String(info?.display_phone_number || '')) || input.phoneNumberId
  const creds = { phoneNumberId: input.phoneNumberId, wabaId: input.wabaId, accessToken, pin, connectedVia: 'EMBEDDED_SIGNUP' }
  const settings = {
    ...((existing?.settings as object) || {}),
    verifiedName: info?.verified_name || null,
    qualityRating: info?.quality_rating || null,
    nameStatus: info?.name_status || null,
    connectedAt: new Date().toISOString(),
  }

  if (existing) {
    return prisma.channelAccount.update({
      where: { id: existing.id },
      data: { address, isActive: true, encryptedCredentials: encryptJson(creds), settings, ...(input.label ? { label: input.label } : {}) },
    })
  }
  await assertCanAddChannel(tenant)
  const hasDefault = await prisma.channelAccount.count({ where: { tenantId: tenant.id, channel: 'WHATSAPP', isDefault: true } })
  const sameAddress = await prisma.channelAccount.findFirst({ where: { tenantId: tenant.id, channel: 'WHATSAPP', address } })
  if (sameAddress) {
    return prisma.channelAccount.update({
      where: { id: sameAddress.id },
      data: { provider: 'META_CLOUD', externalId: input.phoneNumberId, isActive: true, encryptedCredentials: encryptJson(creds), settings },
    })
  }
  return prisma.channelAccount.create({
    data: {
      tenantId: tenant.id,
      channel: 'WHATSAPP',
      provider: 'META_CLOUD',
      label: input.label || info?.verified_name || 'WhatsApp',
      address,
      externalId: input.phoneNumberId,
      encryptedCredentials: encryptJson(creds),
      settings,
      webhookSecret: randomToken(18),
      isDefault: !hasDefault,
    },
  })
}
