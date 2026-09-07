export interface ClinicalRecordData {
  mainComplaint: string
  currentDiseaseHistory: string
  dentalHistory: string
  medicalHistory: string
  systemicDiseases: string[]
  medications: string[]
  allergies: string[]
  previousSurgeries: string[]
  hospitalizations: string[]
  pregnancy: { applicable: boolean; status: 'NO' | 'YES' | 'SUSPECTED' | 'NOT_INFORMED'; weeks?: number }
  smoking: { status: 'NEVER' | 'CURRENT' | 'FORMER' | 'NOT_INFORMED'; details: string }
  alcohol: { status: 'NO' | 'YES' | 'FORMER' | 'NOT_INFORMED'; details: string }
  parafunctionalHabits: string[]
  relevantFamilyHistory: string
  vitalSigns: { systolic?: number; diastolic?: number; glucoseMgDl?: number; measuredAt?: string }
  riskConditions: string[]
  clinicalAlerts: string[]
  observations: string
  diagnosticHypothesis: string
  diagnosis: string
  extraoralExam: string
  intraoralExam: string
  softTissues: string
  tmj: string
  occlusion: string
  periodontalCondition: string
  generalDentalCondition: string
  initialClinicalPlan: string
  customFields: Record<string, string | number | boolean | string[] | null>
}

export interface ClinicalSignatureAdapter {
  createSignatureRequest(input: { clinicalRecordId: string; revisionNumber: number; patientId: string }): Promise<{ externalId: string; status: string }>
  getSignatureStatus(externalId: string): Promise<{ status: string; signedAt?: string }>
}
