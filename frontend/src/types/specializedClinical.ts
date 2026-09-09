export type SpecializedClinicalSpecialty =
  | "ORTHODONTICS"
  | "FUNCTIONAL_ORTHOPEDICS"
  | "TMD_OROFACIAL_PAIN";

export type SpecializedClinicalRecordStatus =
  | "ACTIVE"
  | "RETENTION"
  | "COMPLETED"
  | "ABANDONED"
  | "DISCHARGED";

export type SpecializedEvolutionType =
  | "ACTIVATION"
  | "MONTHLY_FOLLOW_UP"
  | "INCIDENT"
  | "RETENTION"
  | "FUNCTIONAL_FOLLOW_UP"
  | "PAIN_FOLLOW_UP"
  | "FINALIZATION"
  | "OTHER";

export type SpecializedAttachmentCategory =
  | "CEPHALOMETRY"
  | "PHOTOGRAPH"
  | "MODEL"
  | "RADIOGRAPH"
  | "SCAN"
  | "DICOM"
  | "OTHER";

export interface OrthodonticsClinicalData {
  angleClassification?: string | null;
  canineRelationship?: string | null;
  overbiteMm?: number | null;
  overjetMm?: number | null;
  crossbite?: string | null;
  openBite?: string | null;
  midlineDeviation?: string | null;
  crowding?: string | null;
  diastemas?: string | null;
  facialPattern?: string | null;
  habits?: string[];
  appliance?: string | null;
  technique?: string | null;
  prescription?: string | null;
  brackets?: string | null;
  tubes?: string | null;
  bands?: string | null;
  wires?: string | null;
  arches?: string | null;
  elastics?: string | null;
  accessories?: string | null;
  anchorage?: string | null;
  miniImplants?: string | null;
  cephalometricAnalysis?: string | null;
  retention?: string | null;
  completionNotes?: string | null;
  abandonmentReason?: string | null;
  dischargeNotes?: string | null;
}

export interface FunctionalOrthopedicsClinicalData {
  functionalDiagnosis?: string | null;
  appliance?: string | null;
  indication?: string | null;
  usageProtocol?: string | null;
  activations?: string | null;
  evolution?: string | null;
  patientCooperation?: "POOR" | "PARTIAL" | "GOOD" | "EXCELLENT" | null;
}

export interface TmdOrofacialPainClinicalData {
  painLocations?: string[];
  side?: "RIGHT" | "LEFT" | "BILATERAL" | "CENTRAL" | "NOT_APPLICABLE" | null;
  duration?: string | null;
  frequency?: string | null;
  intensityDescription?: string | null;
  painScale?: number | null;
  aggravatingFactors?: string[];
  relievingFactors?: string[];
  openingLimitation?: boolean | null;
  openingMm?: number | null;
  deviation?: string | null;
  deflection?: string | null;
  clicking?: string | null;
  crepitation?: string | null;
  locking?: string | null;
  dislocation?: string | null;
  musclePalpation?: string | null;
  jointPalpation?: string | null;
  parafunctionalHabits?: string[];
  bruxism?: string | null;
  clenching?: string | null;
  sleep?: string | null;
  associatedHeadache?: string | null;
  occlusalSplint?: string | null;
  medication?: string | null;
  physiotherapy?: string | null;
  speechTherapy?: string | null;
  referrals?: string | null;
  followUp?: string | null;
  evolution?: string | null;
}

export type SpecializedClinicalData =
  | OrthodonticsClinicalData
  | FunctionalOrthopedicsClinicalData
  | TmdOrofacialPainClinicalData;

export interface SpecializedEvolutionClinicalData {
  activation?: string | null;
  applianceAdjustment?: string | null;
  wire?: string | null;
  arch?: string | null;
  elastics?: string | null;
  accessories?: string | null;
  anchorage?: string | null;
  miniImplants?: string | null;
  incidents?: string | null;
  cooperation?: string | null;
  painScale?: number | null;
  openingMm?: number | null;
  jointSounds?: string | null;
  musclePalpation?: string | null;
  jointPalpation?: string | null;
  medications?: string | null;
  therapies?: string | null;
  referrals?: string | null;
  nextSteps?: string | null;
}

export interface SpecializedClinicalEvolution {
  id: string;
  clinicId: string;
  tenantId: string;
  patientId: string;
  recordId: string;
  evolutionType: SpecializedEvolutionType;
  professionalId?: string | null;
  professionalName: string;
  summary: string;
  clinicalData: SpecializedEvolutionClinicalData;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpecializedClinicalAttachment {
  id: string;
  clinicId: string;
  tenantId: string;
  patientId: string;
  recordId: string;
  category: SpecializedAttachmentCategory;
  clinicalFileId?: string | null;
  fileName: string;
  mimeType?: string | null;
  storageKey?: string | null;
  capturedAt?: string | null;
  notes?: string | null;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpecializedClinicalRecord {
  id: string;
  clinicId: string;
  tenantId: string;
  patientId: string;
  specialty: SpecializedClinicalSpecialty;
  status: SpecializedClinicalRecordStatus;
  chiefComplaint?: string | null;
  diagnosis?: string | null;
  diagnosticHypothesis?: string | null;
  treatmentPlan?: string | null;
  responsibleId?: string | null;
  responsibleName?: string | null;
  clinicalData: SpecializedClinicalData;
  startedAt: string;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  evolutions: SpecializedClinicalEvolution[];
  attachments: SpecializedClinicalAttachment[];
}

export interface SpecializedClinicalPatient {
  id: string;
  fullName: string;
  phone: string;
}

export interface SpecializedClinicalResponse {
  patient: SpecializedClinicalPatient;
  records: SpecializedClinicalRecord[];
}
