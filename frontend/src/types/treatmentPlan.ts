export type TreatmentPlanStatus =
  | "Em elaboração"
  | "Apresentado"
  | "Em negociação"
  | "Aprovado"
  | "Parcialmente aprovado"
  | "Recusado";

export type TreatmentItemStatus =
  | "Pendente"
  | "Aprovado"
  | "Recusado"
  | "Concluído";

export type TreatmentPriority =
  | "Urgente"
  | "Alta"
  | "Média"
  | "Baixa";

export interface TreatmentItem {
  id: number;
  phase: number;
  title: string;
  specialty: string;
  description: string;
  quantity: number;
  unitValue: number;
  priority: TreatmentPriority;
  status: TreatmentItemStatus;
  optional: boolean;
}

export interface PaymentSimulation {
  entryValue: number;
  installments: number;
  installmentValue: number;
  totalValue: number;
}

export interface TreatmentPlan {
  id: number;
  patientName: string;
  patientCode: string;
  professionalName: string;
  title: string;
  createdAt: string;
  validUntil: string;
  status: TreatmentPlanStatus;
  items: TreatmentItem[];
}