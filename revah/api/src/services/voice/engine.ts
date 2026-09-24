import type { Call, Contact, Job, Tenant, VoiceSettings } from '@prisma/client'
import { config } from '../../config'
import { prisma } from '../../lib/prisma'
import { decryptJson } from '../../lib/crypto'
import { decideVoiceTurn, summarizeCall } from '../ai'
import { emitEvent } from '../automations'
import { notifyIntegration } from '../integrationOut'
import { enqueueJob, registerJobHandler, type JobOutcome } from '../jobs'
import { pickChannelAccount } from '../messaging'
import { limitsFor } from '../plans'
import { detectOptOut, isSuppressed, suppress } from '../suppression'
import { createCall, startRecording, TwiML } from './twilio'
import { DEFAULT_WINDOWS, nextAllowedTime, type CallWindow } from './windows'

const TERMINAL = ['COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED', 'CANCELED', 'BLOCKED']
const MENU_HINT = 'Para falar com um atendente, tecle 0. Para não receber mais ligações, tecle 9.'

export async function getVoiceSettings(tenantId: string) {
  return prisma.voiceSettings.upsert({ where: { tenantId }, create: { tenantId, allowedWindows: DEFAULT_WINDOWS as any }, update: {} })
}

const voiceUrl = (callId: string, step: string) => `${config.publicApiUrl}/webhooks/twilio/voice/${callId}/${step}`

export async function queueCall(
  tenant: Tenant,
  p: { contact: Contact; purpose: string; script?: string | null; campaignId?: string | null; parentCallId?: string | null; attempt?: number; runAt?: Date },
) {
  if (!p.contact.phone) throw new Error('Contato sem telefone.')
  const blocked = await isSuppressed(tenant.id, 'VOICE', p.contact.phone)
  const call = await prisma.call.create({
    data: {
      tenantId: tenant.id,
      contactId: p.contact.id,
      campaignId: p.campaignId || null,
      direction: 'OUTBOUND',
      to: p.contact.phone,
      purpose: p.purpose,
      script: p.script || null,
      attempt: p.attempt || 1,
      parentCallId: p.parentCallId || null,
      status: blocked ? 'BLOCKED' : 'QUEUED',
      error: blocked ? 'Contato pediu para não receber ligações.' : null,
    },
  })
  if (!blocked) await enqueueJob(tenant.id, 'PLACE_CALL', { callId: call.id }, p.runAt)
  return call
}

async function block(call: Call, error: string) {
  await prisma.call.update({ where: { id: call.id }, data: { status: 'BLOCKED', error } })
}

// Job da fila de chamadas: respeita horários permitidos, concorrência e opt-out.
export async function placeCallJob(job: Job): Promise<JobOutcome> {
  const { callId } = job.payload as { callId: string }
  const call = await prisma.call.findFirst({ where: { id: callId, tenantId: job.tenantId } })
  if (!call || call.status !== 'QUEUED') return
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: job.tenantId } })
  const settings = await getVoiceSettings(tenant.id)

  if (['SUSPENDED', 'CANCELED', 'PAST_DUE'].includes(tenant.status)) return block(call, 'Conta sem assinatura ativa.')
  if (!limitsFor(tenant).voice) return block(call, 'Plano atual não inclui ligações automáticas.')
  if (!settings.enabled) return block(call, 'REVAH Voice está desativado nas configurações.')
  if (await isSuppressed(tenant.id, 'VOICE', call.to)) return block(call, 'Contato pediu para não receber ligações.')

  const now = new Date()
  const next = nextAllowedTime(now, (settings.allowedWindows as unknown as CallWindow[]) || DEFAULT_WINDOWS, tenant.timezone, settings.skipHolidays)
  if (!next) return block(call, 'Nenhum horário permitido configurado.')
  if (next.getTime() - now.getTime() > 30_000) return { reschedule: next, reason: 'Fora do horário permitido.' }

  // Ignora chamadas presas sem callback há mais de 30 min para não travar a fila.
  const active = await prisma.call.count({ where: { tenantId: tenant.id, status: { in: ['RINGING', 'IN_PROGRESS'] }, updatedAt: { gt: new Date(Date.now() - 30 * 60_000) } } })
  if (active >= settings.maxConcurrent) return { reschedule: new Date(Date.now() + 90_000), reason: 'Fila: limite de ligações simultâneas.' }

  const account = await pickChannelAccount(tenant.id, 'VOICE')
  const creds = decryptJson<Record<string, any>>(account.encryptedCredentials) || {}
  const from = account.address.startsWith('+') ? account.address : `+${account.address}`
  if (creds.simulated === true) {
    await prisma.call.update({
      where: { id: call.id },
      data: { status: 'COMPLETED', channelAccountId: account.id, from, startedAt: now, endedAt: now, durationSec: 0, summary: 'Ligação simulada (canal em modo de teste).', outcome: 'OTHER' },
    })
    return
  }
  const res = await createCall(creds as any, { to: `+${call.to}`, from, url: voiceUrl(call.id, 'answer'), statusCallback: voiceUrl(call.id, 'status') })
  await prisma.call.update({ where: { id: call.id }, data: { status: 'RINGING', providerCallSid: res.sid, channelAccountId: account.id, from } })
}

