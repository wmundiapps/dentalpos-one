export type FinancialEntryType =
  | "Receita"
  | "Despesa";

export type FinancialEntryStatus =
  | "Pendente"
  | "Pago"
  | "Vencido"
  | "Cancelado";

export interface FinancialEntry {
  id: number;
  description: string;
  category: string;
  personName: string;
  type: FinancialEntryType;
  status: FinancialEntryStatus;
  value: number;
  dueDate: string;
  paymentMethod?: string;
}