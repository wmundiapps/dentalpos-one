import { Response } from 'express'
import type { Prisma, SmartLaboratoryRule } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import {
  computeSmartSchedule,
  inferFinancialCadenceDays,
  normalizeProcedureKey
} from '../services/smartSchedulingService'

const ctx = (req: AuthRequest) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId })

function parseDate(value: unknown) {
  if (!value) return undefined
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date
}

function safeInt(value: unknown, fallback: number, min = 0, max = 10000) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

async function ensurePolicy(clinicId: string, tenantId: string) {
  return prisma.smartSchedulingPolicy.upsert({
    where: { clinicId },
    update: { financeNeverOverridesClinical: true, overdueWarningOnly: true },
    create: {
      clinicId,
      tenantId,
      enabled: true,
      respectPreferredWeekday: true,
      financeOptimizationEnabled: true,
      financeNeverOverridesClinical: true,
      overdueWarningOnly: true,
      defaultDurationMinutes: 30,
      defaultReturnIntervalDays: 14,
      maxLookAheadDays: 180
    }
  })
}

const defaultProcedureRules = [
  { procedureName: 'Consulta inicial / avaliação', durationMinutes: 30, clinicalMinReturnDays: 0, preferredReturnIntervalDays: 30, clinicalMaxReturnDays: null },
  { procedureName: 'Implante unitário', durationMinutes: 60, clinicalMinReturnDays: 7, preferredReturnIntervalDays: 7, clinicalMaxReturnDays: 14 },
  { procedureName: 'Implantes múltiplos', durationMinutes: 120, clinicalMinReturnDays: 7, preferredReturnIntervalDays: 7, clinicalMaxReturnDays: 14 },
  { procedureName: 'Exodontia simples', durationMinutes: 30, clinicalMinReturnDays: 7, preferredReturnIntervalDays: 7, clinicalMaxReturnDays: 14 },
  { procedureName: 'Exodontia complexa / incluso / residual', durationMinutes: 90, clinicalMinReturnDays: 7, preferredReturnIntervalDays: 7, clinicalMaxReturnDays: 14 },
  { procedureName: 'Ajuste ortodôntico', durationMinutes: 30, clinicalMinReturnDays: 14, preferredReturnIntervalDays: 21, clinicalMaxReturnDays: 35 },
  { procedureName: 'Prova protética', durationMinutes: 45, clinicalMinReturnDays: 7, preferredReturnIntervalDays: 21, clinicalMaxReturnDays: 30 }
]

const defaultLaboratoryRules = [
  { laboratoryName: 'Laboratório padrão', serviceName: 'Trabalho protético', leadTimeDays: 15, safetyDays: 6 },
  { laboratoryName: 'CAD/CAM interno', serviceName: 'Produção CAD/CAM', leadTimeDays: 1, safetyDays: 0 }
]

export async function config(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const c = ctx(req)
    const policy = await ensurePolicy(c.clinicId, c.tenantId)
    const [procedureRules, laboratoryRules] = await Promise.all([
      prisma.smartProcedureRule.findMany({ where: { ...c, isActive: true }, orderBy: { procedureName: 'asc' } }),
      prisma.smartLaboratoryRule.findMany({ where: { ...c, isActive: true }, orderBy: [{ laboratoryName: 'asc' }, { serviceName: 'asc' }] })
    ])
    return res.json({ policy, procedureRules, laboratoryRules, clinicalPriority: true })
  } catch (error) {
    console.error('Erro ao carregar configuração da agenda inteligente:', error)
    return res.status(500).json({ error: 'Erro ao carregar configuração da agenda inteligente.' })
  }
}

