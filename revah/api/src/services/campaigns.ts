import type { Campaign, Job, Tenant } from '@prisma/client'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { badRequest, conflict, notFound, paymentRequired } from '../lib/errors'
import { contactFieldFor, contactVars, normalizeDestination, renderTemplate, type Channel } from '../lib/normalize'
import { upsertContact } from './contacts'
import { enqueueJob, registerJobHandler, type JobOutcome } from './jobs'
import { sendMessage } from './messaging'
import { assertCanLaunchCampaign } from './plans'
import { suppressedSet } from './suppression'
import { queueCall } from './voice/engine'
import { TRIAL_RULES } from '../config'

export interface Audience {
  tagIds?: string[]
  contactIds?: string[]
  manual?: { name?: string; destination: string }[]
}

interface Target {
  contactId: string | null
  name: string | null
  destination: string | null
  raw: string
}

export async function resolveAudience(tenantId: string, channel: Channel, audience: Audience): Promise<Target[]> {
  const field = contactFieldFor(channel)
  const targets: Target[] = []
  const or: any[] = []
  if (audience.tagIds?.length) or.push({ tags: { some: { tagId: { in: audience.tagIds } } } })
  if (audience.contactIds?.length) or.push({ id: { in: audience.contactIds } })
  if (or.length) {
    const contacts = await prisma.contact.findMany({ where: { tenantId, OR: or }, take: 50_000 })
    for (const c of contacts) {
      const raw = (c as any)[field] || ''
      targets.push({ contactId: c.id, name: c.name, destination: normalizeDestination(channel, raw), raw })
    }
  }
  for (const m of audience.manual || []) {
    targets.push({ contactId: null, name: m.name?.trim() || null, destination: normalizeDestination(channel, m.destination), raw: String(m.destination || '') })
  }
  const seen = new Set<string>()
  return targets.filter((t) => {
    const key = t.destination || `invalid:${t.raw}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function previewAudience(tenantId: string, channel: Channel, audience: Audience) {
  const targets = await resolveAudience(tenantId, channel, audience)
  const valid = targets.filter((t) => t.destination)
  const suppressed = await suppressedSet(tenantId, channel, valid.map((t) => t.destination!))
  return {
    total: targets.length,
    valid: valid.length,
    invalid: targets.length - valid.length,
    suppressed: suppressed.size,
    eligible: valid.length - suppressed.size,
  }
}

export async function launchCampaign(tenant: Tenant, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId: tenant.id } })
  if (!campaign) throw notFound('Campanha não encontrada.')
  if (!['DRAFT', 'SCHEDULED'].includes(campaign.status) || campaign.startedAt) throw conflict('Esta campanha já foi disparada.')
  const channel = campaign.channel as Channel
  const targets = await resolveAudience(tenant.id, channel, (campaign.audience || {}) as Audience)
  const valid = targets.filter((t) => t.destination)
  if (!valid.length) throw badRequest('Nenhum contato válido para este canal.')
  const suppressed = await suppressedSet(tenant.id, channel, valid.map((t) => t.destination!))

  await assertCanLaunchCampaign(tenant, valid.length, channel)

  // Consome 1 das 2 campanhas grátis de forma atômica (sem corrida entre abas/dispositivos).
  let isTrial = false
  if (tenant.plan === 'TRIAL') {
    const r = await prisma.tenant.updateMany({
      where: { id: tenant.id, plan: 'TRIAL', trialCampaignsUsed: { lt: TRIAL_RULES.maxCampaigns } },
      data: { trialCampaignsUsed: { increment: 1 } },
    })
    if (!r.count) throw paymentRequired('Você já usou as 2 campanhas grátis. Escolha um plano para continuar disparando.', 'TRIAL_EXHAUSTED')
    isTrial = true
  }

  // Contatos manuais entram no CRM para manter o histórico unificado.
  for (const t of valid) {
    if (t.contactId) continue
    const { contact } = await upsertContact(tenant.id, { [contactFieldFor(channel)]: t.destination, name: t.name, source: 'CAMPAIGN' } as any, { emit: false })
    t.contactId = contact.id
  }

  const start = campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now() ? campaign.scheduledAt : new Date()
  const rows = targets.map((t) => ({
    campaignId: campaign.id,
    tenantId: tenant.id,
    contactId: t.contactId,
    name: t.name,
    destination: t.destination || `inválido:${t.raw}`.slice(0, 120),
    status: !t.destination ? 'SKIPPED_INVALID' : suppressed.has(t.destination) ? 'SKIPPED_SUPPRESSED' : 'PENDING',
  }))
  await prisma.campaignRecipient.createMany({ data: rows, skipDuplicates: true })
  const skipped = rows.filter((r) => r.status !== 'PENDING').length
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: start.getTime() > Date.now() + 1000 ? 'SCHEDULED' : 'RUNNING',
      isTrial,
      startedAt: new Date(),
      totalRecipients: rows.length,
      skippedCount: skipped,
    },
  })

  const pending = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id, status: 'PENDING' }, orderBy: { destination: 'asc' } })
  if (channel === 'VOICE') {
    for (const r of pending) {
      const contact = await prisma.contact.findUnique({ where: { id: r.contactId! } })
      if (!contact) continue
      const vars = contactVars(contact)
      const call = await queueCall(tenant, {
        contact,
        purpose: campaign.name,
        script: renderTemplate(campaign.voiceScript || campaign.template, vars),
        campaignId: campaign.id,
        runAt: start,
      })
      await prisma.campaignRecipient.update({ where: { id: r.id }, data: { callId: call.id, status: call.status === 'BLOCKED' ? 'SKIPPED_SUPPRESSED' : 'SENT', attemptedAt: new Date() } })
    }
    await refreshCounters(campaign.id)
  } else {
    let i = 0
    for (const r of pending) {
      await enqueueJob(tenant.id, 'CAMPAIGN_SEND', { campaignId: campaign.id, recipientId: r.id }, new Date(start.getTime() + i * config.worker.campaignThrottleMs))
      i++
    }
  }
  if (!pending.length) await refreshCounters(campaign.id)
  return prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })
}

export async function refreshCounters(campaignId: string) {
  const groups = await prisma.campaignRecipient.groupBy({ by: ['status'], where: { campaignId }, _count: true })
  const count = (s: string[]) => groups.filter((g) => s.includes(g.status)).reduce((a, g) => a + g._count, 0)
  const pending = count(['PENDING'])
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) return
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount: count(['SENT']),
      failedCount: count(['FAILED']),
      skippedCount: count(['SKIPPED_SUPPRESSED', 'SKIPPED_INVALID']),
      ...(pending === 0 && ['RUNNING', 'SCHEDULED'].includes(campaign.status) ? { status: 'COMPLETED', completedAt: new Date() } : {}),
    },
  })
}

async function campaignSendJob(job: Job): Promise<JobOutcome> {
  const { campaignId, recipientId } = job.payload as { campaignId: string; recipientId: string }
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId: job.tenantId } })
  const recipient = await prisma.campaignRecipient.findUnique({ where: { id: recipientId } })
  if (!campaign || !recipient || recipient.status !== 'PENDING') return
  if (campaign.status === 'PAUSED') return { reschedule: new Date(Date.now() + 5 * 60_000), reason: 'Campanha pausada.' }
  if (campaign.status === 'CANCELED') {
    await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'FAILED', error: 'Campanha cancelada.' } })
    return refreshCounters(campaign.id)
  }
  if (campaign.status === 'SCHEDULED') await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'RUNNING' } })

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: job.tenantId } })
  if (['SUSPENDED', 'CANCELED', 'PAST_DUE'].includes(tenant.status)) return { reschedule: new Date(Date.now() + 30 * 60_000), reason: 'Conta sem assinatura ativa.' }
  const contact = recipient.contactId ? await prisma.contact.findUnique({ where: { id: recipient.contactId } }) : null
  const vars = contactVars(contact || { name: recipient.name })
  const tpl = campaign.waTemplate as { name: string; language?: string; params?: string[] } | null
  const r = await sendMessage({
    tenant,
    channel: campaign.channel as Channel,
    contact,
    destination: recipient.destination,
    text: renderTemplate(campaign.template, vars),
    subject: campaign.subject ? renderTemplate(campaign.subject, vars) : null,
    template: tpl?.name ? { ...tpl, params: (tpl.params || []).map((p) => renderTemplate(p, vars)) } : null,
    channelAccountId: campaign.channelAccountId,
    campaignId: campaign.id,
    appendOptOutHint: campaign.appendOptOutHint,
    skipUsageCheck: true,
  })
  await prisma.campaignRecipient.update({
    where: { id: recipient.id },
    data: {
      status: r.ok ? 'SENT' : r.code === 'SUPPRESSED' ? 'SKIPPED_SUPPRESSED' : 'FAILED',
      messageId: r.message.id,
      error: r.ok ? null : r.error,
      attemptedAt: new Date(),
    },
  })
  await refreshCounters(campaign.id)
}

export async function setCampaignStatus(tenant: Tenant, id: string, action: 'pause' | 'resume' | 'cancel'): Promise<Campaign> {
  const c = await prisma.campaign.findFirst({ where: { id, tenantId: tenant.id } })
  if (!c) throw notFound('Campanha não encontrada.')
  const next =
    action === 'pause' && ['RUNNING', 'SCHEDULED'].includes(c.status)
      ? 'PAUSED'
      : action === 'resume' && c.status === 'PAUSED'
        ? 'RUNNING'
        : action === 'cancel' && !['COMPLETED', 'CANCELED'].includes(c.status)
          ? 'CANCELED'
          : null
  if (!next) throw conflict('Ação indisponível para o status atual.')
  if (next === 'CANCELED' && c.channel === 'VOICE') {
    await prisma.call.updateMany({ where: { campaignId: c.id, status: 'QUEUED' }, data: { status: 'CANCELED' } })
  }
  return prisma.campaign.update({ where: { id: c.id }, data: { status: next, ...(next === 'CANCELED' ? { completedAt: new Date() } : {}) } })
}

registerJobHandler('CAMPAIGN_SEND', campaignSendJob)