async function loadCall(callId: string) {
  const call = await prisma.call.findUnique({ where: { id: callId }, include: { turns: { orderBy: { createdAt: 'asc' } }, contact: true } })
  if (!call) return null
  const settings = await getVoiceSettings(call.tenantId)
  return { call, settings }
}

function tw(settings: VoiceSettings) {
  return new TwiML(settings.voice, settings.language)
}

export async function answerTwiml(callId: string, callSid?: string) {
  const loaded = await loadCall(callId)
  if (!loaded) return new TwiML().hangup().toString()
  const { call, settings } = loaded
  if (call.direction === 'OUTBOUND' && (await isSuppressed(call.tenantId, 'VOICE', call.to))) return tw(settings).hangup().toString()
  await prisma.call.update({ where: { id: call.id }, data: { status: 'IN_PROGRESS', startedAt: call.startedAt || new Date(), ...(callSid && !call.providerCallSid ? { providerCallSid: callSid } : {}) } })
  const t = tw(settings)
  if (settings.recordCalls) {
    t.say(settings.recordingNotice)
    await prisma.callTurn.create({ data: { callId: call.id, role: 'SYSTEM', text: 'Aviso de gravação reproduzido.' } })
  }
  const opening = await decideVoiceTurn({
    tenantId: call.tenantId,
    contactId: call.contactId,
    agentInstructions: settings.agentInstructions,
    purpose: call.purpose,
    script: call.script,
    turns: [],
    fallbackOpening: `${settings.greeting} ${call.script || call.purpose || ''}`.trim(),
  })
  await prisma.callTurn.create({ data: { callId: call.id, role: 'AGENT', text: opening.say } })
  t.gather({ action: voiceUrl(call.id, 'turn'), say: `${opening.say} ${MENU_HINT}` })
  t.redirect(voiceUrl(call.id, 'turn'))
  return t.toString()
}

async function optOutCall(call: Call, settings: VoiceSettings, detail: string, reason: 'DTMF' | 'VERBAL') {
  await suppress(call.tenantId, 'VOICE', call.to, reason, { contactId: call.contactId, detail })
  await prisma.call.update({ where: { id: call.id }, data: { outcome: 'OPT_OUT' } })
  const tenant = await prisma.tenant.findUnique({ where: { id: call.tenantId } })
  if (tenant) await notifyIntegration(tenant, 'revah.opt_out', { contactId: call.contactId, channel: 'VOICE' })
  const say = 'Entendido. Você não receberá mais ligações automáticas nossas. Tenha um bom dia.'
  await prisma.callTurn.create({ data: { callId: call.id, role: 'AGENT', text: say } })
  return tw(settings).say(say).hangup().toString()
}

async function transferCall(call: Call, settings: VoiceSettings) {
  const t = tw(settings)
  if (settings.transferNumber) {
    const say = 'Certo, vou transferir você para um atendente. Um momento, por favor.'
    await prisma.callTurn.create({ data: { callId: call.id, role: 'AGENT', text: say } })
    await prisma.call.update({ where: { id: call.id }, data: { outcome: 'TRANSFERRED' } })
    return t.say(say).dial(settings.transferNumber, { callerId: call.from || undefined, action: voiceUrl(call.id, 'dial-status') }).toString()
  }
  const say = 'No momento nossa equipe não está disponível. Vamos retornar sua ligação em breve. Obrigado.'
  await prisma.callTurn.create({ data: { callId: call.id, role: 'AGENT', text: say } })
  await prisma.call.update({ where: { id: call.id }, data: { outcome: 'CALLBACK_REQUESTED' } })
  return t.say(say).hangup().toString()
}

