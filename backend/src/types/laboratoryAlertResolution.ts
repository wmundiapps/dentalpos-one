export type LaboratoryAlertKind = 'LABORATORY_OVERDUE' | 'LABORATORY_AT_RISK'
export type PendingResolutionState = 'ACTIVE' | 'IN_TREATMENT' | 'RESOLVED' | 'DISMISSED'
export type LaboratoryResolutionAction =
  | 'RECEIVED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RENEGOTIATED'
  | 'IMPROPER_ALERT'
  | 'DEMO_DATA'

export interface LaboratoryResolutionInput {
  action: LaboratoryResolutionAction
  alertKind?: LaboratoryAlertKind
  solution: string
  observation?: string | null
  reason?: string | null
  newDueDate?: string | null
}

export interface LaboratoryPendingState {
  state: PendingResolutionState
  active: boolean
  resolutionDate: string | null
  responsibleUserId: string | null
  reason: string | null
  solution: string | null
  entity: {
    type: 'LaboratoryWork'
    id: string
    trackingCode: string
  }
  alertKind: LaboratoryAlertKind
  alertKey: string
  dueDate: string | null
  originalDueDate?: string | null
  newDueDate?: string | null
  resolutionAction?: LaboratoryResolutionAction | null
  protocolSeed?: string | null
}
