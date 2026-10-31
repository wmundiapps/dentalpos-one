import { createHash, randomBytes, randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { dispatchRevah, type RevahChannel } from './revahProviderService'

// Indicador profissional. O paciente informa nome, WhatsApp, cidade e servico; o sistema mostra
// quantos profissionais ha em cada cidade e SO abre os nomes da cidade em que ele clicar.
// O contato do profissional nunca aparece: o aviso sai por mensagem automatica (e-mail, SMS, WhatsApp ou Telegram).

export const CONSENT_VERSION = '2026-10-31'
export const CONSENT_TEXT =
  'Autorizo o DentalPos a usar meu nome, WhatsApp, cidade e o serviço que procuro apenas para me indicar profissionais e para enviar meus dados SOMENTE ao(s) profissional(is) que eu escolher, que poderá(ão) falar comigo pelo WhatsApp informado. Posso pedir a exclusão dos meus dados pelo e-mail contato@dentalpos.com.br.'

export const SERVICES = [
  'Clínica geral e limpeza', 'Ortodontia (aparelho)', 'Implantes', 'Endodontia (canal)', 'Periodontia (gengiva)',
  'Odontopediatria', 'Estética e lentes', 'Próteses', 'Cirurgia', 'Harmonização orofacial', 'Urgência odontológica',
]

export class FinderError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const text = (v: unknown) => String(v ?? '').trim()
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const sha = (v: string) => createHash('sha256').update(v).digest('hex')
export const slugify = (v: string) => text(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

function normalizePhone(v: unknown) {
  let d = digits(v)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return null
  if (d.length === 11 && d[2] !== '9') return null
  if (Number(d.slice(0, 2)) < 11) return null
  return `55${d}`
}

const DAY = 86_400_000

// ---------- lado do paciente (publico) ----------

export function finderOptions() {
  return { services: SERVICES, consentText: CONSENT_TEXT, consentVersion: CONSENT_VERSION }
}

export async function createLead(input: { name?: unknown; whatsapp?: unknown; city?: unknown; state?: unknown; service?: unknown; consent?: unknown }, ip: string) {
  const name = text(input.name)
  const whatsapp = normalizePhone(input.whatsapp)
  const city = text(input.city)
  const state = text(input.state).toUpperCase().slice(0, 2)
  const service = SERVICES.find(s => s === text(input.service))
  if (name.length < 3 || name.length > 80) throw new FinderError('Informe seu nome.')
  if (!whatsapp) throw new FinderError('Informe um WhatsApp válido, com DDD.')
  if (!city || city.length > 80) throw new FinderError('Informe sua cidade.')
  if (!service) throw new FinderError('Escolha o serviço que você procura.')
  if (input.consent !== true) throw new FinderError('É necessário autorizar o uso dos seus dados para continuar.')

  const ipHash = sha(`ip:${ip}`)
  const since = new Date(Date.now() - DAY)
  const [byPhone, byIp] = await Promise.all([
    prisma.professionalLead.count({ where: { whatsapp, createdAt: { gte: since } } }),
    prisma.professionalLead.count({ where: { ipHash, createdAt: { gte: new Date(Date.now() - 3_600_000) } } }),
  ])
  if (byPhone >= 5 || byIp >= 10) throw new FinderError('Muitas buscas em pouco tempo. Tente de novo mais tarde.', 429)

  const token = randomBytes(32).toString('base64url')
  const citySlug = slugify(city)
  const lead = await prisma.professionalLead.create({
    data: { id: randomUUID(), name, whatsapp, city, citySlug, state: state || null, service, tokenHash: sha(token), consentAt: new Date(), consentVersion: CONSENT_VERSION, ipHash },
  })

  // So contagem por cidade. Nenhum nome e aberto aqui.
  const rows = await prisma.professionalListing.findMany({ where: { active: true }, select: { city: true, citySlug: true, state: true, services: true } })
  const groups = new Map<string, { citySlug: string; city: string; state: string; count: number }>()
  for (const r of rows) {
    const list = Array.isArray(r.services) ? (r.services as string[]) : []
    if (!list.includes(service)) continue
    const g = groups.get(r.citySlug) || { citySlug: r.citySlug, city: r.city, state: r.state, count: 0 }
    g.count += 1
    groups.set(r.citySlug, g)
  }
  const cities = [...groups.values()].sort((a, b) => Number(b.citySlug === citySlug) - Number(a.citySlug === citySlug) || a.city.localeCompare(b.city, 'pt-BR'))
  return { leadId: lead.id, token, service, cities }
}

async function leadFromToken(token: unknown) {
  const t = text(token)
  if (t.length < 20) throw new FinderError('Sessão inválida. Comece a busca de novo.', 401)
  const lead = await prisma.professionalLead.findUnique({ where: { tokenHash: sha(t) } })
  if (!lead || Date.now() - lead.createdAt.getTime() > 2 * DAY) throw new FinderError('Sessão expirada. Comece a busca de novo.', 401)
  return lead
}

// Abre os nomes de UMA cidade (a que o paciente clicou). Limite de 3 cidades por busca, contra varredura.
export async function revealCity(token: unknown, citySlugRaw: unknown) {
  const lead = await leadFromToken(token)
  const citySlug = slugify(text(citySlugRaw))
  if (!citySlug) throw new FinderError('Escolha uma cidade.')

  const already = await prisma.professionalLeadReveal.findUnique({ where: { leadId_citySlug: { leadId: lead.id, citySlug } } })
  if (!already) {
    const opened = await prisma.professionalLeadReveal.count({ where: { leadId: lead.id } })
    if (opened >= 3) throw new FinderError('Você já abriu 3 cidades nesta busca. Faça uma nova busca para ver outras.', 429)
    await prisma.professionalLeadReveal.create({ data: { id: randomUUID(), leadId: lead.id, citySlug } })
  }

  const rows = await prisma.professionalListing.findMany({ where: { active: true, citySlug }, orderBy: { displayName: 'asc' } })
  const contacted = await prisma.professionalLeadContact.findMany({ where: { leadId: lead.id }, select: { listingId: true } })
  const done = new Set(contacted.map(c => c.listingId))
  return {
    professionals: rows
      .filter(r => (Array.isArray(r.services) ? (r.services as string[]) : []).includes(lead.service))
      .map(r => ({ listingId: r.id, displayName: r.displayName, specialty: r.specialty, city: r.city, state: r.state, about: r.about, services: r.services, contacted: done.has(r.id) })),
  }
}

type ChannelConfig = { email?: string; whatsapp?: string; sms?: string; telegramChatId?: string }

function platformCredentials(channel: RevahChannel, subject?: string): Record<string, any> | null {
  if (channel === 'EMAIL') return process.env.RESEND_API_KEY ? { apiKey: process.env.RESEND_API_KEY, from: 'DentalPos <contato@dentalpos.com.br>', subject } : null
  if (channel === 'SMS') return process.env.COMTELE_API_KEY ? { apiKey: process.env.COMTELE_API_KEY } : null
  if (channel === 'TELEGRAM') return process.env.TELEGRAM_BOT_TOKEN ? { botToken: process.env.TELEGRAM_BOT_TOKEN } : null
  if (channel === 'WHATSAPP') {
    const { META_PHONE_NUMBER_ID: phoneNumberId, META_ACCESS_TOKEN: accessToken, META_FINDER_TEMPLATE: templateName } = process.env
    return phoneNumberId && accessToken ? { phoneNumberId, accessToken, templateName: templateName || undefined, templateLanguage: 'pt_BR' } : null
  }
  return null
}

// O paciente escolheu o profissional: o sistema avisa o profissional. Nada do contato dele volta ao paciente.
export async function contactProfessional(token: unknown, listingId: unknown) {
  const lead = await leadFromToken(token)
  const listing = await prisma.professionalListing.findFirst({ where: { id: text(listingId), active: true } })
  if (!listing) throw new FinderError('Profissional indisponível.', 404)
  // So contata quem esta na cidade que o paciente abriu.
  const opened = await prisma.professionalLeadReveal.findUnique({ where: { leadId_citySlug: { leadId: lead.id, citySlug: listing.citySlug } } })
  if (!opened) throw new FinderError('Abra a cidade antes de escolher o profissional.', 403)
  const dup = await prisma.professionalLeadContact.findUnique({ where: { leadId_listingId: { leadId: lead.id, listingId: listing.id } } })
  if (dup) return { ok: true, repetido: true }
  if ((await prisma.professionalLeadContact.count({ where: { leadId: lead.id } })) >= 5) throw new FinderError('Você já enviou 5 pedidos nesta busca.', 429)

  const channels = (listing.channels || {}) as ChannelConfig
  const body = [
    'DentalPos - novo paciente procurando você',
    '',
    `Serviço: ${lead.service}`,
    `Cidade: ${lead.city}${lead.state ? `/${lead.state}` : ''}`,
    `Nome: ${lead.name}`,
    `WhatsApp: +${lead.whatsapp}`,
    '',
    'O paciente escolheu você no indicador profissional do DentalPos e autorizou este contato. Responda pelo WhatsApp informado.',
    'Mensagem automática do sistema. Não responda por aqui.',
  ].join('\n')

  const plan: { channel: RevahChannel; to?: string }[] = [
    { channel: 'EMAIL', to: channels.email },
    { channel: 'WHATSAPP', to: channels.whatsapp },
    { channel: 'SMS', to: channels.sms },
    { channel: 'TELEGRAM', to: channels.telegramChatId },
  ]
  const result: Record<string, string> = {}
  for (const p of plan) {
    if (!p.to) continue
    const creds = platformCredentials(p.channel, 'Novo paciente procurando você no DentalPos')
    if (!creds) { result[p.channel] = 'INDISPONIVEL'; continue }
    try { await dispatchRevah(p.channel, p.to, p.channel === 'WHATSAPP' ? body.replace(/\n+/g, ' | ') : body, creds); result[p.channel] = 'ENVIADO' }
    catch (error) { console.error('Falha ao avisar profissional:', p.channel, error instanceof Error ? error.message : 'erro'); result[p.channel] = 'FALHOU' }
  }
  const sent = Object.values(result).some(v => v === 'ENVIADO')
  await prisma.professionalLeadContact.create({
    data: { id: randomUUID(), leadId: lead.id, listingId: listing.id, clinicId: listing.clinicId, tenantId: listing.tenantId, status: sent ? 'ENVIADO' : 'FALHOU', channels: result },
  })
  if (!sent) throw new FinderError('Não conseguimos avisar o profissional agora. Tente de novo em alguns minutos.', 502)
  return { ok: true }
}

// ---------- lado do profissional (logado) ----------

export async function getListing(clinicId: string) {
  const l = await prisma.professionalListing.findUnique({ where: { clinicId } })
  const contacts = await prisma.professionalLeadContact.count({ where: { clinicId } })
  const available = { EMAIL: Boolean(process.env.RESEND_API_KEY), SMS: Boolean(process.env.COMTELE_API_KEY), TELEGRAM: Boolean(process.env.TELEGRAM_BOT_TOKEN), WHATSAPP: Boolean(process.env.META_PHONE_NUMBER_ID && process.env.META_ACCESS_TOKEN) }
  return { listing: l ? { ...l, createdAt: undefined, updatedAt: undefined } : null, contacts, available, consentText: PROFESSIONAL_CONSENT }
}

export const PROFESSIONAL_CONSENT =
  'Autorizo aparecer no indicador profissional do DentalPos apenas com meu nome de exibição, especialidade, cidade e serviços, e receber por mensagem automática (e-mail, SMS, WhatsApp ou Telegram) os dados de pacientes que me escolherem. Meu contato nunca é exibido ao público. Sigo as regras de publicidade do CFO e posso sair do indicador quando quiser.'

export async function saveListing(clinicId: string, tenantId: string, input: any) {
  const displayName = text(input.displayName)
  const city = text(input.city)
  const state = text(input.state).toUpperCase().slice(0, 2)
  const services = (Array.isArray(input.services) ? input.services : []).map(text).filter((s: string) => SERVICES.includes(s))
  const email = text(input.channels?.email).toLowerCase()
  const whatsapp = digits(input.channels?.whatsapp)
  const sms = digits(input.channels?.sms)
  const telegramChatId = text(input.channels?.telegramChatId)
  const active = input.active === true
  if (displayName.length < 3 || displayName.length > 80) throw new FinderError('Informe o nome que aparecerá para os pacientes.')
  if (!city || state.length !== 2) throw new FinderError('Informe cidade e estado (UF).')
  if (!services.length) throw new FinderError('Escolha ao menos um serviço.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FinderError('Informe um e-mail para receber os pacientes.')
  if (active && input.consent !== true) throw new FinderError('Aceite os termos para aparecer no indicador.')
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) throw new FinderError('WhatsApp inválido.')
  if (sms && (sms.length < 10 || sms.length > 13)) throw new FinderError('Número de SMS inválido.')

  const data = {
    tenantId, active, displayName, specialty: text(input.specialty) || null, city, citySlug: slugify(city), state, services,
    about: text(input.about).slice(0, 400) || null,
    channels: { email, ...(whatsapp ? { whatsapp } : {}), ...(sms ? { sms } : {}), ...(telegramChatId ? { telegramChatId } : {}) },
    updatedAt: new Date(),
  }
  const existing = await prisma.professionalListing.findUnique({ where: { clinicId } })
  const row = existing
    ? await prisma.professionalListing.update({ where: { clinicId }, data: { ...data, ...(active && !existing.consentAt ? { consentAt: new Date() } : {}) } })
    : await prisma.professionalListing.create({ data: { id: randomUUID(), clinicId, ...data, consentAt: active ? new Date() : null } })
  return { listing: row }
}

export async function listReceived(clinicId: string) {
  const rows = await prisma.professionalLeadContact.findMany({ where: { clinicId }, orderBy: { createdAt: 'desc' }, take: 30 })
  const leads = await prisma.professionalLead.findMany({ where: { id: { in: rows.map(r => r.leadId) } } })
  const byId = new Map(leads.map(l => [l.id, l]))
  return rows.map(r => {
    const l = byId.get(r.leadId)
    return { id: r.id, createdAt: r.createdAt, status: r.status, name: l?.name || '', whatsapp: l ? `+${l.whatsapp}` : '', city: l?.city || '', service: l?.service || '' }
  })
}
