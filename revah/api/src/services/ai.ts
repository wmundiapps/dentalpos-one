import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod/v4'
import type { BotSettings, Contact } from '@prisma/client'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { detectOptOut } from './suppression'

let client: Anthropic | null = null
export function aiAvailable() {
  return Boolean(config.ai.apiKey)
}
function ai() {
  if (!client) client = new Anthropic({ apiKey: config.ai.apiKey, timeout: 25_000, maxRetries: 1 })
  return client
}

// Contexto do cliente (CRM + histórico multicanal) compartilhado por chat e voz.
export async function buildCustomerContext(tenantId: string, contactId: string) {
  const [contact, messages, calls, notes] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, tenantId }, include: { tags: { include: { tag: true } } } }),
    prisma.message.findMany({ where: { tenantId, contactId }, orderBy: { createdAt: 'desc' }, take: 24 }),
    prisma.call.findMany({ where: { tenantId, contactId, summary: { not: null } }, orderBy: { createdAt: 'desc' }, take: 3 }),
    prisma.note.findMany({ where: { tenantId, contactId }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ])
  if (!contact) return { contact: null, text: '' }
  const lines = [
    `Nome: ${contact.name}`,
    contact.company ? `Empresa: ${contact.company}` : '',
    contact.tags.length ? `Etiquetas: ${contact.tags.map((t) => t.tag.name).join(', ')}` : '',
    contact.customFields ? `Dados adicionais: ${JSON.stringify(contact.customFields)}` : '',
    contact.notes ? `Observações: ${contact.notes}` : '',
    notes.length ? `Notas recentes:\n${notes.map((n) => `- ${n.body.slice(0, 300)}`).join('\n')}` : '',
    calls.length ? `Resumos de ligações:\n${calls.map((c) => `- ${c.createdAt.toISOString().slice(0, 10)}: ${c.summary}`).join('\n')}` : '',
    messages.length
      ? `Histórico recente (todos os canais, do mais antigo ao mais novo):\n${messages
          .reverse()
          .map((m) => `[${m.channel} ${m.direction === 'IN' ? 'cliente' : 'empresa'}] ${m.content.slice(0, 400)}`)
          .join('\n')}`
      : '',
  ]
  return { contact, text: lines.filter(Boolean).join('\n') }
}

const INTENTS = ['SAUDACAO', 'DUVIDA', 'AGENDAMENTO', 'REAGENDAMENTO', 'CANCELAMENTO', 'CONFIRMACAO', 'COBRANCA', 'COMPRA', 'RECLAMACAO', 'HUMANO', 'OPT_OUT', 'OUTRO'] as const

const ChatDecision = z.object({
  reply: z.string().describe('Resposta a enviar ao cliente, em português do Brasil, curta e natural.'),
  intent: z.enum(INTENTS),
  handoff: z.boolean().describe('true quando precisa de atendente humano.'),
  optOut: z.boolean().describe('true se o cliente pediu para não receber mais mensagens.'),
  appointment: z
    .object({
      preferredDate: z.string().nullable().describe('Data desejada no formato AAAA-MM-DD, se informada.'),
      preferredTime: z.string().nullable().describe('Horário desejado HH:MM, se informado.'),
      notes: z.string().nullable(),
    })
    .nullable()
    .describe('Preencha somente quando o cliente pediu para agendar/reagendar.'),
})
export type ChatDecision = z.infer<typeof ChatDecision>

