import type { Automation, Job } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { hmacHex } from '../lib/crypto'
import { contactVars, isChannel, renderTemplate } from '../lib/normalize'
import { enqueueJob, registerJobHandler } from './jobs'

export type AutomationAction =
  | { type: 'send_message'; channel: string; template: string; subject?: string; waTemplate?: { name: string; language?: string; params?: string[] }; optOutHint?: boolean; delayMinutes?: number }
  | { type: 'place_call'; purpose: string; script: string; delayMinutes?: number }
  | { type: 'add_tag' | 'remove_tag'; tag: string; delayMinutes?: number }
  | { type: 'webhook'; url: string; delayMinutes?: number }

export interface AutomationConditions {
  tag?: string
  equals?: Record<string, string | number | boolean>
}

// Gatilhos disponíveis (inclui os eventos do DentalPos One).
export const TRIGGERS = [
  { key: 'contact.created', label: 'Contato criado' },
  { key: 'message.received', label: 'Mensagem recebida' },
  { key: 'call.completed', label: 'Ligação finalizada' },
  { key: 'lead.imported', label: 'Lead importado para o CRM' },
  { key: 'dentalpos.appointment.scheduled', label: 'DentalPos: agendamento criado' },
  { key: 'dentalpos.appointment.reminder', label: 'DentalPos: lembrete de consulta' },
  { key: 'dentalpos.appointment.no_show', label: 'DentalPos: falta' },
  { key: 'dentalpos.budget.pending', label: 'DentalPos: orçamento pendente' },
  { key: 'dentalpos.billing.due', label: 'DentalPos: cobrança' },
  { key: 'dentalpos.recall.due', label: 'DentalPos: recall' },
  { key: 'dentalpos.postop.followup', label: 'DentalPos: pós-operatório' },
]

async function matches(a: Automation, contactId: string | null, data: Record<string, unknown>) {
  const cond = (a.conditions || {}) as AutomationConditions
  if (cond.tag) {
    if (!contactId) return false
    const has = await prisma.contactTag.findFirst({ where: { contactId, tag: { name: cond.tag, tenantId: a.tenantId } } })
    if (!has) return false
  }
  if (cond.equals) for (const [k, v] of Object.entries(cond.equals)) if (String(data[k]) !== String(v)) return false
  return true
}

export async function emitEvent(tenantId: string, type: string, payload: { contactId?: string | null; data?: Record<string, unknown> } = {}) {
  const automations = await prisma.automation.findMany({ where: { tenantId, trigger: type, isActive: true } })
  let scheduled = 0
  for (const a of automations) {
    const data = payload.data || {}
    if (!(await matches(a, payload.contactId || null, data))) continue
    const actions = (a.actions as unknown as AutomationAction[]) || []
    for (let i = 0; i < actions.length; i++) {
      const delay = Math.max(0, Number(actions[i].delayMinutes || 0))
      await enqueueJob(tenantId, 'AUTOMATION_ACTION', { automationId: a.id, actionIndex: i, contactId: payload.contactId || null, data }, new Date(Date.now() + delay * 60_000))
      scheduled++
    }
    await prisma.automation.update({ where: { id: a.id }, data: { runCount: { increment: 1 } } })
  }
  return scheduled
}