export async function turnTwiml(callId: string, params: Record<string, string>) {
  const loaded = await loadCall(callId)
  if (!loaded) return new TwiML().hangup().toString()
  const { call, settings } = loaded
  const speech = (params.SpeechResult || '').trim()
  const digits = (params.Digits || '').trim()
  const t = tw(settings)

  if (!speech && !digits) {
    const lastTurns = call.turns.slice(-2)
    const silentBefore = lastTurns.some((x) => x.role === 'SYSTEM' && x.text === 'Sem resposta do cliente.')
    await prisma.callTurn.create({ data: { callId: call.id, role: 'SYSTEM', text: 'Sem resposta do cliente.' } })
    if (silentBefore) return t.say('Como não consegui ouvir, vamos encerrar. Até logo.').hangup().toString()
    return t.gather({ action: voiceUrl(call.id, 'turn'), say: 'Desculpe, não consegui ouvir. Pode repetir?' }).redirect(voiceUrl(call.id, 'turn')).toString()
  }

  await prisma.callTurn.create({
    data: { callId: call.id, role: 'CONTACT', text: speech || `[tecla ${digits}]`, dtmf: digits || null, confidence: params.Confidence ? Number(params.Confidence) : null },
  })

  // Consentimento de gravação: aviso no início; recusa por fala ("não autorizo") ou tecla 8.
  if (settings.recordCalls && !call.recordingAllowed) {
    const refusedBefore = call.turns.some((x) => x.role === 'SYSTEM' && x.text === 'Cliente recusou a gravação.')
    const refusesNow = digits === '8' || /n[aã]o\s+autorizo/i.test(speech)
    if (refusesNow && !refusedBefore) {
      await prisma.callTurn.create({ data: { callId: call.id, role: 'SYSTEM', text: 'Cliente recusou a gravação.' } })
      if (digits === '8' && !speech) {
        return t.gather({ action: voiceUrl(call.id, 'turn'), say: 'Tudo bem, esta ligação não será gravada. Podemos continuar?' }).redirect(voiceUrl(call.id, 'turn')).toString()
      }
    } else if (!refusedBefore && !refusesNow && call.providerCallSid && call.channelAccountId) {
      const acc = await prisma.channelAccount.findUnique({ where: { id: call.channelAccountId } })
      const creds = decryptJson<Record<string, any>>(acc?.encryptedCredentials) || {}
      if (creds.accountSid && creds.authToken) {
        await startRecording(creds as any, call.providerCallSid, voiceUrl(call.id, 'recording')).catch((e) => console.error('[revah] gravação', e.message))
        await prisma.call.update({ where: { id: call.id }, data: { recordingAllowed: true } })
      }
    }
  }

  if (digits === '9' || detectOptOut(speech)) return optOutCall(call, settings, speech || 'tecla 9', digits === '9' ? 'DTMF' : 'VERBAL')
  if (digits === '0') return transferCall(call, settings)

  const agentTurns = call.turns.filter((x) => x.role === 'AGENT').length
  const turns = [...call.turns, { role: 'CONTACT', text: speech || `[tecla ${digits}]` }].map((x) => ({ role: x.role, text: x.text }))
  const decision = await decideVoiceTurn({
    tenantId: call.tenantId,
    contactId: call.contactId,
    agentInstructions: settings.agentInstructions,
    purpose: call.purpose,
    script: call.script,
    turns,
    fallbackOpening: settings.greeting,
  })
  if (decision.optOut) return optOutCall(call, settings, speech, 'VERBAL')
  if (decision.transfer) return transferCall(call, settings)
  if (decision.callbackAt) {
    const when = new Date(decision.callbackAt)
    if (!Number.isNaN(when.getTime()) && when.getTime() > Date.now()) {
      await prisma.call.update({ where: { id: call.id }, data: { callbackAt: when, outcome: 'CALLBACK_REQUESTED' } })
    }
  }
  await prisma.callTurn.create({ data: { callId: call.id, role: 'AGENT', text: decision.say } })
  if (decision.endCall || agentTurns + 1 >= settings.maxTurns) {
    return t.say(decision.endCall ? decision.say : `${decision.say} Obrigado pelo seu tempo. Até logo.`).hangup().toString()
  }
  return t.gather({ action: voiceUrl(call.id, 'turn'), say: decision.say }).redirect(voiceUrl(call.id, 'turn')).toString()
}

const STATUS_MAP: Record<string, string> = {
  queued: 'RINGING',
  initiated: 'RINGING',
  ringing: 'RINGING',
  'in-progress': 'IN_PROGRESS',
  answered: 'IN_PROGRESS',
  completed: 'COMPLETED',
  busy: 'BUSY',
  'no-answer': 'NO_ANSWER',
  failed: 'FAILED',
  canceled: 'CANCELED',
}

export async function handleStatusCallback(callId: string, params: Record<string, string>) {
  const call = await prisma.call.findUnique({ where: { id: callId } })
  if (!call) return
  const status = STATUS_MAP[(params.CallStatus || '').toLowerCase()]
  if (!status) return
  if (TERMINAL.includes(call.status) && call.endedAt) return
  const terminal = TERMINAL.includes(status)
  await prisma.call.update({
    where: { id: call.id },
    data: {
      status: call.outcome === 'TRANSFERRED' && status === 'COMPLETED' ? 'TRANSFERRED' : status,
      ...(status === 'IN_PROGRESS' && !call.startedAt ? { startedAt: new Date() } : {}),
      ...(terminal ? { endedAt: new Date(), durationSec: params.CallDuration ? Number(params.CallDuration) : call.durationSec } : {}),
      ...(params.AnsweredBy && params.AnsweredBy.startsWith('machine') ? { outcome: 'VOICEMAIL' } : {}),
    },
  })
  if (terminal) await enqueueJob(call.tenantId, 'CALL_SUMMARY', { callId: call.id })
}

