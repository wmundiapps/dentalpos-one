export type PatientStatus = "Ativo" | "Em acompanhamento" | "Inativo";
export type ToothSurface = "M" | "D" | "V" | "L/P" | "O/I";
export type ClinicalItemState = "pending" | "done";

export interface PatientProfile {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  cpf?: string;
  birthDate?: string;
  gender?: "Masculino" | "Feminino" | "Outro" | "Não informado";
  treatment?: string;
  lastAppointment?: string;
  status: PatientStatus;
  mainComplaint?: string;
  allergies?: string;
  medications?: string;
  medicalHistory?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OdontogramMark {
  id: string;
  tooth: number;
  surface?: ToothSurface;
  state: ClinicalItemState;
  finding: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  sourceEvolutionId?: string;
  correctionHistory?: Array<{ atISO:string; action:"Editado"|"Removido"|"Status alterado"; previousFinding?:string; newFinding?:string; note?:string }>;
}

export interface ClinicalEvolutionEntry {
  id: string;
  patientId: string;
  dateISO: string;
  professional: string;
  procedure: string;
  notes: string;
  nextProcedure: string;
  selectedMarkIds: string[];
  odontogramSnapshot: OdontogramMark[];
  nextAppointmentCreated: boolean;
  createdAt: string;
}

export interface PlannedTreatmentItem {
  id: string;
  patientId: string;
  tooth?: number;
  surfaces?: ToothSurface[];
  procedure: string;
  status: "Planejado" | "Em tratamento" | "Concluído";
  origin: "Odontograma" | "Prontuário" | "Manual";
  clinicalEvolutionId?: string;
  createdAt: string;
  completedAt?: string;
}
