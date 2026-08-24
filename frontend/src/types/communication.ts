export type CommunicationChannel =
  | "WhatsApp"
  | "SMS"
  | "E-mail"
  | "Telegram"
  | "Instagram"
  | "Facebook";

export type CommunicationStatus =
  | "Rascunho"
  | "Agendada"
  | "Enviada"
  | "Entregue"
  | "Lida"
  | "Falhou";

export interface CommunicationMessage {
  id: number;
  recipientName: string;
  recipientContact: string;
  channel: CommunicationChannel;
  subject: string;
  message: string;
  status: CommunicationStatus;
  scheduledAt?: string;
  sentAt?: string;
  campaignName?: string;
}