export async function bootstrap(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const c = ctx(req)
    const policy = await ensurePolicy(c.clinicId, c.tenantId)
    for (const rule of defaultProcedureRules) {
      const procedureKey = normalizeProcedureKey(rule.procedureName)
      await prisma.smartProcedureRule.upsert({
        where: { clinicId_procedureKey: { clinicId: c.clinicId, procedureKey } },
        update: {},
        create: { ...c, procedureKey, ...rule }
      })
    }
    for (const rule of defaultLaboratoryRules) {
      const serviceKey = normalizeProcedureKey(rule.serviceName)
      await prisma.smartLaboratoryRule.upsert({
        where: { clinicId_laboratoryName_serviceKey: { clinicId: c.clinicId, laboratoryName: rule.laboratoryName, serviceKey } },
        update: {},
        create: { ...c, serviceKey, ...rule }
      })
    }
    await writeAudit({
      ...c,
      actorId: req.user.id,
      module: 'agenda',
      action: 'SMART_SCHEDULING_BOOTSTRAP',
      entityType: 'SmartSchedulingPolicy',
      entityId: policy.id,
      summary: 'Regras iniciais da Agenda Inteligente configuradas.'
    })
    return config(req, res)
  } catch (error) {
    console.error('Erro ao inicializar agenda inteligente:', error)
    return res.status(500).json({ error: 'Erro ao inicializar a agenda inteligente.' })
  }
}

export async function updatePolicy(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const c = ctx(req)
    const current = await ensurePolicy(c.clinicId, c.tenantId)
    const row = await prisma.smartSchedulingPolicy.update({
      where: { clinicId: c.clinicId },
      data: {
        enabled: req.body.enabled !== undefined ? Boolean(req.body.enabled) : current.enabled,
        respectPreferredWeekday: req.body.respectPreferredWeekday !== undefined ? Boolean(req.body.respectPreferredWeekday) : current.respectPreferredWeekday,
        financeOptimizationEnabled: req.body.financeOptimizationEnabled !== undefined ? Boolean(req.body.financeOptimizationEnabled) : current.financeOptimizationEnabled,
        financeNeverOverridesClinical: true,
        overdueWarningOnly: true,
        defaultDurationMinutes: safeInt(req.body.defaultDurationMinutes, current.defaultDurationMinutes, 5, 480),
        defaultReturnIntervalDays: safeInt(req.body.defaultReturnIntervalDays, current.defaultReturnIntervalDays, 0, 365),
        maxLookAheadDays: safeInt(req.body.maxLookAheadDays, current.maxLookAheadDays, 1, 730)
      }
    })
    await writeAudit({ ...c, actorId: req.user.id, module: 'agenda', action: 'SMART_POLICY_UPDATE', entityType: 'SmartSchedulingPolicy', entityId: row.id, afterData: row })
    return res.json(row)
  } catch (error) {
    console.error('Erro ao atualizar política de agenda inteligente:', error)
    return res.status(500).json({ error: 'Erro ao atualizar política da agenda inteligente.' })
  }
}

export async function upsertProcedureRule(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const c = ctx(req)
    const procedureName = String(req.body.procedureName || req.params.procedureKey || '').trim()
    if (!procedureName) return res.status(400).json({ error: 'Informe o procedimento.' })
    const procedureKey = normalizeProcedureKey(String(req.params.procedureKey || procedureName))
    const minDays = safeInt(req.body.clinicalMinReturnDays, 0, 0, 365)
    const maxRaw = req.body.clinicalMaxReturnDays
    const maxDays = maxRaw === null || maxRaw === undefined || maxRaw === '' ? null : safeInt(maxRaw, minDays, minDays, 730)
    const preferredRaw = req.body.preferredReturnIntervalDays
    const preferred = preferredRaw === null || preferredRaw === undefined || preferredRaw === '' ? null : safeInt(preferredRaw, minDays, minDays, maxDays ?? 730)
    const row = await prisma.smartProcedureRule.upsert({
      where: { clinicId_procedureKey: { clinicId: c.clinicId, procedureKey } },
      update: {
        procedureName,
        durationMinutes: safeInt(req.body.durationMinutes, 30, 5, 480),
        clinicalMinReturnDays: minDays,
        clinicalMaxReturnDays: maxDays,
        preferredReturnIntervalDays: preferred,
        isActive: req.body.isActive !== false
      },
      create: {
        ...c,
        procedureKey,
        procedureName,
        durationMinutes: safeInt(req.body.durationMinutes, 30, 5, 480),
        clinicalMinReturnDays: minDays,
        clinicalMaxReturnDays: maxDays,
        preferredReturnIntervalDays: preferred,
        isActive: req.body.isActive !== false
      }
    })
    return res.json(row)
  } catch (error) {
    console.error('Erro ao salvar regra de procedimento:', error)
    return res.status(500).json({ error: 'Erro ao salvar regra de procedimento.' })
  }
}

