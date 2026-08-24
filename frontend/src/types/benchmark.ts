export type BenchmarkPerformance =
  | "Muito acima da média"
  | "Acima da média"
  | "Na média"
  | "Abaixo da média"
  | "Muito abaixo da média";

export interface BenchmarkIndicator {
  id: number;
  title: string;
  module: string;
  clinicValue: number;
  marketAverage: number;
  topPerformersAverage: number;
  unit: string;
  higherIsBetter: boolean;
  description: string;
  recommendation: string;
}

export interface BenchmarkPosition {
  percentile: number;
  comparedClinics: number;
  similarClinics: number;
  region: string;
  clinicSize: string;
  specialtyProfile: string;
}

export interface BenchmarkEvolution {
  period: string;
  clinicScore: number;
  marketScore: number;
}