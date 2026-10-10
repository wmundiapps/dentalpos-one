import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import type { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { decryptSecret } from '../services/secretVault'
import { dispatchRevah, type RevahChannel } from '../services/revahProviderService'
import {
  JOURNEYS, calcNps, hashSurveyToken, isLowScore, newSurveyToken, violatesWeeklyLimit, WEEK_MS
} from '../services/satisfactionRules'

const EXPIRY_DAYS = 14

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado.')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function linkFor(token: string) {
  const base = String(process.env.PUBLIC_APP_URL || '').trim() || 'https://app.dentalpos.com.br'
  return `${base.replace(/\/$/, '')}/pesquisa-satisfacao?t=${encodeURIComponent(token)}`
}

async function isOptedOut(clinicId: string, patientId: string) {
  return Boolean(await prisma.satisfactionOptOut.findUnique({ where: { clinicId_patientId: { clinicId, patientId } } }))
}

/** Tenta enviar o link pelo canal configurado. Tolerante a falhas: nunca lança; sem provedor o link fica para copiar. */
export async function dispatchSurvey(surveyId: string, token: string): Promise<{ dispatched: boolean; reason?: string }> {
  const survey = await prisma.satisfactionSurvey.findUnique({ where: { id: surveyId } })
  if (!survey) return { dispatched: false, reason: 'Pesquisa não encontrada.' }
  try {
    if (await isOptedOut(survey.clinicId, survey.patientId)) return { dispatched: false, reason: 'Paciente optou por não receber.' }
    const patient = await prisma.patient.findFirst({ where: { id: survey.patientId, clinicId: survey.clinicId } })
    if (!patient) return { dispatched: false, reason: 'Paciente não encontrado.' }
    const order: RevahChannel[] = survey.channel ? [survey.channel as RevahChannel] : ['WHATSAPP', 'SMS', 'EMAIL']
    for (const channel of order) {
      const destination = channel === 'EMAIL' ? patient.email : patient.phone
      if (!destination) continue
      const sender = await prisma.revahSender.findFirst({ where: { clinicId: survey.clinicId, channel, isDefault: true, isActive: true } })
      if (!sender) continue
      const creds = decryptSecret<any>(sender.encryptedCredentials) || {}
      const first = patient.fullName.split(' ')[0]
      const content = `Olá, ${first}! Como foi seu atendimento? Leva menos de 1 minuto: ${linkFor(token)}`
      const result = await dispatchRevah(channel, destination, content, creds, sender.address)
      await prisma.satisfactionSurvey.update({
        where: { id: surveyId },
        data: { status: 'SENT', sentAt: new Date(), channel, dispatchError: result.simulated ? 'Envio simulado (canal sem credenciais).' : null }
      })
      return { dispatched: true }
    }
    return { dispatched: false, reason: 'Nenhum canal de envio configurado para este paciente.' }
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : 'Falha no envio.'
    await prisma.satisfactionSurvey.update({ where: { id: surveyId }, data: { dispatchError: reason } }).catch(() => null)
    return { dispatched: false, reason }
  }
}

const createSchema = z.object({
  appointmentId: z.string().min(1),
  journey: z.enum(JOURNEYS).optional(),
  delayHours: z.number().min(0).max(72).default(2),
  channel: z.enum(['WHATSAPP', 'SMS', 'EMAIL']).optional(),
  sendNow: z.boolean().default(false)
})

