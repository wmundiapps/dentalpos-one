export type LegalEntityType =
  | "Pessoa Física"
  | "Pessoa Jurídica";

export type AccountingEntryType =
  | "Receita"
  | "Despesa"
  | "Transferência"
  | "Imposto"
  | "Pró-labore"
  | "Distribuição de lucros";

export type AccountingEntryStatus =
  | "Pendente"
  | "Conciliado"
  | "Pago"
  | "Recebido"
  | "Vencido"
  | "Cancelado";

export type FiscalDocumentType =
  | "Recibo"
  | "NFS-e"
  | "NF-e"
  | "Nota de débito"
  | "Comprovante"
  | "Folha de pagamento"
  | "Guia tributária"
  | "Sem documento";

export type TaxRegime =
  | "Simples Nacional"
  | "Lucro Presumido"
  | "Lucro Real"
  | "Pessoa Física";

export type TaxObligationStatus =
  | "A calcular"
  | "Em conferência"
  | "Aguardando aprovação"
  | "Programada"
  | "Transmitida"
  | "Paga"
  | "Vencida";

export type BankReconciliationStatus =
  | "Não identificado"
  | "Sugestão encontrada"
  | "Conciliado"
  | "Ignorado";

export interface ChartOfAccount {
  id: number;
  code: string;
  name: string;
  group:
    | "Ativo"
    | "Passivo"
    | "Patrimônio Líquido"
    | "Receita"
    | "Despesa"
    | "Custo";
  parentCode?: string;
  active: boolean;
}

export interface AccountingEntry {
  id: number;
  description: string;
  legalEntity: LegalEntityType;
  personName: string;
  documentNumber?: string;
  documentType: FiscalDocumentType;
  entryType: AccountingEntryType;
  accountCode: string;
  accountName: string;
  costCenter: string;
  competenceDate: string;
  dueDate: string;
  paymentDate?: string;
  grossValue: number;
  taxWithheld: number;
  netValue: number;
  status: AccountingEntryStatus;
  bankAccount?: string;
  notes?: string;
}

export interface BankTransaction {
  id: number;
  bankName: string;
  accountName: string;
  transactionDate: string;
  description: string;
  documentNumber?: string;
  value: number;
  transactionType: "Crédito" | "Débito";
  reconciliationStatus: BankReconciliationStatus;
  suggestedEntryId?: number;
}

export interface TaxObligation {
  id: number;
  name: string;
  entityName: string;
  legalEntity: LegalEntityType;
  regime: TaxRegime;
  competence: string;
  dueDate: string;
  estimatedValue: number;
  status: TaxObligationStatus;
  responsible: string;
  requiresAccountantApproval: boolean;
}

export interface TaxRegimeSimulation {
  regime: TaxRegime;
  estimatedMonthlyTax: number;
  estimatedAnnualTax: number;
  effectiveRate: number;
  complianceCost: number;
  projectedNetResult: number;
  advantages: string[];
  attentionPoints: string[];
  recommended: boolean;
}

export interface AccountingSummary {
  totalRevenue: number;
  totalExpenses: number;
  totalTaxes: number;
  netCashFlow: number;
  unreconciledTransactions: number;
  pendingObligations: number;
}