export type MaterialTrace = { name: string; brand?: string; lot?: string; quantity?: string }
export type ClinicalFileRef = { id?: string; label?: string; url?: string; type?: string }

export interface SurgeryInput {
  surgeryType: string
  tooth?: number | null
  region?: string | null
  diagnosis: string
  planning: string
  technique: string
  anesthesia?: string | null
  anesthetic?: string | null
  medications?: MaterialTrace[]
  biomaterials?: MaterialTrace[]
  graft?: string | null
  membrane?: string | null
  suture?: string | null
  materialLots?: MaterialTrace[]
  complications?: string | null
  instructions?: string | null
  surgeryDate?: string | null
  returnAt?: string | null
  professionalId?: string | null
  professionalName?: string | null
  treatmentItemId?: string | null
  clinicalEvolutionId?: string | null
  status?: string
  notes?: string | null
}

export interface ImplantInput {
  surgeryCaseId?: string | null
  treatmentItemId?: string | null
  region?: string | null
  tooth?: number | null
  brand: string
  productLine?: string | null
  connection: string
  platform?: string | null
  diameterMm: number
  lengthMm: number
  lot: string
  serialNumber?: string | null
  installationDate?: string | null
  insertionTorqueNcm?: number | null
  primaryStability?: string | null
  isq?: number | null
  graft?: string | null
  prostheticComponent?: string | null
  healingAbutment?: string | null
  miniPillar?: string | null
  transmucosalHeightMm?: number | null
  componentTorqueNcm?: number | null
  prostheticDate?: string | null
  professionalId?: string | null
  professionalName?: string | null
  laboratoryWorkId?: string | null
  radiographRefs?: ClinicalFileRef[]
  notes?: string | null
  complications?: string | null
  traceabilityCode?: string | null
  barcodeValue?: string | null
  qrValue?: string | null
  traceabilityPayload?: Record<string, unknown>
  scanSource?: string | null
}

export interface ProsthesisInput {
  treatmentItemId?: string | null
  implantRecordId?: string | null
  laboratoryWorkId?: string | null
  prosthesisType: string
  teeth?: number[]
  region?: string | null
  material: string
  shade?: string | null
  shadeGuide?: string | null
  conventionalImpression?: boolean
  impressionNotes?: string | null
  intraoralScan?: boolean
  scanSystem?: string | null
  stlFileRefs?: ClinicalFileRef[]
  provisional?: string | null
  tryIn?: string | null
  framework?: string | null
  ceramic?: string | null
  adjustment?: string | null
  deliveryDate?: string | null
  cementation?: string | null
  screw?: string | null
  torqueNcm?: number | null
  warrantyUntil?: string | null
  warrantyTerms?: string | null
  maintenancePlan?: string | null
  status?: string
  notes?: string | null
}
