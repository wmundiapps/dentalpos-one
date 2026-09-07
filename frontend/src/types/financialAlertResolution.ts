export type FinancialAlertState='ACTIVE'|'IN_PROGRESS'|'RESOLVED'|'DISMISSED'
export type FinancialAlertAction='PAYMENT'|'SETTLEMENT'|'RENEGOTIATION'|'CANCELLATION'|'ADJUSTMENT'|'REVERSAL'|'DISMISSAL'|'MARK_IN_PROGRESS'
export type FinancialSourceEntity='FinancialEntry'|'Payment'|'Budget'
export interface FinancialAlertResolution { id:string; sourceEntityType:FinancialSourceEntity; sourceEntityId:string; status:FinancialAlertState; action?:FinancialAlertAction|null; reason?:string|null; resolvedById?:string|null; resolvedAt?:string|null; patientId?:string|null; supplierId?:string|null; personName?:string|null; amount:number; replacementEntityType?:FinancialSourceEntity|null; replacementEntityId?:string|null; createdAt:string; updatedAt:string }
