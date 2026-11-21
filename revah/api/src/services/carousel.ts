// Carrossel de ofertas: cards deslizáveis no WhatsApp (template CAROUSEL da API oficial da Meta)
// e no Telegram (um card com setas ◀ ▶). Cada clique em "Quero saber mais" vira conversa atribuída
// a um atendente, etiqueta no contato e evento de automação.
import type { Campaign, ChannelAccount, Tenant } from '@prisma/client'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { decryptJson } from '../lib/crypto'
import { badRequest, conflict, notFound } from '../lib/errors'
import type { Channel } from '../lib/normalize'
import { emitEvent } from './automations'
import { httpJson, ProviderError } from './channels/types'
import { applyTags, findOrCreateByChannel } from './contacts'
import { notifyIntegration } from './integrationOut'
import { ensureConversation, pickChannelAccount, sendMessage } from './messaging'
import { isSuppressed, suppress } from './suppression'
import { decodePayload, getCarousel, OPT_OUT_BUTTON, telegramCard, waCarouselTemplateDefinition, waTemplateName } from './carouselFormat'

export * from './carouselFormat'

// ---------------------------------------------------------------------------
// Template na Meta: upload das imagens, envio para aprovação e acompanhamento do status.
// ---------------------------------------------------------------------------
function graphBase(creds: Record<string, any>) {
  return `https://graph.facebook.com/${creds.apiVersion || config.meta.graphVersion}`
}

async function uploadHeaderHandle(creds: Record<string, any>, imageUrl: string) {
  if (!config.meta.appId) throw badRequest('Falta configurar META_APP_ID (app da WMundi na Meta) para enviar as imagens dos cards.')
  const img = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) }).catch(() => null)
  if (!img?.ok) throw badRequest(`Não consegui baixar a imagem ${imageUrl}. Use um link público.`)
  const type = (img.headers.get('content-type') || '').split(';')[0].trim()
  if (!['image/jpeg', 'image/png'].includes(type)) throw badRequest('As imagens dos cards precisam ser JPG ou PNG.')
  const bytes = new Uint8Array(await img.arrayBuffer())
  if (bytes.length > 5 * 1024 * 1024) throw badRequest('Cada imagem pode ter até 5 MB.')
  const base = graphBase(creds)
  const session = await httpJson(`${base}/${config.meta.appId}/uploads?file_length=${bytes.length}&file_type=${encodeURIComponent(type)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  })
  const up = await httpJson(`${base}/${session.id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${creds.accessToken}`, file_offset: '0', 'Content-Type': type },
    body: bytes,
    timeoutMs: 60_000,
  })
  if (!up?.h) throw new ProviderError('A Meta não devolveu o identificador da imagem.')
  return String(up.h)
}

async function whatsappAccount(tenantId: string, campaign: Campaign) {
  const account = await pickChannelAccount(tenantId, 'WHATSAPP', campaign.channelAccountId)
  const creds = decryptJson<Record<string, any>>(account.encryptedCredentials) || {}
  return { account, creds }
}

export async function submitCarouselTemplate(tenant: Tenant, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId: tenant.id } })
  if (!campaign) throw notFound('Campanha não encontrada.')
  if (campaign.channel !== 'WHATSAPP') throw badRequest('Só campanhas de WhatsApp precisam de aprovação da Meta.')
  if (campaign.status !== 'DRAFT') throw conflict('Só é possível enviar para aprovação campanhas em rascunho.')
  const carousel = getCarousel(campaign)
  if (!carousel) throw badRequest('Monte os cards do carrossel antes de enviar para aprovação.')
  const { creds } = await whatsappAccount(tenant.id, campaign)
  const name = waTemplateName(campaign.id)

  if (creds.simulated === true) {
    const def = waCarouselTemplateDefinition({ name, opening: campaign.template, carousel, headerHandles: carousel.cards.map(() => 'simulado') })
    return prisma.campaign.update({
      where: { id: campaign.id },
      data: { waTemplate: { name, language: 'pt_BR', params: def.params } as any, waTemplateStatus: 'APPROVED', waTemplateRejection: null },
    })
  }
  if (!creds.wabaId || !creds.accessToken) throw badRequest('Reconecte o WhatsApp pelo botão "Conectar WhatsApp" (falta a conta do WhatsApp Business).')

  const handles: string[] = []
  for (const card of carousel.cards) handles.push(await uploadHeaderHandle(creds, card.imageUrl))
  const { params, ...definition } = waCarouselTemplateDefinition({ name, opening: campaign.template, carousel, headerHandles: handles })
  const d = await httpJson(`${graphBase(creds)}/${creds.wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(definition),
  })
  return prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      waTemplate: { name, language: 'pt_BR', params, metaId: d?.id } as any,
      waTemplateStatus: String(d?.status || 'PENDING').toUpperCase(),
      waTemplateRejection: null,
    },
  })
}

