export type ClinicHealthLevel =
  | "Excelente"
  | "Bom"
  | "Atenção"
  | "Crítico";

export interface ClinicHealthIndicator {
  id: number;
  title: string;
  module: string;
  score: number;
  weight: number;
  description: string;
  recommendation: string;
}

export interface ClinicHealthHistory {
  date: string;
  score: number;
}

export interface ClinicHealthSummary {
  score: number;
  level: ClinicHealthLevel;
  variation: number;
  calculatedAt: string;
}