export async function create(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const parsed = createSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' })
  const input = parsed.data
  const appt = await prisma.appointment.findFirst({ where: { id: input.appointmentId, clinicId: c.clinicId, tenantId: c.tenantId } })
  if (!appt) return res.status(404).json({ error: 'Atendimento não encontrado.' })
  if (appt.status !== 'COMPLETED') return res.status(409).json({ error: 'A pesquisa só pode ser criada para atendimento finalizado.' })
  const duplicate = await prisma.satisfactionSurvey.findFirst({ where: { clinicId: c.clinicId, appointmentId: appt.id, status: { not: 'CANCELLED' } } })
  if (duplicate) return res.status(409).json({ error: 'Já existe pesquisa para este atendimento.' })
  if (await isOptedOut(c.clinicId, appt.patientId)) return res.status(409).json({ error: 'Paciente optou por não receber pesquisas.' })

  const sendAfter = new Date(Date.now() + (input.sendNow ? 0 : input.delayHours * 3600 * 1000))
  const recent = await prisma.satisfactionSurvey.findMany({
    where: { clinicId: c.clinicId, patientId: appt.patientId, status: { not: 'CANCELLED' }, sendAfter: { gt: new Date(sendAfter.getTime() - WEEK_MS), lt: new Date(sendAfter.getTime() + WEEK_MS) } },
    select: { sendAfter: true }
  })
  if (violatesWeeklyLimit(recent.map(r => r.sendAfter), sendAfter)) {
    return res.status(409).json({ error: 'Este paciente já recebeu ou tem pesquisa agendada nos últimos 7 dias (limite de 1 por semana).' })
  }

  let journey = input.journey
  if (!journey) {
    const before = await prisma.appointment.count({ where: { clinicId: c.clinicId, patientId: appt.patientId, status: 'COMPLETED', id: { not: appt.id } } })
    journey = before === 0 ? 'PRIMEIRA_CONSULTA' : 'TRATAMENTO'
  }
  const token = newSurveyToken()
  const survey = await prisma.satisfactionSurvey.create({
    data: {
      clinicId: c.clinicId, tenantId: c.tenantId, patientId: appt.patientId, appointmentId: appt.id, doctorId: appt.doctorId,
      journey, channel: input.channel, sendAfter, tokenHash: hashSurveyToken(token),
      expiresAt: new Date(sendAfter.getTime() + EXPIRY_DAYS * 86400000)
    }
  })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'satisfaction', action: 'CREATE', entityType: 'SatisfactionSurvey', entityId: survey.id })
  const delivery = input.sendNow ? await dispatchSurvey(survey.id, token) : { dispatched: false, reason: 'Agendada.' }
  res.status(201).json({ id: survey.id, journey, status: survey.status, sendAfter, expiresAt: survey.expiresAt, link: linkFor(token), delivery })
}

/** Gera um novo link (o anterior deixa de valer). O token nunca é guardado em texto puro. */
export async function regenerateLink(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const survey = await prisma.satisfactionSurvey.findFirst({ where: { id: String(req.params.id), clinicId: c.clinicId, tenantId: c.tenantId } })
  if (!survey) return res.status(404).json({ error: 'Pesquisa não encontrada.' })
  if (survey.status === 'ANSWERED' || survey.status === 'CANCELLED') return res.status(409).json({ error: 'Pesquisa já encerrada.' })
  const token = newSurveyToken()
  const updated = await prisma.satisfactionSurvey.update({
    where: { id: survey.id },
    data: { tokenHash: hashSurveyToken(token), expiresAt: new Date(Date.now() + EXPIRY_DAYS * 86400000), status: survey.status === 'EXPIRED' ? 'PENDING' : survey.status }
  })
  const delivery = req.body?.send ? await dispatchSurvey(survey.id, token) : { dispatched: false }
  res.json({ id: updated.id, link: linkFor(token), expiresAt: updated.expiresAt, delivery })
}

/** Envia as pesquisas agendadas já vencidas (pode ser chamado por rotina agendada ou manualmente). */
export async function dispatchDue(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const due = await prisma.satisfactionSurvey.findMany({
    where: { clinicId: c.clinicId, tenantId: c.tenantId, status: 'PENDING', sendAfter: { lte: new Date() }, expiresAt: { gt: new Date() } },
    take: 50
  })
  let sent = 0
  for (const survey of due) {
    const token = newSurveyToken()
    await prisma.satisfactionSurvey.update({ where: { id: survey.id }, data: { tokenHash: hashSurveyToken(token) } })
    if ((await dispatchSurvey(survey.id, token)).dispatched) sent++
  }
  res.json({ checked: due.length, sent })
}

export async function list(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const rows = await prisma.satisfactionSurvey.findMany({
    where: { clinicId: c.clinicId, tenantId: c.tenantId }, orderBy: { createdAt: 'desc' }, take: 100
  })
  const patients = await prisma.patient.findMany({ where: { id: { in: [...new Set(rows.map(r => r.patientId))] } }, select: { id: true, fullName: true } })
  const names = new Map(patients.map(p => [p.id, p.fullName]))
  const now = Date.now()
  res.json(rows.map(r => ({
    id: r.id, patientName: names.get(r.patientId) || 'Paciente', journey: r.journey,
    status: r.status === 'PENDING' || r.status === 'SENT' ? (r.expiresAt.getTime() < now ? 'EXPIRED' : r.status) : r.status,
    sendAfter: r.sendAfter, sentAt: r.sentAt, answeredAt: r.answeredAt, expiresAt: r.expiresAt, channel: r.channel, dispatchError: r.dispatchError
  })))
}

function range(req: Request) {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date()
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 90 * 86400000)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