export async function refreshCarouselTemplateStatus(tenant: Tenant, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId: tenant.id } })
  if (!campaign) throw notFound('Campanha não encontrada.')
  const tpl = campaign.waTemplate as { name?: string } | null
  if (!tpl?.name) throw badRequest('Esta campanha ainda não foi enviada para aprovação.')
  const { creds } = await whatsappAccount(tenant.id, campaign)
  if (creds.simulated === true || !creds.wabaId) return campaign
  const d = await httpJson(`${graphBase(creds)}/${creds.wabaId}/message_templates?name=${encodeURIComponent(tpl.name)}&fields=name,status,rejected_reason`, {
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  })
  const row = (d?.data || []).find((x: any) => x.name === tpl.name)
  if (!row) return campaign
  return prisma.campaign.update({
    where: { id: campaign.id },
    data: { waTemplateStatus: String(row.status).toUpperCase(), waTemplateRejection: row.rejected_reason && row.rejected_reason !== 'NONE' ? String(row.rejected_reason) : null },
  })
}

// Webhook "message_template_status_update" da Meta.
export async function applyTemplateStatusUpdate(templateName: string, event: string, reason?: string | null) {
  if (!templateName) return 0
  const r = await prisma.campaign.updateMany({
    where: { waTemplate: { path: ['name'], equals: templateName } },
    data: { waTemplateStatus: String(event || '').toUpperCase(), waTemplateRejection: reason && reason !== 'NONE' ? reason : null },
  })
  return r.count
}

// ---------------------------------------------------------------------------
// Clique: etiqueta, conversa atribuída, nota, automação e aviso ao sistema integrado.
// ---------------------------------------------------------------------------
// Rodízio: o atendente ativo com menos conversas em atendimento humano.
export async function pickAgent(tenantId: string) {
  const users = await prisma.user.findMany({ where: { tenantId, isActive: true, role: { in: ['AGENT', 'ADMIN', 'OWNER'] } }, select: { id: true, role: true } })
  if (!users.length) return null
  const load = await prisma.conversation.groupBy({
    by: ['assignedUserId'],
    where: { tenantId, status: 'HUMAN', assignedUserId: { in: users.map((u) => u.id) } },
    _count: true,
  })
  const count = new Map(load.map((l) => [l.assignedUserId, l._count]))
  // Atendentes primeiro; donos e administradores só quando não houver atendente.
  const order = (r: string) => (r === 'AGENT' ? 0 : r === 'ADMIN' ? 1 : 2)
  return [...users].sort((a, b) => (count.get(a.id) || 0) - (count.get(b.id) || 0) || order(a.role) - order(b.role))[0].id
}

export interface ClickInput {
  tenant: Tenant
  account: ChannelAccount
  channel: Channel
  address: string
  name?: string | null
  campaignId: string
  index: number
  action: 'i' | 'x'
}

