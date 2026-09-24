import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ah, badRequest, conflict, notFound } from '../lib/errors'
import { CHANNELS, contactVars, renderTemplate, type Channel } from '../lib/normalize'
import type { AuthedRequest } from '../middleware/auth'
import { audit } from '../services/audit'
import { launchCampaign, previewAudience, setCampaignStatus, type Audience } from '../services/campaigns'
import { sendMessage } from '../services/messaging'
import { trialStatus } from '../services/plans'
import { TRIAL_RULES } from '../config'

const r = Router()

const AudienceSchema = z.object({
  tagIds: z.array(z.string()).optional(),
  contactIds: z.array(z.string()).optional(),
  manual: z.array(z.object({ name: z.string().max(200).optional(), destination: z.string().max(200) })).max(50_000).optional(),
})

const CampaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  channel: z.enum(CHANNELS as [string, ...string[]]),
  channelAccountId: z.string().nullable().optional(),
  template: z.string().trim().min(1).max(4096),
  subject: z.string().max(200).nullable().optional(),
  voiceScript: z.string().max(4000).nullable().optional(),
  waTemplate: z.object({ name: z.string(), language: z.string().optional(), params: z.array(z.string()).optional() }).nullable().optional(),
  audience: AudienceSchema,
  scheduledAt: z.string().datetime().nullable().optional(),
  appendOptOutHint: z.boolean().optional(),
})

r.get(
  '/campaigns',
  ah(async (req: AuthedRequest, res) => {
    res.json(await prisma.campaign.findMany({ where: { tenantId: req.tenant.id }, orderBy: { createdAt: 'desc' }, take: 200 }))
  }),
)

r.post(
  '/campaigns',
  ah(async (req: AuthedRequest, res) => {
    const b = CampaignSchema.parse(req.body)
    if (['INSTAGRAM', 'MESSENGER'].includes(b.channel)) throw badRequest('Instagram e Messenger só permitem responder conversas iniciadas pelo cliente. Use automações/inbox.')
    if (b.channel === 'EMAIL' && !b.subject) throw badRequest('Informe o assunto do e-mail.')
    const c = await prisma.campaign.create({
      data: {
        tenantId: req.tenant.id,
        name: b.name,
        channel: b.channel,
        channelAccountId: b.channelAccountId || null,
        template: b.template,
        subject: b.subject || null,
        voiceScript: b.voiceScript || null,
        waTemplate: (b.waTemplate as any) || undefined,
        audience: b.audience as any,
        scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null,
        appendOptOutHint: b.appendOptOutHint ?? true,
        createdById: req.user.id,
      },
    })
    await audit(req.tenant.id, req.user.id, 'CAMPAIGN_CREATE', 'Campaign', c.id)
    res.status(201).json(c)
  }),
)

r.get(
  '/campaigns/:id',
  ah(async (req: AuthedRequest, res) => {
    const c = await prisma.campaign.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!c) throw notFound('Campanha não encontrada.')
    const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: c.id }, orderBy: { destination: 'asc' }, take: 1000 })
    res.json({ ...c, recipients })
  }),
)

r.patch(
  '/campaigns/:id',
  ah(async (req: AuthedRequest, res) => {
    const c = await prisma.campaign.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!c) throw notFound('Campanha não encontrada.')
    if (c.status !== 'DRAFT') throw conflict('Só é possível editar campanhas em rascunho.')
    const b = CampaignSchema.partial().parse(req.body)
    const updated = await prisma.campaign.update({
      where: { id: c.id },
      data: {
        ...(b.name ? { name: b.name } : {}),
        ...(b.channel ? { channel: b.channel } : {}),
        ...(b.channelAccountId !== undefined ? { channelAccountId: b.channelAccountId } : {}),
        ...(b.template ? { template: b.template } : {}),
        ...(b.subject !== undefined ? { subject: b.subject } : {}),
        ...(b.voiceScript !== undefined ? { voiceScript: b.voiceScript } : {}),
        ...(b.waTemplate !== undefined ? { waTemplate: (b.waTemplate as any) ?? undefined } : {}),
        ...(b.audience ? { audience: b.audience as any } : {}),
        ...(b.scheduledAt !== undefined ? { scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null } : {}),
        ...(b.appendOptOutHint !== undefined ? { appendOptOutHint: b.appendOptOutHint } : {}),
      },
    })
    res.json(updated)
  }),
)

r.delete(
  '/campaigns/:id',
  ah(async (req: AuthedRequest, res) => {
    const c = await prisma.campaign.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!c) throw notFound('Campanha não encontrada.')
    if (c.status !== 'DRAFT') throw conflict('Campanhas já disparadas ficam no histórico; use cancelar.')
    await prisma.campaign.delete({ where: { id: c.id } })
    res.json({ ok: true })
  }),
)

// Prévia do público: válidos, inválidos, bloqueados e se cabe no teste grátis.
r.post(
  '/campaigns/preview-audience',
  ah(async (req: AuthedRequest, res) => {
    const b = z.object({ channel: z.enum(CHANNELS as [string, ...string[]]), audience: AudienceSchema }).parse(req.body)
    const p = await previewAudience(req.tenant.id, b.channel as Channel, b.audience as Audience)
    const trial = trialStatus(req.tenant)
    res.json({ ...p, trial, fitsTrial: !trial.isTrial || p.valid <= TRIAL_RULES.maxRecipientsPerCampaign })
  }),
)

r.post(
  '/campaigns/:id/launch',
  ah(async (req: AuthedRequest, res) => {
    const c = await launchCampaign(req.tenant, req.params.id)
    await audit(req.tenant.id, req.user.id, 'CAMPAIGN_LAUNCH', 'Campaign', c.id, { total: c.totalRecipients, trial: c.isTrial })
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.tenant.id } })
    res.json({ campaign: c, trial: trialStatus(tenant) })
  }),
)

for (const action of ['pause', 'resume', 'cancel'] as const) {
  r.post(
    `/campaigns/:id/${action}`,
    ah(async (req: AuthedRequest, res) => {
      const c = await setCampaignStatus(req.tenant, req.params.id, action)
      await audit(req.tenant.id, req.user.id, `CAMPAIGN_${action.toUpperCase()}`, 'Campaign', c.id)
      res.json(c)
    }),
  )
}

// Envio de teste para um único destino (não consome campanha grátis).
r.post(
  '/campaigns/:id/test',
  ah(async (req: AuthedRequest, res) => {
    const c = await prisma.campaign.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!c) throw notFound('Campanha não encontrada.')
    if (c.channel === 'VOICE') throw badRequest('Para testar voz, use "Ligar agora" em REVAH Voice.')
    const destination = String(req.body?.destination || '')
    const vars = contactVars({ name: req.body?.name || req.user.name }, { minha_empresa: req.tenant.name })
    const tpl = c.waTemplate as any
    const out = await sendMessage({
      tenant: req.tenant,
      channel: c.channel as Channel,
      destination,
      text: renderTemplate(c.template, vars),
      subject: c.subject ? `[TESTE] ${renderTemplate(c.subject, vars)}` : null,
      template: tpl?.name ? { ...tpl, params: (tpl.params || []).map((p: string) => renderTemplate(p, vars)) } : null,
      channelAccountId: c.channelAccountId,
      appendOptOutHint: c.appendOptOutHint,
      userId: req.user.id,
      metadata: { test: true, campaignId: c.id },
    })
    res.json({ ok: out.ok, status: out.message.status, error: out.ok ? null : out.error })
  }),
)

export default r