export async function report(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const { from, to } = range(req)
  const answers = await prisma.satisfactionAnswer.findMany({
    where: { clinicId: c.clinicId, tenantId: c.tenantId, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'desc' }
  })
  const sentCount = await prisma.satisfactionSurvey.count({ where: { clinicId: c.clinicId, tenantId: c.tenantId, sentAt: { gte: from, lte: to } } })
  const doctorIds = [...new Set(answers.map(a => a.doctorId).filter((x): x is string => Boolean(x)))]
  const doctors = await prisma.doctor.findMany({ where: { id: { in: doctorIds } }, include: { user: { select: { firstName: true, lastName: true } } } })
  const docName = new Map(doctors.map(d => [d.id, `${d.user.firstName} ${d.user.lastName}`.trim()]))

  const scores = answers.map(a => a.nps)
  const byDoctor = doctorIds.map(id => {
    const s = answers.filter(a => a.doctorId === id).map(a => a.nps)
    return { doctorId: id, name: docName.get(id) || 'Profissional', responses: s.length, nps: calcNps(s), average: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 }
  }).sort((a, b) => (b.nps ?? -101) - (a.nps ?? -101))

  const reasons = new Map<string, number>()
  answers.filter(a => a.contracted === false).forEach(a => {
    const key = (a.notContractedReason || 'Não informado').trim()
    reasons.set(key, (reasons.get(key) || 0) + 1)
  })
  const first = answers.filter(a => a.journey === 'PRIMEIRA_CONSULTA' && a.contracted !== null)
  const contracted = first.filter(a => a.contracted === true).length
  const lowScores = answers.filter(a => isLowScore(a.nps)).length
  const patientNames = new Map((await prisma.patient.findMany({ where: { id: { in: answers.filter(a => isLowScore(a.nps)).map(a => a.patientId) } }, select: { id: true, fullName: true, phone: true } })).map(p => [p.id, p]))

  res.json({
    period: { from, to },
    sent: sentCount, responses: answers.length,
    responseRate: sentCount ? Math.round((answers.length / sentCount) * 100) : null,
    nps: calcNps(scores),
    distribution: { promoters: scores.filter(s => s >= 9).length, neutrals: scores.filter(s => s >= 7 && s <= 8).length, detractors: scores.filter(s => s <= 6).length },
    byDoctor,
    notContractedReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    firstConsultConversion: { answered: first.length, contracted, rate: first.length ? Math.round((contracted / first.length) * 100) : null },
    alerts: {
      lowScoreCount: lowScores,
      items: answers.filter(a => isLowScore(a.nps)).slice(0, 30).map(a => ({
        answerId: a.id, nps: a.nps, comment: a.comment, wantsContact: a.wantsContact, createdAt: a.createdAt,
        patientName: patientNames.get(a.patientId)?.fullName || 'Paciente', phone: patientNames.get(a.patientId)?.phone || null, handled: a.lowScoreHandled
      }))
    },
    testimonials: answers.filter(a => a.testimonialConsent && a.comment).slice(0, 20).map(a => ({ comment: a.comment, createdAt: a.createdAt, doctor: a.doctorId ? docName.get(a.doctorId) || null : null }))
  })
}

/** Pacientes que não contrataram o tratamento, com motivo: consultável por REVAH/CRM. */
export async function notContracted(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const rows = await prisma.satisfactionAnswer.findMany({
    where: { clinicId: c.clinicId, tenantId: c.tenantId, contracted: false }, orderBy: { createdAt: 'desc' }, take: 200
  })
  const patients = await prisma.patient.findMany({ where: { id: { in: rows.map(r => r.patientId) } }, select: { id: true, fullName: true, phone: true, email: true } })
  const map = new Map(patients.map(p => [p.id, p]))
  res.json(rows.map(r => ({
    answerId: r.id, patientId: r.patientId, patientName: map.get(r.patientId)?.fullName || 'Paciente', phone: map.get(r.patientId)?.phone || null,
    email: map.get(r.patientId)?.email || null, reason: r.notContractedReason, wantsContact: r.wantsContact, createdAt: r.createdAt
  })))
}

export async function markHandled(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const done = await prisma.satisfactionAnswer.updateMany({ where: { id: String(req.params.id), clinicId: c.clinicId, tenantId: c.tenantId }, data: { lowScoreHandled: true } })
  if (!done.count) return res.status(404).json({ error: 'Resposta não encontrada.' })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'satisfaction', action: 'LOW_SCORE_HANDLED', entityType: 'SatisfactionAnswer', entityId: String(req.params.id) })
  res.json({ ok: true })
}

// ======================= PÚBLICO (sem autenticação) =======================

async function findByToken(token: string) {
  if (!token || token.length < 20 || token.length > 200) return null
  return prisma.satisfactionSurvey.findUnique({ where: { tokenHash: hashSurveyToken(token) } })
}

function usable(survey: { status: string; expiresAt: Date }) {
  if (survey.status === 'ANSWERED') return 'Esta pesquisa já foi respondida. Obrigado!'
  if (survey.status === 'CANCELLED') return 'Esta pesquisa não está mais disponível.'
  if (survey.expiresAt.getTime() < Date.now()) return 'Este link expirou.'
  return null
}

