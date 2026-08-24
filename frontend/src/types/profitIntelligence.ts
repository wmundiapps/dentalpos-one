export type ProfitabilityLevel =
  | "Excelente"
  | "Saudável"
  | "Atenção"
  | "Prejuízo";

export type FinancialInsightPriority =
  | "Crítica"
  | "Alta"
  | "Média"
  | "Baixa";

export interface ProcedureCostStructure {
  materialCost: number;
  laboratoryCost: number;
  medicationCost: number;
  sterilizationCost: number;
  financialFeePercent: number;
  taxPercent: number;
  professionalCommissionPercent: number;
  warrantyReservePercent: number;
  marketingAllocation: number;
  administrativeAllocation: number;
  roomHourlyCost: number;
}

export interface ProcedureProfitability {
  id: number;
  name: string;
  specialty: string;
  averagePrice: number;
  numberOfSessions: number;
  minutesPerSession: number;
  monthlyQuantity: number;
  costs: ProcedureCostStructure;
  minimumMarginPercent: number;
  targetMarginPercent: number;
}

export interface ProcedurePricingResult {
  procedureId: number;
  procedureName: string;
  totalClinicalHours: number;
  directCost: number;
  roomCost: number;
  percentageCosts: number;
  totalEstimatedCost: number;
  minimumPrice: number;
  idealPrice: number;
  premiumPrice: number;
  currentProfit: number;
  currentMarginPercent: number;
  level: ProfitabilityLevel;
}

export interface ProfessionalProfitability {
  id: number;
  professionalName: string;
  specialty: string;
  grossRevenue: number;
  materialCost: number;
  laboratoryCost: number;
  commissionValue: number;
  taxAllocation: number;
  fixedCostAllocation: number;
  workedHours: number;
  appointments: number;
  reworkValue: number;
}

export interface RoomProfitability {
  id: number;
  roomName: string;
  availableHours: number;
  occupiedHours: number;
  grossRevenue: number;
  variableCosts: number;
  fixedCostAllocation: number;
}

export interface ProfitScenario {
  id: number;
  title: string;
  description: string;
  currentMonthlyProfit: number;
  projectedMonthlyProfit: number;
  investmentRequired: number;
  paybackMonths?: number;
}

export interface FinancialInsight {
  id: number;
  title: string;
  description: string;
  recommendation: string;
  priority: FinancialInsightPriority;
  estimatedImpact: number;
  module: string;
}