async function executeAction(job: Job) {
  const { automationId, actionIndex, contactId, data } = job.payload as any
  const automation = await prisma.automation.findFirst({ where: { id: automationId, tenantId: job.tenantId } })
  if (!automation || !automation.isActive) return
  const action = ((automation.actions as unknown as AutomationAction[]) || [])[actionIndex]
  if (!action) return
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: job.tenantId } })
  const contact = contactId ? await prisma.contact.findFirst({ where: { id: contactId, tenantId: tenant.id } }) : null
  const vars = contactVars(contact, data || {})

  if (action.type === 'send_message') {
    if (!contact || !isChannel(action.channel)) return
    const { sendMessage } = await import('./messaging')
    const r = await sendMessage({
      tenant,
      channel: action.channel,
      contact,
      text: renderTemplate(action.template, vars),
      subject: action.subject ? renderTemplate(action.subject, vars) : null,
      template: action.waTemplate ? { ...action.waTemplate, params: (action.waTemplate.params || []).map((p) => renderTemplate(p, vars)) } : null,
      appendOptOutHint: Boolean(action.optOutHint),
      metadata: { automationId },
    })
    if (!r.ok && r.code === 'PROVIDER_ERROR') throw new Error(r.error)
    return
  }
  if (action.type === 'place_call') {
    if (!contact?.phone) return
    const { queueCall } = await import('./voice/engine')
    await queueCall(tenant, { contact, purpose: renderTemplate(action.purpose, vars), script: renderTemplate(action.script, vars) })
    return
  }
  if (action.type === 'add_tag' || action.type === 'remove_tag') {
    if (!contact) return
    const { applyTags, removeTags } = await import('./contacts')
    if (action.type === 'add_tag') await applyTags(tenant.id, contact.id, [action.tag])
    else await removeTags(tenant.id, contact.id, [action.tag])
    return
  }
  if (action.type === 'webhook') {
    const body = JSON.stringify({ automationId, contact, data })
    const res = await fetch(action.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Revah-Signature': hmacHex(tenant.integrationSecret || tenant.id, body) },
      body,
    })
    if (!res.ok) throw new Error(`Webhook respondeu HTTP ${res.status}`)
  }
}

registerJobHandler('AUTOMATION_ACTION', executeAction)

// Modelos prontos para clínicas integradas ao DentalPos One.
export const DENTALPOS_AUTOMATION_TEMPLATES: { name: string; trigger: string; actions: AutomationAction[] }[] = [
  {
    name: 'Confirmação de agendamento',
    trigger: 'dentalpos.appointment.scheduled',
    actions: [{ type: 'send_message', channel: 'WHATSAPP', template: 'Olá, {{primeiro_nome}}! Sua consulta está agendada para {{data}} às {{hora}}{{profissional_com}}. Qualquer dúvida, é só responder esta mensagem.' }],
  },
  {
    name: 'Lembrete de consulta (véspera)',
    trigger: 'dentalpos.appointment.reminder',
    actions: [{ type: 'send_message', channel: 'WHATSAPP', template: 'Olá, {{primeiro_nome}}! Lembrando da sua consulta amanhã, {{data}}, às {{hora}}. Responda CONFIRMO para confirmar ou nos diga se precisa remarcar.' }],
  },
  {
    name: 'Falta na consulta',
    trigger: 'dentalpos.appointment.no_show',
    actions: [{ type: 'send_message', channel: 'WHATSAPP', template: 'Olá, {{primeiro_nome}}. Sentimos sua falta na consulta de {{data}}. Quer remarcar? Responda com o melhor dia e horário para você.' }],
  },
  {
    name: 'Orçamento pendente',
    trigger: 'dentalpos.budget.pending',
    actions: [{ type: 'send_message', channel: 'WHATSAPP', template: 'Olá, {{primeiro_nome}}! Seu orçamento{{procedimento_de}} está disponível. Ficou alguma dúvida? Podemos ajudar por aqui.', delayMinutes: 60 * 24 }],
  },
  {
    name: 'Cobrança amigável',
    trigger: 'dentalpos.billing.due',
    actions: [{ type: 'send_message', channel: 'WHATSAPP', template: 'Olá, {{primeiro_nome}}. Há uma parcela de {{valor}} com vencimento em {{vencimento}}. {{link_pagamento}} Se já pagou, desconsidere.' }],
  },
  {
    name: 'Recall / retorno',
    trigger: 'dentalpos.recall.due',
    actions: [{ type: 'send_message', channel: 'WHATSAPP', template: 'Olá, {{primeiro_nome}}! Já está na hora do seu retorno. Quer agendar? Responda com o melhor dia para você.', optOutHint: true }],
  },
  {
    name: 'Pós-operatório',
    trigger: 'dentalpos.postop.followup',
    actions: [{ type: 'send_message', channel: 'WHATSAPP', template: 'Olá, {{primeiro_nome}}! Como você está se sentindo após o procedimento{{procedimento_de}}? Se sentir algo diferente do esperado, fale com a gente por aqui.' }],
  },
]
