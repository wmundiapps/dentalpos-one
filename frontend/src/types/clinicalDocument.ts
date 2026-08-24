export type ClinicalDocumentType =
  | "Receita"
  | "Atestado"
  | "Declaração"
  | "Termo de consentimento"
  | "Contrato"
  | "Garantia"
  | "Encaminhamento"
  | "Solicitação de exame";

export type ClinicalDocumentStatus =
  | "Rascunho"
  | "Emitido"
  | "Assinado"
  | "Cancelado";

export interface ClinicalDocument {
  id: number;
  patientName: string;
  patientCode: string;
  professionalName: string;
  documentType: ClinicalDocumentType;
  title: string;
  content: string;
  issuedAt: string;
  status: ClinicalDocumentStatus;
  digitallySigned: boolean;
  sentToPatient: boolean;
}