export async function registerCarouselClick(input: ClickInput) {
  const { tenant, account, channel, address } = input
  const campaign = await prisma.campaign.findFirst({ where: { id: input.campaignId, tenantId: tenant.id } })
  const carousel = campaign ? getCarousel(campaign) : null
  const card = carousel?.cards[input.index]
  if (!campaign || !carousel || !card) return null
  const contact = await findOrCreateByChannel(tenant.id, channel, address, input.name)
  const recipient = await prisma.campaignRecipient.findFirst({ where: { campaignId: campaign.id, contactId: contact.id }, select: { id: true } })
  const bot = await prisma.botSettings.findUnique({ where: { tenantId: tenant.id } })

  if (input.action === 'x') {
    if (!(await isSuppressed(tenant.id, channel, address))) {
      await suppress(tenant.id, channel, address, 'KEYWORD', { contactId: contact.id, detail: `Botão "${OPT_OUT_BUTTON}" no carrossel ${campaign.name}` })
      await sendMessage({ tenant, channel, contact, text: bot?.optOutConfirmation || 'Pronto, você não vai mais receber nossas mensagens por aqui.', skipUsageCheck: true, metadata: { system: 'opt_out_confirmation' } }).catch(() => null)
      await notifyIntegration(tenant, 'revah.opt_out', { contactId: contact.id, externalRef: contact.externalRef, channel })
    }
    return prisma.campaignClick.create({
      data: { tenantId: tenant.id, campaignId: campaign.id, contactId: contact.id, recipientId: recipient?.id || null, channel, cardIndex: input.index, cardTitle: card.title, action: 'OPT_OUT' },
    })
  }

  await applyTags(tenant.id, contact.id, [card.tag || card.title])
  const conversation = await ensureConversation(tenant.id, contact.id, channel, account.id)
  const agentId = conversation.assignedUserId && conversation.status === 'HUMAN' ? conversation.assignedUserId : await pickAgent(tenant.id)
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { intent: `CARROSSEL: ${card.title}`.slice(0, 120), ...(agentId ? { status: 'HUMAN', assignedUserId: agentId } : {}) },
  })
  await prisma.note.create({ data: { tenantId: tenant.id, contactId: contact.id, kind: 'CAROUSEL_INTEREST', body: `Escolheu "${card.title}" no carrossel "${campaign.name}" (${channel}).` } })
  const click = await prisma.campaignClick.create({
    data: {
      tenantId: tenant.id,
      campaignId: campaign.id,
      contactId: contact.id,
      recipientId: recipient?.id || null,
      channel,
      cardIndex: input.index,
      cardTitle: card.title,
      action: 'INTEREST',
      conversationId: conversation.id,
      assignedUserId: agentId,
    },
  })
  await sendMessage({
    tenant,
    channel,
    contact,
    text: agentId
      ? `Ótimo! Você escolheu ${card.title}. Já avisei nossa equipe e alguém vai falar com você por aqui.`
      : `Ótimo! Você escolheu ${card.title}. Me conte: o que você gostaria de saber?`,
    skipUsageCheck: true,
    metadata: { system: 'carousel_ack', campaignId: campaign.id },
  }).catch(() => null)
  const catalog = card.catalogItemId ? await prisma.catalogItem.findFirst({ where: { id: card.catalogItemId, tenantId: tenant.id } }) : null
  const data = { campaignId: campaign.id, campaignName: campaign.name, card: card.title, cardIndex: input.index, channel, catalogExternalRef: catalog?.externalRef || null }
  await emitEvent(tenant.id, 'carousel.click', { contactId: contact.id, data })
  await notifyIntegration(tenant, 'revah.carousel_click', { ...data, contactId: contact.id, externalRef: contact.externalRef, name: contact.name, phone: contact.phone, email: contact.email })
  return click
}

