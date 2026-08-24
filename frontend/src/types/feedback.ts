export type FeedbackType =
  | "Sugestão"
  | "Bug"
  | "Problema"
  | "Dúvida"
  | "Melhoria";

export type FeedbackPriority =
  | "Baixa"
  | "Média"
  | "Alta"
  | "Crítica";

export type FeedbackStatus =
  | "Enviado"
  | "Em análise"
  | "Em desenvolvimento"
  | "Resolvido"
  | "Arquivado";

export interface UserFeedback {
  id: number;
  type: FeedbackType;
  title: string;
  description: string;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  userName: string;
  userEmail: string;
  module: string;
  createdAt: string;
  attachmentName?: string;
}