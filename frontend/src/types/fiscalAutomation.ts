export type FiscalIssuerType =
  | "Dentista Pessoa Física"
  | "Clínica Pessoa Jurídica";

export type FiscalDocumentKind =
  | "Recibo preliminar"
  | "Receita Saúde"
  | "NFS-e"
  | "Nota fiscal de produto"
  | "Sem definição";

export type FiscalAutomationStatus =
  | "Pagamento pendente"
  | "Pagamento confirmado"
  | "Documento aguardando emissão"
  | "Aguardando Receita Saúde"
  | "Nota programada"
  | "Documento emitido"
  | "Documento enviado"
  | "Documento entregue"
  | "Falha na emissão"
  | "Cancelamento solicitado"
  | "Fiscalmente concluído";

export type FiscalSendChannel =
  | "E-mail"
  | "WhatsApp"
  | "SMS"
  | "Telegram"
  | "Portal do paciente";

export type FiscalSendStatus =
  | "Não enviado"
  | "Programado"
  | "Enviado"
  | "Entregue"
  | "Lido"
  | "Falhou";

export type FiscalPriority =
  | "Baixa"
  | "Média"
  | "Alta"
  | "Crítica";

export interface FiscalPayer {
  name: string;
  document: string;
  email?: string;
  phone?: string;
  telegramUser?: string;
}

export interface FiscalPatient {
  name: string;
  document: string;
}

export interface FiscalPayment {
  id: number;
  paymentCode: string;
  treatmentReference: string;
  issuerType: FiscalIssuerType;
  issuerName: string;
  issuerDocument: string;
  payer: FiscalPayer;
  patient: FiscalPatient;
  paymentDate: string;
  competence: string;
  grossValue: number;
  discountValue: number;
  receivedValue: number;
  paymentMethod:
    | "PIX"
    | "Cartão"
    | "Boleto"
    | "Transferência"
    | "Dinheiro";
  installmentNumber: number;
  totalInstallments: number;
  fiscalDocumentKind: FiscalDocumentKind;
  status: FiscalAutomationStatus;
  issueScheduledAt?: string;
  documentNumber?: string;
  protocolNumber?: string;
  documentUrl?: string;
  accountantApprovalRequired: boolean;
  accountantApproved: boolean;
  notes?: string;
}

export interface FiscalSendRecord {
  id: number;
  fiscalPaymentId: number;
  recipientName: string;
  channel: FiscalSendChannel;
  destination: string;
  status: FiscalSendStatus;
  scheduledAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failureReason?: string;
}

export interface FiscalAlert {
  id: number;
  fiscalPaymentId: number;
  title: string;
  description: string;
  priority: FiscalPriority;
  createdAt: string;
  resolved: boolean;
}

export interface FiscalAutomationSummary {
  confirmedPayments: number;
  pendingDocuments: number;
  issuedDocuments: number;
  deliveryFailures: number;
  pendingTaxValue: number;
}