// ---------------------------------------------------------------------------
// Telegram: callback das setas e dos botões.
// ---------------------------------------------------------------------------
async function tg(creds: Record<string, any>, method: string, body: unknown) {
  return httpJson(`https://api.telegram.org/bot${creds.botToken}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

export async function handleTelegramCallback(tenant: Tenant, account: ChannelAccount, cb: any) {
  const creds = decryptJson<Record<string, any>>(account.encryptedCredentials) || {}
  const parsed = decodePayload(cb?.data)
  const chatId = cb?.message?.chat?.id
  const answer = (text?: string) => (creds.botToken ? tg(creds, 'answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text } : {}) }).catch(() => null) : null)
  if (!parsed || !chatId) return answer()
  const campaign = await prisma.campaign.findFirst({ where: { id: parsed.campaignId, tenantId: tenant.id } })
  const carousel = campaign ? getCarousel(campaign) : null
  if (!campaign || !carousel) return answer('Esta oferta não está mais disponível.')

  if (parsed.action === 'g') {
    const view = telegramCard({ campaignId: campaign.id, carousel, index: parsed.index })
    if (creds.botToken) {
      await tg(creds, 'editMessageMedia', {
        chat_id: chatId,
        message_id: cb.message.message_id,
        media: { type: 'photo', media: view.photo, caption: view.caption },
        reply_markup: view.reply_markup,
      }).catch((e) => console.error('[revah] telegram carrossel', e?.message))
    }
    return answer()
  }
  const name = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(' ') || cb.from?.username
  await registerCarouselClick({ tenant, account, channel: 'TELEGRAM', address: String(chatId), name, campaignId: campaign.id, index: parsed.index, action: parsed.action })
  return answer(parsed.action === 'x' ? 'Pronto, você não vai mais receber.' : 'Recebido! Já avisamos nossa equipe.')
}

// ---------------------------------------------------------------------------
// Torre de Controle: funil e cliques por card.
// ---------------------------------------------------------------------------
export async function carouselStats(tenantId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } })
  if (!campaign) throw notFound('Campanha não encontrada.')
  const carousel = getCarousel(campaign)
  const [messages, clicks, interested] = await Promise.all([
    prisma.message.groupBy({ by: ['status'], where: { tenantId, campaignId, direction: 'OUT' }, _count: true }),
    prisma.campaignClick.groupBy({ by: ['cardIndex', 'action'], where: { campaignId }, _count: true }),
    prisma.campaignClick.findMany({ where: { campaignId, action: 'INTEREST' }, distinct: ['contactId'], select: { contactId: true, conversationId: true, assignedUserId: true } }),
  ])
  const byStatus = (s: string[]) => messages.filter((m) => s.includes(m.status)).reduce((a, m) => a + m._count, 0)
  const optOuts = await prisma.campaignClick.findMany({ where: { campaignId, action: 'OPT_OUT' }, distinct: ['contactId'], select: { contactId: true } })
  const conversationIds = interested.map((c) => c.conversationId).filter(Boolean) as string[]
  const conversations = conversationIds.length
    ? await prisma.conversation.findMany({ where: { id: { in: conversationIds } }, select: { status: true, assignedUserId: true } })
    : []
  const users = await prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } })
  const userName = new Map(users.map((u) => [u.id, u.name]))
  const perAgent = new Map<string, { open: number; total: number }>()
  for (const c of conversations) {
    const key = c.assignedUserId || ''
    const row = perAgent.get(key) || { open: 0, total: 0 }
    row.total += 1
    if (c.status === 'HUMAN') row.open += 1
    perAgent.set(key, row)
  }
  return {
    campaign: { id: campaign.id, name: campaign.name, channel: campaign.channel, status: campaign.status, waTemplateStatus: campaign.waTemplateStatus },
    funnel: {
      recipients: campaign.totalRecipients,
      sent: byStatus(['SENT', 'DELIVERED', 'READ', 'SIMULATED']),
      delivered: byStatus(['DELIVERED', 'READ']),
      read: byStatus(['READ']),
      failed: byStatus(['FAILED']),
      interested: interested.length,
      optOuts: optOuts.length,
    },
    cards: (carousel?.cards || []).map((card, i) => ({
      index: i,
      title: card.title,
      interest: clicks.filter((c) => c.cardIndex === i && c.action === 'INTEREST').reduce((a, c) => a + c._count, 0),
      optOut: clicks.filter((c) => c.cardIndex === i && c.action === 'OPT_OUT').reduce((a, c) => a + c._count, 0),
    })),
    agents: [...perAgent.entries()].map(([id, v]) => ({ userId: id || null, name: id ? userName.get(id) || 'Atendente' : 'Assistente virtual', ...v })),
  }
}

// ---------------------------------------------------------------------------
// Qualidade do número (Meta): alerta e pausa automática das campanhas quando a qualidade cai para baixa.
// ---------------------------------------------------------------------------
const QUALITY_EVERY_MS = 6 * 3600_000

export async function checkWhatsAppQuality() {
  const accounts = await prisma.channelAccount.findMany({ where: { provider: 'META_CLOUD', isActive: true } })
  let checked = 0
  let paused = 0
  for (const account of accounts) {
    const settings = (account.settings || {}) as Record<string, any>
    if (settings.qualityCheckedAt && Date.now() - Date.parse(settings.qualityCheckedAt) < QUALITY_EVERY_MS) continue
    const creds = decryptJson<Record<string, any>>(account.encryptedCredentials) || {}
    if (creds.simulated === true || !creds.phoneNumberId || !creds.accessToken) continue
    try {
      const d = await httpJson(`${graphBase(creds)}/${creds.phoneNumberId}?fields=quality_rating,messaging_limit_tier,verified_name,name_status`, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      })
      const quality = String(d?.quality_rating || 'UNKNOWN').toUpperCase()
      checked += 1
      await prisma.channelAccount.update({
        where: { id: account.id },
        data: { settings: { ...settings, qualityRating: quality, messagingLimitTier: d?.messaging_limit_tier || null, nameStatus: d?.name_status || null, qualityCheckedAt: new Date().toISOString() } },
      })
      if (quality === 'RED' || quality === 'LOW') {
        const r = await prisma.campaign.updateMany({
          where: { tenantId: account.tenantId, channel: 'WHATSAPP', status: { in: ['RUNNING', 'SCHEDULED'] }, OR: [{ channelAccountId: account.id }, { channelAccountId: null }] },
          data: { status: 'PAUSED' },
        })
        paused += r.count
      }
    } catch (e: any) {
      console.error('[revah] qualidade do WhatsApp', account.id, e?.message)
    }
  }
  return { checked, paused }
}
