export type EvaluationChannel =
  | "WhatsApp"
  | "SMS"
  | "E-mail"
  | "Link"
  | "QR Code"
  | "Terminal da clínica";

export type EvaluationStatus =
  | "Pendente"
  | "Enviada"
  | "Respondida"
  | "Expirada";

export interface ServiceEvaluation {
  id: number;
  patientName: string;
  patientCode: string;
  professionalName: string;
  appointmentDate: string;
  procedure: string;
  channel: EvaluationChannel;
  status: EvaluationStatus;
  professionalScore?: number;
  clinicPresentationScore?: number;
  procedureScore?: number;
  serviceScore?: number;
  npsScore?: number;
  comments?: string;
  sentAt?: string;
  answeredAt?: string;
  anonymous: boolean;
}