export async function upsertLaboratoryRule(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const c = ctx(req)
    const laboratoryName = String(req.body.laboratoryName || '').trim()
    const serviceName = String(req.body.serviceName || '').trim()
    if (!laboratoryName || !serviceName) return res.status(400).json({ error: 'Informe laboratório e serviço.' })
    const serviceKey = normalizeProcedureKey(serviceName)
    const row = await prisma.smartLaboratoryRule.upsert({
      where: { clinicId_laboratoryName_serviceKey: { clinicId: c.clinicId, laboratoryName, serviceKey } },
      update: {
        serviceName,
        leadTimeDays: safeInt(req.body.leadTimeDays, 15, 0, 365),
        safetyDays: safeInt(req.body.safetyDays, 0, 0, 90),
        isActive: req.body.isActive !== false
      },
      create: {
        ...c,
        laboratoryName,
        serviceKey,
        serviceName,
        leadTimeDays: safeInt(req.body.leadTimeDays, 15, 0, 365),
        safetyDays: safeInt(req.body.safetyDays, 0, 0, 90),
        isActive: req.body.isActive !== false
      }
    })
    return res.json(row)
  } catch (error) {
    console.error('Erro ao salvar regra de laboratório:', error)
    return res.status(500).json({ error: 'Erro ao salvar regra de laboratório.' })
  }
}

export async function patientPreference(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const c = ctx(req)
    const patientId = String(req.params.patientId)
    const patient = await prisma.patient.findFirst({ where: { id: patientId, ...c, isActive: true } })
    if (!patient) return res.status(404).json({ error: 'Paciente não encontrado na clínica atual.' })
    const preference = await prisma.patientSchedulingPreference.findUnique({ where: { clinicId_patientId: { clinicId: c.clinicId, patientId } } })
    return res.json(preference || { patientId, preferredWeekday: null, preferredTimeStart: null, preferredTimeEnd: null, source: 'NOT_SET' })
  } catch (error) {
    console.error('Erro ao consultar preferência de agenda:', error)
    return res.status(500).json({ error: 'Erro ao consultar preferência de agenda.' })
  }
}

export async function updatePatientPreference(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const c = ctx(req)
    const patientId = String(req.params.patientId)
    const patient = await prisma.patient.findFirst({ where: { id: patientId, ...c, isActive: true } })
    if (!patient) return res.status(404).json({ error: 'Paciente não encontrado na clínica atual.' })
    const weekdayRaw = req.body.preferredWeekday
    const preferredWeekday = weekdayRaw === null || weekdayRaw === undefined || weekdayRaw === '' ? null : safeInt(weekdayRaw, 1, 0, 6)
    const row = await prisma.patientSchedulingPreference.upsert({
      where: { clinicId_patientId: { clinicId: c.clinicId, patientId } },
      update: {
        preferredWeekday,
        preferredTimeStart: req.body.preferredTimeStart ? String(req.body.preferredTimeStart) : null,
        preferredTimeEnd: req.body.preferredTimeEnd ? String(req.body.preferredTimeEnd) : null,
        notes: req.body.notes ? String(req.body.notes) : null,
        source: String(req.body.source || 'MANUAL')
      },
      create: {
        ...c,
        patientId,
        preferredWeekday,
        preferredTimeStart: req.body.preferredTimeStart ? String(req.body.preferredTimeStart) : null,
        preferredTimeEnd: req.body.preferredTimeEnd ? String(req.body.preferredTimeEnd) : null,
        notes: req.body.notes ? String(req.body.notes) : null,
        source: String(req.body.source || 'MANUAL')
      }
    })
    return res.json(row)
  } catch (error) {
    console.error('Erro ao salvar preferência de agenda:', error)
    return res.status(500).json({ error: 'Erro ao salvar preferência de agenda.' })
  }
}

