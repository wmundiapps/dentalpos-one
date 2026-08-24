export type RecallStatus =
  | "Programado"
  | "Contato pendente"
  | "Mensagem enviada"
  | "Agendado"
  | "Sem resposta"
  | "Recusado";

export type RecallPeriod =
  | "1 mês"
  | "2 meses"
  | "3 meses"
  | "4 meses"
  | "5 meses"
  | "6 meses"
  | "1 ano";

export interface PatientRecall {
  id: number;
  patientName: string;
  patientCode: string;
  phone: string;
  professionalName: string;
  treatment: string;
  lastAppointment: string;
  nextContactDate: string;
  period: RecallPeriod;
  status: RecallStatus;
  automaticMessage: boolean;
  notes?: string;
}