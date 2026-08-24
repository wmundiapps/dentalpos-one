export type AppointmentStatus =
  | "Agendado"
  | "Confirmado"
  | "Aguardando"
  | "Sala em preparação"
  | "Em atendimento"
  | "Finalizado"
  | "Cancelado"
  | "Faltou";

export interface Appointment {
  id: number;
  patientName: string;
  professionalName: string;
  procedure: string;
  date: string;
  time: string;
  room: string;
  status: AppointmentStatus;
}