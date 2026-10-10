// Planilha do REVAH Leads com WhatsApp de um clique (adaptado do ClubeFaz, wmundiapps/ifaco).
// O número na planilha não é um wa.me direto: aponta para o REVAH, que antes de abrir o WhatsApp confere
// o horário (8h–21h no fuso do cliente), um convite por pessoa, o limite diário e a lista de "não quero receber"
// do cliente. Por isso até uma planilha antiga respeita quem saiu.
import crypto from 'crypto'
import ExcelJS from 'exceljs'
import type { Lead, Tenant } from '@prisma/client'
import { config } from '../../config'
import { prisma } from '../../lib/prisma'
import { renderTemplate } from '../../lib/normalize'
import { withoutBlocked } from './index'

export const DEFAULT_INVITE_TEXT = 'Olá, {{primeiro_nome}}! Aqui é da {{minha_empresa}}. Podemos conversar sobre como ajudar a {{nome}}?'

export const isMobile = (phone?: string | null) => Boolean(phone && /^55\d{2}9\d{8}$/.test(phone))

export function hourIn(timeZone: string, now = new Date()) {
  return Number(new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now))
}

export const insideInviteWindow = (timeZone: string, now = new Date()) => {
  const h = hourIn(timeZone, now)
  const [from, to] = config.leads.inviteHours
  return h >= from && h < to
}

export function startOfToday(timeZone: string, now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || '-03:00'
  return new Date(`${ymd}T00:00:00${offset || '+00:00'}`)
}

export const inviteLink = (token: string) => `${config.publicApiUrl}/c/w/${token}`
export const optOutLink = (token: string) => `${config.publicApiUrl}/c/sair/${token}`

