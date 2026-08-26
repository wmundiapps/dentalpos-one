export interface SmartSchedulingPolicyShape {
  defaultDurationMinutes: number
  defaultReturnIntervalDays: number
  respectPreferredWeekday: boolean
  financeOptimizationEnabled: boolean
  financeNeverOverridesClinical: boolean
  overdueWarningOnly: boolean
  maxLookAheadDays: number
}

export interface SmartProcedureRuleShape {
  durationMinutes: number
  clinicalMinReturnDays: number
  clinicalMaxReturnDays: number | null
  preferredReturnIntervalDays: number | null
}

export interface SmartLaboratoryRuleShape {
  leadTimeDays: number
  safetyDays: number
}

export interface SchedulingComputationInput {
  referenceAt: Date
  policy: SmartSchedulingPolicyShape
  procedureRule?: SmartProcedureRuleShape | null
  laboratoryRule?: SmartLaboratoryRuleShape | null
  preferredWeekday?: number | null
  financeReferenceAt?: Date | null
  financialCadenceDays?: number | null
  hasOverduePayments?: boolean
}

export interface SchedulingComputationResult {
  durationMinutes: number
  referenceAt: Date
  clinicalEarliestAt: Date
  clinicalLatestAt: Date | null
  laboratoryReadyAt: Date | null
  financeReferenceAt: Date | null
  suggestedReturnAt: Date
  preferredWeekday: number | null
  warnings: string[]
  factors: Record<string, unknown>
}

export function normalizeProcedureKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'procedimento'
}

export function addDays(base: Date, days: number) {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

function maxDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b
}

function within(date: Date, min: Date, max: Date | null) {
  if (date.getTime() < min.getTime()) return false
  if (max && date.getTime() > max.getTime()) return false
  return true
}

function moveForwardToWeekday(date: Date, weekday: number) {
  const normalized = Math.max(0, Math.min(6, Math.trunc(weekday)))
  const copy = new Date(date)
  const delta = (normalized - copy.getDay() + 7) % 7
  copy.setDate(copy.getDate() + delta)
  return copy
}

function dateOnlyDistanceDays(a: Date, b: Date) {
  const aa = new Date(a); aa.setHours(12, 0, 0, 0)
  const bb = new Date(b); bb.setHours(12, 0, 0, 0)
  return Math.round((bb.getTime() - aa.getTime()) / 86400000)
}

export function inferFinancialCadenceDays(installments?: number | null) {
  const count = Math.max(0, Number(installments || 0))
  if (count >= 10) return 21
  if (count >= 6) return 14
  if (count >= 3) return 7
  return null
}

export function computeSmartSchedule(input: SchedulingComputationInput): SchedulingComputationResult {
  const warnings: string[] = []
  const { policy, procedureRule, laboratoryRule } = input
  const referenceAt = new Date(input.referenceAt)
  const durationMinutes = procedureRule?.durationMinutes || policy.defaultDurationMinutes || 30
  const minDays = Math.max(0, procedureRule?.clinicalMinReturnDays ?? 0)
  const preferredDays = Math.max(
    minDays,
    procedureRule?.preferredReturnIntervalDays ?? policy.defaultReturnIntervalDays ?? minDays
  )
  const maxDaysRaw = procedureRule?.clinicalMaxReturnDays
  const maxDays = maxDaysRaw == null ? null : Math.max(minDays, maxDaysRaw)

  const clinicalEarliestAt = addDays(referenceAt, minDays)
  const clinicalLatestAt = maxDays == null ? null : addDays(referenceAt, maxDays)
  let candidate = addDays(referenceAt, preferredDays)
  if (candidate.getTime() < clinicalEarliestAt.getTime()) candidate = new Date(clinicalEarliestAt)
  if (clinicalLatestAt && candidate.getTime() > clinicalLatestAt.getTime()) candidate = new Date(clinicalLatestAt)

  let laboratoryReadyAt: Date | null = null
  if (laboratoryRule) {
    laboratoryReadyAt = addDays(referenceAt, Math.max(0, laboratoryRule.leadTimeDays + laboratoryRule.safetyDays))
    if (laboratoryReadyAt.getTime() > candidate.getTime()) candidate = new Date(laboratoryReadyAt)
    if (clinicalLatestAt && laboratoryReadyAt.getTime() > clinicalLatestAt.getTime()) {
      warnings.push('O prazo laboratorial ultrapassa a janela clínica configurada. Revisão manual obrigatória.')
    }
  }

  const financeReferenceAt = input.financeReferenceAt ? new Date(input.financeReferenceAt) : null
  if (policy.financeOptimizationEnabled && financeReferenceAt && clinicalLatestAt) {
    const distance = Math.abs(dateOnlyDistanceDays(candidate, financeReferenceAt))
    if (distance <= 3 && within(financeReferenceAt, clinicalEarliestAt, clinicalLatestAt)) {
      candidate = maxDate(financeReferenceAt, laboratoryReadyAt || clinicalEarliestAt)
    }
  }

  if (policy.financeOptimizationEnabled && input.financialCadenceDays && clinicalLatestAt) {
    const financialCandidate = addDays(referenceAt, input.financialCadenceDays)
    if (within(financialCandidate, clinicalEarliestAt, clinicalLatestAt)) {
      const distance = Math.abs(dateOnlyDistanceDays(candidate, financialCandidate))
      if (distance <= 3) candidate = maxDate(financialCandidate, laboratoryReadyAt || clinicalEarliestAt)
    }
  }

  const preferredWeekday = input.preferredWeekday == null ? null : Math.max(0, Math.min(6, Math.trunc(input.preferredWeekday)))
  if (policy.respectPreferredWeekday && preferredWeekday != null) {
    const adjusted = moveForwardToWeekday(candidate, preferredWeekday)
    if (within(adjusted, clinicalEarliestAt, clinicalLatestAt)) {
      candidate = adjusted
    } else if (adjusted.getDay() !== candidate.getDay()) {
      warnings.push('O dia habitual do paciente ficou fora da janela clínica; mantida a prioridade clínica.')
    }
  }

  if (input.hasOverduePayments) {
    warnings.push('Há parcela(s) vencida(s). Exibir alerta financeiro sem bloquear ou retardar necessidade clínica.')
  }

  const hardLookAhead = addDays(referenceAt, Math.max(1, policy.maxLookAheadDays || 180))
  if (candidate.getTime() > hardLookAhead.getTime()) {
    candidate = hardLookAhead
    warnings.push('Sugestão limitada pelo horizonte máximo configurado para a agenda.')
  }

  if (candidate.getTime() < clinicalEarliestAt.getTime()) candidate = new Date(clinicalEarliestAt)

  return {
    durationMinutes,
    referenceAt,
    clinicalEarliestAt,
    clinicalLatestAt,
    laboratoryReadyAt,
    financeReferenceAt,
    suggestedReturnAt: candidate,
    preferredWeekday,
    warnings,
    factors: {
      clinical: {
        minReturnDays: minDays,
        preferredReturnIntervalDays: preferredDays,
        maxReturnDays: maxDays,
        priority: 'CLINICAL_FIRST'
      },
      laboratory: laboratoryRule ? {
        leadTimeDays: laboratoryRule.leadTimeDays,
        safetyDays: laboratoryRule.safetyDays
      } : null,
      finance: {
        enabled: policy.financeOptimizationEnabled,
        neverOverridesClinical: true,
        referenceAt: financeReferenceAt?.toISOString() || null,
        cadenceDays: input.financialCadenceDays || null,
        overdueWarningOnly: true
      },
      patientPreference: {
        preferredWeekday
      }
    }
  }
}
