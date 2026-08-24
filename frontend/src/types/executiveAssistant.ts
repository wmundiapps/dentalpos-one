export type ExecutiveAlertPriority =
  | "Crítica"
  | "Alta"
  | "Média"
  | "Baixa";

export interface ExecutiveAlert {
  id: number;
  title: string;
  description: string;
  recommendation: string;
  priority: ExecutiveAlertPriority;
  module: string;
}

export interface ExecutiveSummary {
  greeting: string;
  clinicStatus: string;
  confirmedPatients: number;
  pendingBudgets: number;
  pendingBudgetValue: number;
  criticalStockItems: number;
  overdueLaboratoryWorks: number;
  overdueReceivables: number;
}