export async function suggest(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const c = ctx(req)
    const patientId = String(req.body.patientId || '')
    const procedure = String(req.body.procedure || '').trim()
    if (!patientId || !procedure) return res.status(400).json({ error: 'Paciente e procedimento são obrigatórios.' })

    const patient = await prisma.patient.findFirst({ where: { id: patientId, ...c, isActive: true } })
    if (!patient) return res.status(404).json({ error: 'Paciente não encontrado na clínica atual.' })
    const referenceAt = parseDate(req.body.referenceAt) || new Date()
    const policy = await ensurePolicy(c.clinicId, c.tenantId)
    if (!policy.enabled) return res.status(409).json({ error: 'Agenda Inteligente está desabilitada para esta clínica.' })

    const procedureKey = normalizeProcedureKey(procedure)
    let procedureRule = await prisma.smartProcedureRule.findUnique({ where: { clinicId_procedureKey: { clinicId: c.clinicId, procedureKey } } })
    if (!procedureRule) {
      const candidates = await prisma.smartProcedureRule.findMany({ where: { ...c, isActive: true } })
      procedureRule = candidates.find(row => procedureKey.includes(row.procedureKey) || row.procedureKey.includes(procedureKey)) || null
    }

    let laboratoryRule: SmartLaboratoryRule | null = null
    const laboratoryName = req.body.laboratoryName ? String(req.body.laboratoryName) : ''
    const laboratoryService = req.body.laboratoryService ? String(req.body.laboratoryService) : ''
    if (laboratoryName && laboratoryService) {
      laboratoryRule = await prisma.smartLaboratoryRule.findUnique({
        where: {
          clinicId_laboratoryName_serviceKey: {
            clinicId: c.clinicId,
            laboratoryName,
            serviceKey: normalizeProcedureKey(laboratoryService)
          }
        }
      })
    }

    const preference = await prisma.patientSchedulingPreference.findUnique({ where: { clinicId_patientId: { clinicId: c.clinicId, patientId } } })
    const budgetId = req.body.budgetId ? String(req.body.budgetId) : undefined
    const budget = await prisma.budget.findFirst({
      where: { ...c, patientId, ...(budgetId ? { id: budgetId } : {}) },
      include: { payments: true },
      orderBy: { updatedAt: 'desc' }
    })
    const pendingPayments = budget?.payments.filter(payment => !payment.paidDate && !['PAID', 'CANCELLED'].includes(String(payment.status).toUpperCase())) || []
    const overduePayments = pendingPayments.filter(payment => payment.dueDate.getTime() < Date.now())
    const nextPayment = pendingPayments
      .filter(payment => payment.dueDate.getTime() >= referenceAt.getTime())
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]
    const financialCadenceDays = inferFinancialCadenceDays(budget?.installments)

    const result = computeSmartSchedule({
      referenceAt,
      policy,
      procedureRule,
      laboratoryRule,
      preferredWeekday: preference?.preferredWeekday,
      financeReferenceAt: nextPayment?.dueDate || null,
      financialCadenceDays,
      hasOverduePayments: overduePayments.length > 0
    })

    const recommendation = `Sugestão: retorno em ${result.suggestedReturnAt.toLocaleDateString('pt-BR')} com reserva de ${result.durationMinutes} min. Critério clínico tem prioridade sobre fatores financeiros.`
    const decision = await prisma.smartSchedulingDecision.create({
      data: {
        ...c,
        patientId,
        appointmentId: req.body.appointmentId ? String(req.body.appointmentId) : null,
        procedure,
        durationMinutes: result.durationMinutes,
        referenceAt: result.referenceAt,
        clinicalEarliestAt: result.clinicalEarliestAt,
        clinicalLatestAt: result.clinicalLatestAt,
        laboratoryReadyAt: result.laboratoryReadyAt,
        financeReferenceAt: result.financeReferenceAt,
        suggestedReturnAt: result.suggestedReturnAt,
        recommendation,
        warnings: result.warnings,
        factors: result.factors as Prisma.InputJsonValue,
        status: 'SUGGESTED',
        createdById: req.user.id
      }
    })

    await writeAudit({
      ...c,
      actorId: req.user.id,
      module: 'agenda',
      action: 'SMART_SCHEDULING_SUGGEST',
      entityType: 'SmartSchedulingDecision',
      entityId: decision.id,
      summary: recommendation,
      afterData: { ...decision, patientName: patient.fullName }
    })

    return res.status(201).json({
      decisionId: decision.id,
      patient: { id: patient.id, fullName: patient.fullName },
      procedure,
      durationMinutes: result.durationMinutes,
      referenceAt: result.referenceAt,
      clinicalEarliestAt: result.clinicalEarliestAt,
      clinicalLatestAt: result.clinicalLatestAt,
      laboratoryReadyAt: result.laboratoryReadyAt,
      financeReferenceAt: result.financeReferenceAt,
      suggestedReturnAt: result.suggestedReturnAt,
      preferredWeekday: result.preferredWeekday,
      warnings: result.warnings,
      factors: result.factors as Prisma.InputJsonValue,
      recommendation,
      clinicalPriority: true
    })
  } catch (error) {
    console.error('Erro ao gerar sugestão inteligente:', error)
    return res.status(500).json({ error: 'Erro ao gerar sugestão inteligente.' })
  }
}