function chatSystem(bot: BotSettings, channel: string) {
  return [
    `Você é ${bot.agentName}, o atendente virtual desta empresa, conversando pelo canal ${channel}.`,
    'Regras obrigatórias:',
    '- Responda sempre em português do Brasil, com mensagens curtas (até 3 frases), educadas e objetivas.',
    '- Use somente as informações da empresa e do cliente fornecidas. Se não souber, diga que vai verificar com a equipe e marque handoff.',
    '- Nunca invente preços, prazos, diagnósticos ou promessas. Não faça promessas absolutas.',
    '- Se o cliente pedir para não receber mais mensagens, marque optOut=true e confirme com respeito.',
    '- Se o cliente pedir um humano, estiver irritado ou o assunto for sensível (reclamação grave, dados financeiros específicos), marque handoff=true.',
    bot.schedulingEnabled
      ? '- Para agendamentos, colete data e horário desejados e diga que a equipe vai confirmar. Não confirme horário por conta própria.'
      : '- Não faça agendamentos; encaminhe para a equipe.',
    bot.businessInfo ? `\nSobre a empresa:\n${bot.businessInfo}` : '',
    bot.instructions ? `\nInstruções da empresa:\n${bot.instructions}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

// Resposta sem IA (quando ANTHROPIC_API_KEY não está configurada): regras simples e handoff.
export function ruleBasedDecision(text: string, bot: Pick<BotSettings, 'handoffMessage'>): ChatDecision {
  const t = text.toLowerCase()
  if (detectOptOut(text)) return { reply: '', intent: 'OPT_OUT', handoff: false, optOut: true, appointment: null }
  if (/(humano|atendente|pessoa|falar com algu[eé]m)/.test(t)) return { reply: bot.handoffMessage, intent: 'HUMANO', handoff: true, optOut: false, appointment: null }
  if (/(agendar|marcar|consulta|hor[aá]rio|reagendar|remarcar)/.test(t))
    return {
      reply: 'Claro! Qual dia e horário ficam melhores para você? A equipe vai confirmar a disponibilidade.',
      intent: 'AGENDAMENTO',
      handoff: false,
      optOut: false,
      appointment: { preferredDate: null, preferredTime: null, notes: text.slice(0, 200) },
    }
  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite)\b/.test(t))
    return { reply: 'Olá! Como posso ajudar você hoje?', intent: 'SAUDACAO', handoff: false, optOut: false, appointment: null }
  return { reply: bot.handoffMessage, intent: 'OUTRO', handoff: true, optOut: false, appointment: null }
}

export async function decideChatReply(opts: { bot: BotSettings; channel: string; tenantId: string; contactId: string; incoming: string }): Promise<ChatDecision> {
  if (!aiAvailable()) return ruleBasedDecision(opts.incoming, opts.bot)
  const ctx = await buildCustomerContext(opts.tenantId, opts.contactId)
  try {
    const res = await ai().beta.messages.parse({
      model: config.ai.model,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: betaZodOutputFormat(ChatDecision) },
      system: chatSystem(opts.bot, opts.channel),
      messages: [
        {
          role: 'user',
          content: `Contexto do cliente (CRM):\n${ctx.text || 'sem dados'}\n\nNova mensagem do cliente:\n${opts.incoming}`,
        },
      ],
    })
    if (res.stop_reason === 'refusal' || !res.parsed_output) {
      return { reply: opts.bot.handoffMessage, intent: 'HUMANO', handoff: true, optOut: false, appointment: null }
    }
    return res.parsed_output
  } catch (e) {
    console.error('[revah] IA indisponível, usando regras', e)
    return ruleBasedDecision(opts.incoming, opts.bot)
  }
}

// ---------------------------------------------------------------------------
// Voz
// ---------------------------------------------------------------------------

const VoiceDecision = z.object({
  say: z.string().describe('O que o agente fala agora, em até 2 frases curtas, próprias para voz.'),
  endCall: z.boolean(),
  transfer: z.boolean().describe('true se o cliente quer falar com um atendente humano.'),
  optOut: z.boolean().describe('true se o cliente pediu para não receber mais ligações.'),
  callbackAt: z.string().nullable().describe('Se o cliente pediu retorno em outro horário: data/hora ISO 8601 no fuso America/Sao_Paulo.'),
})
export type VoiceDecision = z.infer<typeof VoiceDecision>

function voiceSystem(agentInstructions: string, purpose: string | null, script: string | null) {
  return [
    'Você é um agente de voz em uma ligação telefônica, falando português do Brasil.',
    'Fale de forma natural e breve (frases curtas, sem listas, sem emojis, sem abreviações).',
    'Identifique-se como assistente virtual. Não invente informações nem faça promessas absolutas.',
    'Se a pessoa pedir para não receber mais ligações, marque optOut=true e despeça-se com respeito.',
    'Se pedir para falar com uma pessoa, marque transfer=true.',
    'Encerre (endCall=true) quando o objetivo for cumprido ou a pessoa quiser desligar.',
    purpose ? `Objetivo da ligação: ${purpose}` : '',
    script ? `Roteiro/informações a transmitir:\n${script}` : '',
    agentInstructions ? `Instruções da empresa:\n${agentInstructions}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function decideVoiceTurn(opts: {
  tenantId: string
  contactId: string | null
  agentInstructions: string
  purpose: string | null
  script: string | null
  turns: { role: string; text: string }[]
  fallbackOpening: string
}): Promise<VoiceDecision> {
  const last = opts.turns.filter((t) => t.role === 'CONTACT').at(-1)?.text || ''
  if (!aiAvailable()) {
    if (last && detectOptOut(last)) return { say: 'Entendido. Você não receberá mais ligações nossas. Tenha um bom dia.', endCall: true, transfer: false, optOut: true, callbackAt: null }
    if (!last) return { say: opts.fallbackOpening, endCall: false, transfer: false, optOut: false, callbackAt: null }
    if (/(atendente|pessoa|humano)/i.test(last)) return { say: 'Certo, vou transferir.', endCall: false, transfer: true, optOut: false, callbackAt: null }
    return { say: 'Obrigado pelo retorno. Nossa equipe vai registrar e, se necessário, entrar em contato. Tenha um bom dia.', endCall: true, transfer: false, optOut: false, callbackAt: null }
  }
  const ctx = opts.contactId ? await buildCustomerContext(opts.tenantId, opts.contactId) : { text: '' }
  const transcript = opts.turns.map((t) => `${t.role === 'AGENT' ? 'Agente' : t.role === 'CONTACT' ? 'Cliente' : 'Sistema'}: ${t.text}`).join('\n')
  try {
    const res = await ai().beta.messages.parse({
      model: config.ai.model,
      max_tokens: 1500,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: betaZodOutputFormat(VoiceDecision) },
      system: voiceSystem(opts.agentInstructions, opts.purpose, opts.script),
      messages: [
        {
          role: 'user',
          content: `Dados do cliente:\n${ctx.text || 'sem dados'}\n\nTranscrição até agora:\n${transcript || '(ligação acabou de ser atendida — faça a abertura)'}\n\nQual a próxima fala do agente?`,
        },
      ],
    })
    if (res.stop_reason === 'refusal' || !res.parsed_output) return { say: 'Vou pedir para a nossa equipe retornar. Obrigado.', endCall: true, transfer: false, optOut: false, callbackAt: null }
    return res.parsed_output
  } catch (e) {
    console.error('[revah] IA de voz indisponível', e)
    return { say: last ? 'Obrigado. Nossa equipe vai entrar em contato. Tenha um bom dia.' : opts.fallbackOpening, endCall: Boolean(last), transfer: false, optOut: false, callbackAt: null }
  }
}

export const CALL_OUTCOMES = ['CONFIRMED', 'RESCHEDULE', 'NOT_INTERESTED', 'OPT_OUT', 'CALLBACK_REQUESTED', 'PROMISE_TO_PAY', 'INFORMED', 'TRANSFERRED', 'NO_ANSWER', 'VOICEMAIL', 'OTHER'] as const

const CallSummary = z.object({
  summary: z.string().describe('Resumo da ligação em até 4 frases, para o histórico do CRM.'),
  outcome: z.enum(CALL_OUTCOMES),
  callbackAt: z.string().nullable().describe('Data/hora ISO do retorno pedido, se houver.'),
})
export type CallSummary = z.infer<typeof CallSummary>

export async function summarizeCall(opts: { purpose: string | null; turns: { role: string; text: string }[] }): Promise<CallSummary> {
  const transcript = opts.turns.map((t) => `${t.role === 'AGENT' ? 'Agente' : t.role === 'CONTACT' ? 'Cliente' : 'Sistema'}: ${t.text}`).join('\n')
  if (!opts.turns.some((t) => t.role === 'CONTACT')) return { summary: 'Ligação sem interação do cliente.', outcome: 'OTHER', callbackAt: null }
  if (!aiAvailable()) {
    const optOut = opts.turns.some((t) => t.role === 'CONTACT' && detectOptOut(t.text))
    return { summary: transcript.slice(0, 600), outcome: optOut ? 'OPT_OUT' : 'OTHER', callbackAt: null }
  }
  try {
    const res = await ai().beta.messages.parse({
      model: config.ai.model,
      max_tokens: 1500,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: betaZodOutputFormat(CallSummary) },
      system: 'Você resume ligações telefônicas de atendimento para o CRM, em português do Brasil, de forma factual.',
      messages: [{ role: 'user', content: `Objetivo: ${opts.purpose || 'não informado'}\n\nTranscrição:\n${transcript}` }],
    })
    if (res.stop_reason === 'refusal' || !res.parsed_output) return { summary: transcript.slice(0, 600), outcome: 'OTHER', callbackAt: null }
    return res.parsed_output
  } catch (e) {
    console.error('[revah] falha ao resumir ligação', e)
    return { summary: transcript.slice(0, 600), outcome: 'OTHER', callbackAt: null }
  }
}

export type { Contact }
