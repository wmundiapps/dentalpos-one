export type ClinicalRecordStatus =
  | "Em avaliação"
  | "Em planejamento"
  | "Em tratamento"
  | "Finalizado";

export interface ClinicalPhoto {
  id: number;
  title: string;
  category:
    | "Inicial"
    | "Intraoral"
    | "Extraoral"
    | "Radiografia"
    | "Planejamento"
    | "Antes e depois";
  imageUrl: string;
  createdAt: string;
}

export interface ClinicalEvolution {
  id: number;
  date: string;
  professionalName: string;
  procedure: string;
  description: string;
}

export interface ClinicalRecord {
  id: number;
  patientName: string;
  patientCode: string;
  professionalName: string;
  mainComplaint: string;
  diagnosis: string;
  treatmentPlan: string;
  allergies: string[];
  medications: string[];
  status: ClinicalRecordStatus;
  photos: ClinicalPhoto[];
  evolutions: ClinicalEvolution[];
}