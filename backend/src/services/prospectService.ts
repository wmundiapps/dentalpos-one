import { randomBytes } from 'crypto'
import { prisma } from '../lib/prisma'
import { renderProspectEmail } from './prospectTemplates'

export const PUBLIC_BASE = (process.env.PROSPECT_PUBLIC_BASE || 'https://api.dentalpos.com.br/api').replace(/\/$/, '')
export const LANDING_URL = process.env.PROSPECT_LANDING_URL || 'https://one.dentalpos.com.br/landingpage'
const ADMIN_EMAIL = process.env.PROSPECT_ADMIN_EMAIL || 'contato@dentalpos.com.br'
const REPLY_TO = process.env.PROSPECT_REPLY_TO || 'contato@dentalpos.com.br'
const INTERNAL_FROM = 'DentalPos One <contato@dentalpos.com.br>'
const MAX_PER_RUN = 60
const SEND_DELAY_MS = 650

export const ACTIVE_STATUSES = ['NOVO', 'EM_SEQUENCIA']
export const FINAL_STATUSES = ['DESCADASTRADO', 'BOUNCE', 'EXCLUIDO', 'CONVERTIDO']

const WEBMAIL_DOMAINS = [
  'gmail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com', 'yahoo.com', 'yahoo.com.br',
  'bol.com.br', 'uol.com.br', 'terra.com.br', 'ig.com.br', 'icloud.com', 'msn.com', 'globo.com', 'globomail.com',
]

export function newToken() {
  return randomBytes(18).toString('base64url')
}

export function isWebmail(email: string) {
  const domain = email.split('@')[1]?.toLowerCase() || ''
  return WEBMAIL_DOMAINS.includes(domain)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function getConfig() {
  return prisma.prospectConfig.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } })
}

export async function logEvent(leadId: string, type: string, extra: { step?: number; detail?: string; providerId?: string | null } = {}) {
  try {
    await prisma.prospectEvent.create({
      data: { leadId, type, step: extra.step ?? null, detail: extra.detail ?? null, providerId: extra.providerId ?? null },
    })
  } catch (error) {
    console.error('Falha ao registrar evento de prospecção:', error)
  }
}

async function resendSend(input: {
  from: string
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
}): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY || ''
  if (!apiKey) throw new Error('RESEND_API_KEY não configurada.')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo,
      headers: input.headers,
      tags: input.tags,
    }),
  })
  const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null
  if (!response.ok) throw new Error(body?.message || `Resend HTTP ${response.status}`)
  return body?.id || null
}

function linksFor(token: string, step: number) {
  return {
    click: `${PUBLIC_BASE}/p/c/${token}?s=${step}`,
    unsubscribe: `${PUBLIC_BASE}/p/u/${token}`,
  }
}

type LeadForSend = {
  id: string
  email: string | null
  displayName: string
  razaoSocial: string
  cnpj: string
  city: string | null
  uf: string
  segment: string
  token: string
  lastStep: number
}