export async function handleRecordingCallback(callId: string, params: Record<string, string>) {
  if (!params.RecordingUrl) return
  await prisma.call.updateMany({ where: { id: callId }, data: { recordingUrl: `${params.RecordingUrl}.mp3` } })
}

// Resumo automático no CRM, classificação do resultado e retorno automático.
export async function callSummaryJob(job: Job) {
  const { callId } = job.payload as { callId: string }
  const call = await prisma.call.findFirst({ where: { id: callId, tenantId: job.tenantId }, include: { turns: { orderBy: { createdAt: 'asc' } } } })
  if (!call) return
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: call.tenantId } })
  const settings = await getVoiceSettings(tenant.id)

  let outcome = call.outcome
  let summary = call.summary
  let callbackAt = call.callbackAt
  if (['NO_ANSWER', 'BUSY', 'FAILED'].includes(call.status)) {
    outcome = outcome || 'NO_ANSWER'
    summary = summary || (call.status === 'BUSY' ? 'Linha ocupada.' : call.status === 'FAILED' ? 'Falha ao completar a ligação.' : 'Não atendeu.')
  } else if (!summary) {
    const s = await summarizeCall({ purpose: call.purpose, turns: call.turns })
    summary = s.summary
    if (!outcome || outcome === 'OTHER') outcome = s.outcome
    if (!callbackAt && s.callbackAt) {
      const d = new Date(s.callbackAt)
      if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) callbackAt = d
    }
  }
  await prisma.call.update({ where: { id: call.id }, data: { summary, outcome, callbackAt } })
  if (call.contactId) {
    await prisma.note.create({
      data: { tenantId: tenant.id, contactId: call.contactId, kind: 'CALL_SUMMARY', body: `Ligação ${call.direction === 'INBOUND' ? 'recebida' : 'realizada'} — ${outcome || call.status}: ${summary}` },
    })
  }
  await emitEvent(tenant.id, 'call.completed', { contactId: call.contactId, data: { outcome, status: call.status, purpose: call.purpose } })
  await notifyIntegration(tenant, 'revah.call_completed', { callId: call.id, contactId: call.contactId, outcome, summary, status: call.status })

  // Retorno automático.
  const contact = call.contactId ? await prisma.contact.findUnique({ where: { id: call.contactId } }) : null
  if (!contact || call.direction !== 'OUTBOUND' || outcome === 'OPT_OUT') return
  const already = await prisma.call.findFirst({ where: { parentCallId: call.id } })
  if (already) return
  if (['NO_ANSWER', 'BUSY', 'FAILED'].includes(call.status) && call.attempt < settings.maxAttempts) {
    await queueCall(tenant, {
      contact,
      purpose: call.purpose || 'Retorno',
      script: call.script,
      campaignId: call.campaignId,
      parentCallId: call.id,
      attempt: call.attempt + 1,
      runAt: new Date(Date.now() + settings.retryDelayMinutes * 60_000),
    })
  } else if (callbackAt) {
    await queueCall(tenant, { contact, purpose: `Retorno solicitado: ${call.purpose || ''}`.trim(), script: call.script, parentCallId: call.id, attempt: 1, runAt: callbackAt })
  }
}

export async function startInboundCall(accountId: string, params: Record<string, string>) {
  const account = await prisma.channelAccount.findUnique({ where: { id: accountId } })
  if (!account) return null
  const { findOrCreateByChannel } = await import('../contacts')
  const { normalizePhone } = await import('../../lib/normalize')
  const phone = normalizePhone(params.From)
  const contact = phone ? await findOrCreateByChannel(account.tenantId, 'VOICE', phone) : null
  const existing = params.CallSid ? await prisma.call.findUnique({ where: { providerCallSid: params.CallSid } }) : null
  if (existing) return existing
  return prisma.call.create({
    data: {
      tenantId: account.tenantId,
      contactId: contact?.id || null,
      channelAccountId: account.id,
      direction: 'INBOUND',
      from: params.From || null,
      to: phone || params.From || 'desconhecido',
      purpose: 'Atendimento de ligação recebida',
      status: 'IN_PROGRESS',
      providerCallSid: params.CallSid || null,
      startedAt: new Date(),
    },
  })
}

registerJobHandler('PLACE_CALL', placeCallJob)
registerJobHandler('CALL_SUMMARY', callSummaryJob)