export async function publicShow(req: Request, res: Response) {
  const survey = await findByToken(String(req.params.token))
  if (!survey) return res.status(404).json({ error: 'Link inválido.' })
  const problem = usable(survey)
  if (problem) return res.status(410).json({ error: problem })
  const [clinic, patient, doctor] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: survey.clinicId }, select: { name: true } }),
    prisma.patient.findUnique({ where: { id: survey.patientId }, select: { fullName: true } }),
    survey.doctorId ? prisma.doctor.findUnique({ where: { id: survey.doctorId }, include: { user: { select: { firstName: true, lastName: true } } } }) : null
  ])
  res.json({
    clinicName: clinic?.name || 'Clínica',
    patientFirstName: patient?.fullName.split(' ')[0] || '',
    doctorName: doctor ? `${doctor.user.firstName} ${doctor.user.lastName}`.trim() : null,
    journey: survey.journey
  })
}

const detailValue = z.union([z.number().min(0).max(10), z.boolean(), z.string().max(300)])
const answerSchema = z.object({
  nps: z.number().int().min(0).max(10),
  comment: z.string().max(2000).optional(),
  details: z.record(z.string().max(40), detailValue).refine(v => Object.keys(v).length <= 20).optional(),
  contracted: z.boolean().optional(),
  notContractedReason: z.string().max(300).optional(),
  wantsContact: z.boolean().optional(),
  testimonialConsent: z.boolean().optional(),
  lgpdConsent: z.literal(true)
})

export async function publicAnswer(req: Request, res: Response) {
  const survey = await findByToken(String(req.params.token))
  if (!survey) return res.status(404).json({ error: 'Link inválido.' })
  const problem = usable(survey)
  if (problem) return res.status(410).json({ error: problem })
  const parsed = answerSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'Confira as respostas e o aceite de uso dos dados.' })
  const b = parsed.data
  // Uso único: a troca de status é condicional, então duas respostas simultâneas não passam.
  const claimed = await prisma.satisfactionSurvey.updateMany({ where: { id: survey.id, status: { in: ['PENDING', 'SENT'] } }, data: { status: 'ANSWERED', answeredAt: new Date() } })
  if (!claimed.count) return res.status(410).json({ error: 'Esta pesquisa já foi respondida. Obrigado!' })
  const answer = await prisma.satisfactionAnswer.create({
    data: {
      surveyId: survey.id, clinicId: survey.clinicId, tenantId: survey.tenantId, patientId: survey.patientId, doctorId: survey.doctorId,
      journey: survey.journey, nps: b.nps, comment: b.comment?.trim() || null, details: b.details as any,
      contracted: survey.journey === 'PRIMEIRA_CONSULTA' ? b.contracted ?? null : null,
      notContractedReason: b.contracted === false ? b.notContractedReason?.trim() || null : null,
      wantsContact: b.wantsContact === true,
      testimonialConsent: survey.journey === 'FIM_TRATAMENTO' && b.testimonialConsent === true
    }
  })
  if (isLowScore(b.nps)) {
    await writeAudit({ clinicId: survey.clinicId, tenantId: survey.tenantId, module: 'satisfaction', action: 'LOW_SCORE_ALERT', entityType: 'SatisfactionAnswer', entityId: answer.id, summary: `Nota ${b.nps} em pesquisa de satisfação`, metadata: { patientId: survey.patientId, doctorId: survey.doctorId, nps: b.nps } }).catch(() => null)
  }
  if (answer.contracted === false) {
    await writeAudit({ clinicId: survey.clinicId, tenantId: survey.tenantId, module: 'satisfaction', action: 'NOT_CONTRACTED', entityType: 'SatisfactionAnswer', entityId: answer.id, summary: 'Paciente não contratou o tratamento', metadata: { patientId: survey.patientId, reason: answer.notContractedReason } }).catch(() => null)
  }
  res.status(201).json({ ok: true })
}

export async function publicOptOut(req: Request, res: Response) {
  const survey = await findByToken(String(req.params.token))
  if (!survey) return res.status(404).json({ error: 'Link inválido.' })
  await prisma.satisfactionOptOut.upsert({
    where: { clinicId_patientId: { clinicId: survey.clinicId, patientId: survey.patientId } },
    create: { clinicId: survey.clinicId, patientId: survey.patientId }, update: {}
  })
  await prisma.satisfactionSurvey.updateMany({ where: { clinicId: survey.clinicId, patientId: survey.patientId, status: { in: ['PENDING', 'SENT'] } }, data: { status: 'CANCELLED' } })
  await writeAudit({ clinicId: survey.clinicId, tenantId: survey.tenantId, module: 'satisfaction', action: 'OPTOUT', entityType: 'Patient', entityId: survey.patientId }).catch(() => null)
  res.json({ ok: true })
}
