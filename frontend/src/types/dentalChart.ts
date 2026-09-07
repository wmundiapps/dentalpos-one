export type Dentition = 'ADULT' | 'CHILD'
export type ClinicalState = 'CURRENT' | 'PLANNED' | 'COMPLETED'
export type ToothSurface = 'M' | 'D' | 'O' | 'V' | 'L'
export type PeriodontalSite = 'MB' | 'B' | 'DB' | 'ML' | 'L' | 'DL'

export interface DentalFinding {
  id: string
  code: string
  label: string
  category: string
  color?: string | null
  isActive: boolean
  system?: boolean
}
export interface DentalChartEntry {
  id: string
  patientId: string
  dentition: Dentition
  tooth: number
  surface?: ToothSurface | null
  findingCode: string
  findingLabel: string
  clinicalState: ClinicalState
  status: 'ACTIVE' | 'REMOVED'
  notes?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
}
export interface PeriodontalSiteRecord {
  id?: string
  tooth: number
  site: PeriodontalSite
  probingDepth: number
  recession: number
  clinicalAttachmentLevel?: number
  bleeding: boolean
  plaque: boolean
  suppuration: boolean
  mobility?: number | null
  furcation?: number | null
  notes?: string | null
}
export interface PeriodontalExam {
  id: string
  dentition: Dentition
  examinedAt: string
  professionalName?: string | null
  notes?: string | null
  sites: PeriodontalSiteRecord[]
}
