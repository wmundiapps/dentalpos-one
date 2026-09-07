export type MaterialTrace = { name: string; brand?: string; lot?: string; quantity?: string }
export type ClinicalFileRef = { id?: string; label?: string; url?: string; type?: string }
export type LabLink = { id: string; trackingCode: string; workType: string; status: string }

export interface SurgeryRecord {
  id: string; patientId: string; surgeryType: string; tooth?: number|null; region?: string|null; diagnosis: string; planning: string; technique: string;
  anesthesia?: string|null; anesthetic?: string|null; medications: MaterialTrace[]; biomaterials: MaterialTrace[]; graft?: string|null; membrane?: string|null; suture?: string|null;
  materialLots: MaterialTrace[]; complications?: string|null; instructions?: string|null; surgeryDate?: string|null; returnAt?: string|null; professionalName?: string|null;
  status: string; notes?: string|null; followUps?: SurgeryFollowUp[]; treatmentItemId?: string|null; clinicalEvolutionId?: string|null;
}
export interface SurgeryFollowUp { id:string; followUpAt:string; professionalName?:string|null; symptoms?:string|null; healing?:string|null; complications?:string|null; instructions?:string|null; nextReturnAt?:string|null; notes?:string|null }
export interface ImplantRecord {
  id:string; patientId:string; surgeryCaseId?:string|null; treatmentItemId?:string|null; region?:string|null; tooth?:number|null; brand:string; productLine?:string|null; connection:string; platform?:string|null;
  diameterMm:number|string; lengthMm:number|string; lot:string; serialNumber?:string|null; installationDate?:string|null; insertionTorqueNcm?:number|string|null; primaryStability?:string|null; isq?:number|string|null;
  graft?:string|null; prostheticComponent?:string|null; healingAbutment?:string|null; miniPillar?:string|null; transmucosalHeightMm?:number|string|null; componentTorqueNcm?:number|string|null; prostheticDate?:string|null;
  professionalName?:string|null; laboratoryWorkId?:string|null; laboratoryWork?:LabLink|null; radiographRefs:ClinicalFileRef[]; notes?:string|null; complications?:string|null; traceabilityCode?:string|null; barcodeValue?:string|null; qrValue?:string|null; scanSource?:string|null;
}
export interface ProsthesisRecord {
  id:string; patientId:string; treatmentItemId?:string|null; implantRecordId?:string|null; laboratoryWorkId?:string|null; laboratoryWork?:LabLink|null; prosthesisType:string; teeth:number[]; region?:string|null; material:string; shade?:string|null; shadeGuide?:string|null;
  conventionalImpression:boolean; impressionNotes?:string|null; intraoralScan:boolean; scanSystem?:string|null; stlFileRefs:ClinicalFileRef[]; provisional?:string|null; tryIn?:string|null; framework?:string|null; ceramic?:string|null; adjustment?:string|null;
  deliveryDate?:string|null; cementation?:string|null; screw?:string|null; torqueNcm?:number|string|null; warrantyUntil?:string|null; warrantyTerms?:string|null; maintenancePlan?:string|null; status:string; notes?:string|null; history?:ProsthesisHistory[];
}
export interface ProsthesisHistory { id:string; stage:string; status?:string|null; occurredAt:string; professionalName?:string|null; notes?:string|null }

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