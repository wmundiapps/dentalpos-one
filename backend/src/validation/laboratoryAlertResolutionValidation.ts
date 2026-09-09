import type { LaboratoryAlertKind, LaboratoryResolutionAction, LaboratoryResolutionInput } from '../types/laboratoryAlertResolution'
import { ValidationError } from './specialtyClinicalValidation'

const actions: LaboratoryResolutionAction[] = ['RECEIVED','DELIVERED','COMPLETED','CANCELLED','RENEGOTIATED','IMPROPER_ALERT','DEMO_DATA']
const kinds: LaboratoryAlertKind[] = ['LABORATORY_OVERDUE','LABORATORY_AT_RISK']
const clean = (v: unknown) => String(v ?? '').trim()

export function validateLaboratoryResolution(body: unknown): LaboratoryResolutionInput {
  const b = (body || {}) as Record<string, unknown>
  const action = clean(b.action) as LaboratoryResolutionAction
  if (!actions.includes(action)) throw new ValidationError('Ação de resolução laboratorial inválida')
  const alertKind = (clean(b.alertKind) || 'LABORATORY_OVERDUE') as LaboratoryAlertKind
  if (!kinds.includes(alertKind)) throw new ValidationError('Tipo de alerta laboratorial inválido')
  const solution = clean(b.solution)
  if (!solution) throw new ValidationError('Informe a solução adotada')
  const reason = clean(b.reason) || null
  if (['CANCELLED','RENEGOTIATED','IMPROPER_ALERT','DEMO_DATA'].includes(action) && !reason) {
    throw new ValidationError('Informe o motivo para cancelar, renegociar ou dispensar o alerta')
  }
  const newDueDate = clean(b.newDueDate) || null
  if (action === 'RENEGOTIATED') {
    if (!newDueDate) throw new ValidationError('Informe a nova data de prazo')
    const dt = new Date(newDueDate)
    if (Number.isNaN(dt.getTime())) throw new ValidationError('Nova data de prazo inválida')
  }
  return { action, alertKind, solution, observation: clean(b.observation) || null, reason, newDueDate }
}