function firstName(name: string) {
  const w = name.replace(/\s+/g, ' ').trim().split(' ')[0] || ''
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

export function inviteMessage(lead: Pick<Lead, 'name' | 'company' | 'city' | 'inviteToken'>, tenant: Pick<Tenant, 'name'>, template?: string | null) {
  const body = renderTemplate(template?.trim() || DEFAULT_INVITE_TEXT, {
    nome: lead.name,
    primeiro_nome: firstName(lead.name),
    empresa: lead.company || lead.name,
    cidade: lead.city || '',
    minha_empresa: tenant.name,
  })
  return `${body}\n\nSe não quiser receber mais mensagens, responda SAIR ou acesse ${optOutLink(lead.inviteToken!)}`
}

export const whatsappUrl = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`

async function ensureTokens(leads: Lead[]) {
  for (const l of leads) {
    if (l.inviteToken) continue
    l.inviteToken = crypto.randomBytes(16).toString('hex')
    await prisma.lead.update({ where: { id: l.id }, data: { inviteToken: l.inviteToken } })
  }
  return leads
}

export type InviteClick = { ok: true; url: string } | { ok: false; title: string; message: string }

// Clique no número da planilha.
export async function openInvite(token: string): Promise<InviteClick> {
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, title: 'Link inválido', message: 'Confira se o link foi copiado inteiro.' }
  const lead = await prisma.lead.findUnique({ where: { inviteToken: token }, include: { tenant: true } })
  if (!lead) return { ok: false, title: 'Link inválido', message: 'Este convite não existe mais.' }
  const tenant = lead.tenant
  if (lead.status === 'OPTED_OUT') return { ok: false, title: 'Pediu para não receber', message: 'Este contato pediu para não receber mensagens. Não envie o convite.' }
  if ((await withoutBlocked(tenant.id, [lead])).length === 0) {
    return { ok: false, title: 'Pediu para não receber', message: 'Este contato está na sua lista de bloqueio. Não envie o convite.' }
  }
  if (!isMobile(lead.phone)) return { ok: false, title: 'Sem WhatsApp', message: 'Este número não é de celular.' }
  if (lead.invitedAt) {
    return { ok: false, title: 'Já convidado', message: `Este contato já recebeu o convite em ${lead.invitedAt.toLocaleString('pt-BR', { timeZone: tenant.timezone })}. Um convite por pessoa.` }
  }
  if (!insideInviteWindow(tenant.timezone)) return { ok: false, title: 'Fora do horário', message: `Convites só entre ${config.leads.inviteHours[0]}h e ${config.leads.inviteHours[1]}h. Tente de novo dentro do horário.` }
  const today = await prisma.lead.count({ where: { tenantId: tenant.id, invitedAt: { gte: startOfToday(tenant.timezone) } } })
  if (today >= config.leads.inviteDailyCap) {
    return { ok: false, title: 'Limite do dia', message: `Limite de ${config.leads.inviteDailyCap} convites por dia atingido. Muitos convites seguidos fazem o WhatsApp bloquear o número.` }
  }
  // Trava contra clique duplo: só um convite passa.
  const claimed = await prisma.lead.updateMany({ where: { id: lead.id, invitedAt: null }, data: { invitedAt: new Date() } })
  if (claimed.count !== 1) return { ok: false, title: 'Já convidado', message: 'Este contato acabou de ser convidado.' }
  const audience = lead.audienceId ? await prisma.leadAudience.findFirst({ where: { id: lead.audienceId, tenantId: tenant.id } }) : null
  await prisma.auditLog.create({ data: { tenantId: tenant.id, action: 'LEADS_WHATSAPP_INVITE', entity: 'Lead', entityId: lead.id } })
  return { ok: true, url: whatsappUrl(lead.phone!, inviteMessage(lead, tenant, audience?.inviteText)) }
}

const fmtPhone = (p: string) => p.replace(/^55(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3').replace(/^55(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Planilha: nunca inclui quem saiu; com perSegment traz uma amostra para começar (até N por segmento,
// ainda não convidados e com WhatsApp, MEI primeiro, sorteados).
export async function exportLeadsXlsx(tenant: Tenant, opts: { status?: string; audienceId?: string; perSegment?: number }) {
  const where: any = { tenantId: tenant.id, status: { not: 'OPTED_OUT' } }
  if (opts.status && ['NEW', 'IMPORTED', 'DISCARDED'].includes(opts.status)) where.status = opts.status
  if (opts.audienceId) where.audienceId = opts.audienceId
  if (opts.perSegment) Object.assign(where, { invitedAt: null })
  let rows = await withoutBlocked(tenant.id, await prisma.lead.findMany({ where, orderBy: [{ city: 'asc' }, { name: 'asc' }], take: 5000 }))
  if (opts.perSegment) {
    const groups = new Map<string, Lead[]>()
    for (const l of shuffle(rows.filter((r) => isMobile(r.phone)))) {
      const k = l.category || '—'
      groups.set(k, [...(groups.get(k) || []), l])
    }
    rows = [...groups.values()].flatMap((g) => g.sort((a, b) => Number(b.isMei) - Number(a.isMei)).slice(0, opts.perSegment))
  }
  await ensureTokens(rows)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'REVAH'
  const ws = wb.addWorksheet('Leads')
  ws.columns = [
    { header: 'Empresa', key: 'name', width: 34 },
    { header: 'CNPJ', key: 'document', width: 18 },
    { header: 'MEI', key: 'mei', width: 6 },
    { header: 'Segmento', key: 'category', width: 34 },
    { header: 'Cidade', key: 'city', width: 20 },
    { header: 'UF', key: 'state', width: 5 },
    { header: 'WhatsApp (clique para convidar)', key: 'whatsapp', width: 24 },
    { header: 'Telefone', key: 'phone', width: 18 },
    { header: 'E-mail', key: 'email', width: 30 },
    { header: 'Convidado em', key: 'invitedAt', width: 18 },
  ]
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  for (const l of rows) {
    const row = ws.addRow({
      name: l.name,
      document: l.document || '',
      mei: l.isMei ? 'sim' : '',
      category: l.category || '',
      city: l.city || '',
      state: l.state || '',
      phone: l.phone && !isMobile(l.phone) ? fmtPhone(l.phone) : '',
      email: l.email || '',
      invitedAt: l.invitedAt ? l.invitedAt.toLocaleString('pt-BR', { timeZone: tenant.timezone }) : '',
    })
    if (isMobile(l.phone)) {
      const cell = row.getCell('whatsapp')
      cell.value = { text: fmtPhone(l.phone!), hyperlink: inviteLink(l.inviteToken!) }
      cell.font = { color: { argb: 'FF0B7A3B' }, underline: true }
    }
  }
  ws.addRow([])
  ws.addRow(['Clique no WhatsApp para abrir o convite pronto. Um convite por pessoa, das 8h às 21h. Quem pediu para não receber não aparece.'])
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), count: rows.length }
}