export async function decisions(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const c = ctx(req)
    const patientId = req.query.patientId ? String(req.query.patientId) : undefined
    const status = req.query.status ? String(req.query.status) : undefined
    const rows = await prisma.smartSchedulingDecision.findMany({
      where: { ...c, ...(patientId ? { patientId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200
    })
    return res.json(rows)
  } catch (error) {
    console.error('Erro ao listar decisões de agenda:', error)
    return res.status(500).json({ error: 'Erro ao listar decisões de agenda.' })
  }
}

export async function acceptDecision(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const c = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.smartSchedulingDecision.findFirst({ where: { id, ...c } })
    if (!existing) return res.status(404).json({ error: 'Sugestão não encontrada.' })
    const chosenReturnAt = parseDate(req.body.chosenReturnAt) || existing.suggestedReturnAt
    const row = await prisma.smartSchedulingDecision.update({
      where: { id },
      data: { status: 'ACCEPTED', chosenReturnAt, overridden: false, overrideReason: null }
    })
    await writeAudit({ ...c, actorId: req.user.id, module: 'agenda', action: 'SMART_SCHEDULING_ACCEPT', entityType: 'SmartSchedulingDecision', entityId: id, afterData: row })
    return res.json(row)
  } catch (error) {
    console.error('Erro ao aceitar sugestão de agenda:', error)
    return res.status(500).json({ error: 'Erro ao aceitar sugestão de agenda.' })
  }
}

export async function overrideDecision(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const c = ctx(req)
    const id = String(req.params.id)
    const reason = String(req.body.reason || '').trim()
    if (!reason) return res.status(400).json({ error: 'Informe o motivo para ignorar ou alterar a sugestão.' })
    const existing = await prisma.smartSchedulingDecision.findFirst({ where: { id, ...c } })
    if (!existing) return res.status(404).json({ error: 'Sugestão não encontrada.' })
    const chosenReturnAt = parseDate(req.body.chosenReturnAt) || existing.suggestedReturnAt
    const row = await prisma.smartSchedulingDecision.update({
      where: { id },
      data: { status: 'OVERRIDDEN', chosenReturnAt, overridden: true, overrideReason: reason }
    })
    await writeAudit({ ...c, actorId: req.user.id, module: 'agenda', action: 'SMART_SCHEDULING_OVERRIDE', entityType: 'SmartSchedulingDecision', entityId: id, summary: reason, beforeData: existing, afterData: row })
    return res.json(row)
  } catch (error) {
    console.error('Erro ao alterar sugestão de agenda:', error)
    return res.status(500).json({ error: 'Erro ao alterar sugestão de agenda.' })
  }
}