export async function sendStep(lead: LeadForSend, step: number, overrideTo?: string) {
  const from = process.env.PROSPECT_FROM || ''
  if (!from) throw new Error('PROSPECT_FROM não configurado (use o domínio de envio separado).')
  const to = overrideTo || lead.email
  if (!to) throw new Error('Lead sem e-mail.')
  const links = linksFor(lead.token, step)
  const email = renderProspectEmail(lead, step, links)
  return resendSend({
    from,
    to,
    subject: overrideTo ? `[TESTE] ${email.subject}` : email.subject,
    html: email.html,
    text: email.text,
    replyTo: REPLY_TO,
    headers: {
      'List-Unsubscribe': `<${links.unsubscribe}>, <mailto:${REPLY_TO}?subject=descadastrar>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [
      { name: 'origem', value: 'prospeccao' },
      { name: 'etapa', value: String(step) },
    ],
  })
}

function startOfTodayBrazil() {
  const now = new Date()
  const brazil = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  brazil.setUTCHours(0, 0, 0, 0)
  return new Date(brazil.getTime() + 3 * 60 * 60 * 1000)
}

export async function sentToday() {
  return prisma.prospectEvent.count({ where: { type: 'ENVIO', createdAt: { gte: startOfTodayBrazil() } } })
}

// Marca como CONVERTIDO quem já criou conta no DentalPos One com o mesmo e-mail.
export async function markConversions() {
  const leads = await prisma.prospectLead.findMany({
    where: { email: { not: null }, status: { notIn: FINAL_STATUSES } },
    select: { id: true, email: true },
  })
  let converted = 0
  for (let i = 0; i < leads.length; i += 500) {
    const chunk = leads.slice(i, i + 500)
    const emails = chunk.map((lead) => String(lead.email))
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } })
    const found = new Set(users.map((user) => user.email.toLowerCase()))
    for (const lead of chunk) {
      if (lead.email && found.has(lead.email.toLowerCase())) {
        await prisma.prospectLead.update({ where: { id: lead.id }, data: { status: 'CONVERTIDO' } })
        await logEvent(lead.id, 'CONVERTIDO', { detail: 'Criou conta no DentalPos One com este e-mail.' })
        converted += 1
      }
    }
  }
  return converted
}

export async function runSequence(options: { force?: boolean; dryRun?: boolean } = {}) {
  const config = await getConfig()
  if (!config.sendingEnabled && !options.force) {
    return { skipped: true, reason: 'Envio desligado no painel de prospecção.' }
  }

  const converted = await markConversions()
  const alreadyToday = await sentToday()
  const remaining = Math.max(0, Math.min(config.dailyLimit - alreadyToday, MAX_PER_RUN))
  if (remaining === 0) return { skipped: true, reason: 'Limite diário atingido.', converted, sentToday: alreadyToday }

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const segments = config.segments.split(',').map((s) => s.trim()).filter(Boolean)
  const baseWhere = { email: { not: null }, segment: { in: segments.length ? segments : ['CLINICA'] } }

  const step3 = await prisma.prospectLead.findMany({
    where: { ...baseWhere, status: 'EM_SEQUENCIA', lastStep: 2, firstSentAt: { lte: new Date(now - config.step3AfterDays * day) } },
    orderBy: { lastSentAt: 'asc' },
    take: remaining,
  })
  const step2 = await prisma.prospectLead.findMany({
    where: { ...baseWhere, status: 'EM_SEQUENCIA', lastStep: 1, lastSentAt: { lte: new Date(now - config.step2AfterDays * day) } },
    orderBy: { lastSentAt: 'asc' },
    take: Math.max(0, remaining - step3.length),
  })
  const fresh = await prisma.prospectLead.findMany({
    where: { ...baseWhere, status: 'NOVO', ...(config.sendToWebmail ? {} : { emailType: 'CORPORATIVO' }) },
    orderBy: [{ isMatriz: 'desc' }, { createdAt: 'asc' }],
    take: Math.max(0, remaining - step3.length - step2.length),
  })

  const queue: Array<{ lead: (typeof fresh)[number]; step: number }> = [
    ...step3.map((lead) => ({ lead, step: 3 })),
    ...step2.map((lead) => ({ lead, step: 2 })),
    ...fresh.map((lead) => ({ lead, step: 1 })),
  ]

  const emails = queue.map((item) => String(item.lead.email).toLowerCase())
  const suppressed = new Set(
    (await prisma.prospectSuppression.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((row) => row.email),
  )

  let sent = 0
  let errors = 0
  let consecutiveErrors = 0
  const preview: Array<{ cnpj: string; email: string | null; step: number }> = []

  for (const { lead, step } of queue) {
    const email = String(lead.email).toLowerCase()
    if (suppressed.has(email)) {
      await prisma.prospectLead.update({ where: { id: lead.id }, data: { status: 'DESCADASTRADO' } })
      await logEvent(lead.id, 'STATUS', { detail: 'E-mail na lista de bloqueio.' })
      continue
    }
    if (options.dryRun) {
      preview.push({ cnpj: lead.cnpj, email: lead.email, step })
      continue
    }
    try {
      const providerId = await sendStep(lead, step)
      const at = new Date()
      await prisma.prospectLead.update({
        where: { id: lead.id },
        data: {
          lastStep: step,
          lastSentAt: at,
          firstSentAt: lead.firstSentAt || at,
          status: step >= 3 ? 'SEQUENCIA_CONCLUIDA' : 'EM_SEQUENCIA',
        },
      })
      await logEvent(lead.id, 'ENVIO', { step, providerId, detail: `E-mail ${step} enviado para ${email}` })
      sent += 1
      consecutiveErrors = 0
    } catch (error) {
      errors += 1
      consecutiveErrors += 1
      await logEvent(lead.id, 'ERRO_ENVIO', { step, detail: error instanceof Error ? error.message : String(error) })
      if (consecutiveErrors >= 3) break
    }
    await sleep(SEND_DELAY_MS)
  }

  return { skipped: false, sent, errors, converted, queued: queue.length, sentToday: alreadyToday + sent, preview: options.dryRun ? preview : undefined }
}

async function notifyHotLead(lead: { displayName: string; razaoSocial: string; cnpj: string; email: string | null; phone1: string | null; phone2: string | null; city: string | null; uf: string }, step: number) {
  try {
    const content = [
      'Lead quente na prospecção do DentalPos One (clicou no e-mail):',
      '',
      `Clínica: ${lead.displayName} (${lead.razaoSocial})`,
      `CNPJ: ${lead.cnpj}`,
      `Cidade: ${lead.city || '-'} / ${lead.uf}`,
      `E-mail: ${lead.email || '-'}`,
      `Telefone: ${[lead.phone1, lead.phone2].filter(Boolean).join(' / ') || '-'}`,
      `Clicou no e-mail ${step} da sequência.`,
      '',
      'Sugestão: ligar ainda hoje. Painel: https://app.dentalpos.com.br/prospeccao',
    ].join('\n')
    await resendSend({
      from: INTERNAL_FROM,
      to: ADMIN_EMAIL,
      subject: `Lead quente: ${lead.displayName} — ${lead.city || lead.uf}`,
      html: `<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${content.replace(/</g, '&lt;')}</pre>`,
      text: content,
    })
  } catch (error) {
    console.error('Falha ao avisar lead quente:', error)
  }
}

export async function handleClick(token: string, step: number) {
  const lead = await prisma.prospectLead.findUnique({ where: { token } })
  if (!lead) return null
  await logEvent(lead.id, 'CLIQUE', { step })
  if (!FINAL_STATUSES.includes(lead.status) && lead.status !== 'QUENTE' && lead.status !== 'RESPONDEU') {
    await prisma.prospectLead.update({ where: { id: lead.id }, data: { status: 'QUENTE', hotAt: new Date() } })
    await notifyHotLead(lead, step)
  }
  return lead
}

export async function suppress(email: string, reason: string) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return
  await prisma.prospectSuppression.upsert({ where: { email: normalized }, update: { reason }, create: { email: normalized, reason } })
}

export async function handleUnsubscribe(token: string) {
  const lead = await prisma.prospectLead.findUnique({ where: { token } })
  if (!lead) return null
  if (lead.email) await suppress(lead.email, 'DESCADASTRO')
  if (lead.status !== 'DESCADASTRADO') {
    await prisma.prospectLead.update({ where: { id: lead.id }, data: { status: 'DESCADASTRADO' } })
    await logEvent(lead.id, 'DESCADASTRO', { detail: 'Pediu para não receber mais e-mails.' })
  }
  return lead
}

export async function handleProviderEvent(type: string, providerId: string, to: string[]) {
  const event = providerId ? await prisma.prospectEvent.findFirst({ where: { providerId, type: 'ENVIO' } }) : null
  const isBounce = type === 'email.bounced'
  const isComplaint = type === 'email.complained'
  if (!isBounce && !isComplaint) return false
  for (const address of to) await suppress(address, isBounce ? 'BOUNCE' : 'RECLAMACAO')
  if (event) {
    await prisma.prospectLead.update({ where: { id: event.leadId }, data: { status: isBounce ? 'BOUNCE' : 'DESCADASTRADO' } })
    await logEvent(event.leadId, isBounce ? 'BOUNCE' : 'RECLAMACAO', { detail: `Retorno do provedor: ${type}`, providerId })
  }
  return true
}
