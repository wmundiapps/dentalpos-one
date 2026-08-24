export type JourneyStageStatus =
  | "Concluída"
  | "Em andamento"
  | "Pendente"
  | "Atrasada"
  | "Não aplicável";

export type JourneyRiskLevel =
  | "Normal"
  | "Atenção"
  | "Risco de perda";

export interface PatientJourneyStage {
  id: number;
  order: number;
  title: string;
  module: string;
  status: JourneyStageStatus;
  date?: string;
  responsible?: string;
  daysInStage: number;
  description: string;
}

export interface PatientJourney {
  id: number;
  patientName: string;
  patientCode: string;
  treatment: string;
  professionalName: string;
  origin: string;
  estimatedValue: number;
  approvedValue: number;
  currentStage: string;
  riskLevel: JourneyRiskLevel;
  lastInteraction: string;
  nextRecommendedAction: string;
  stages: PatientJourneyStage[];
}

export interface JourneyConversion {
  stage: string;
  patients: number;
  conversionRate: number;
}

export interface JourneyBottleneck {
  module: string;
  severity: number;
  description: string;
}