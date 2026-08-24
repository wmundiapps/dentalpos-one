export type CEOArea =
  | "Financeiro"
  | "Comercial"
  | "Clínico"
  | "Agenda"
  | "RH"
  | "Estoque"
  | "Laboratório"
  | "Fiscal"
  | "Marketing"
  | "Qualidade";

export type CEOPriority =
  | "Crítica"
  | "Alta"
  | "Média"
  | "Baixa";

export type CEOTrend =
  | "Crescimento"
  | "Estável"
  | "Queda";

export type CEOAlertStatus =
  | "Aberto"
  | "Em andamento"
  | "Resolvido"
  | "Ignorado";

export type CEOForecastType =
  | "Faturamento"
  | "Lucro"
  | "Fluxo de caixa"
  | "Impostos"
  | "Folha"
  | "Estoque";

export interface CEOSummary {
  greeting: string;
  dateLabel: string;
  clinicName: string;
  generalScore: number;
  previousScore: number;
  healthLevel:
    | "Excelente"
    | "Bom"
    | "Atenção"
    | "Crítico";
  executiveMessage: string;
  generatedAt: string;
}

export interface CEOAreaScore {
  id: number;
  area: CEOArea;
  score: number;
  target: number;
  variation: number;
  trend: CEOTrend;
  description: string;
}

export interface CEOKPI {
  id: number;
  title: string;
  value: string;
  comparison: string;
  variation: number;
  trend: CEOTrend;
  area: CEOArea;
}

export interface CEOAlert {
  id: number;
  title: string;
  description: string;
  area: CEOArea;
  priority: CEOPriority;
  status: CEOAlertStatus;
  createdAt: string;
  financialImpact?: number;
  deadline?: string;
  responsible?: string;
}

export interface CEORecommendation {
  id: number;
  title: string;
  description: string;
  action: string;
  area: CEOArea;
  priority: CEOPriority;
  estimatedImpact: number;
  confidencePercent: number;
}

export interface CEOForecast {
  id: number;
  type: CEOForecastType;
  period: string;
  currentValue: number;
  projectedValue: number;
  variationPercent: number;
  confidencePercent: number;
}

export interface CEOMorningItem {
  id: number;
  title: string;
  description: string;
  area: CEOArea;
  priority: CEOPriority;
  completed: boolean;
}

export interface CEOQuestionSuggestion {
  id: number;
  question: string;
  category: string;
}