import type { LaboratoryPriority, LaboratoryWorkStatus } from "./laboratory";
import type { AppointmentStatus } from "./appointment";

export interface LaboratoryWorkHistoryEvent {
  id: number;
  atISO: string;
  action: "Criado" | "Alterado" | "Status alterado" | "Enviado ao Design" | "Arquivo recebido";
  description: string;
}

export interface IntegratedLaboratoryWork {
  id: number;
  trackingCode: string;
  patientName: string;
  patientCode: string;
  dentistName: string;
  clinicName: string;
  workType: string;
  material: string;
  responsibleTechnician: string;
  entryDateISO: string;
  dueDateISO?: string;
  patientReturnDateISO?: string;
  nextAction?: string;
  status: LaboratoryWorkStatus;
  priority: LaboratoryPriority;
  hasCadCamFile: boolean;
  observations?: string;
  source: "Laboratório" | "DentalPos Design" | "Agenda";
  designJobId?: number;
  updatedAtISO: string;
  impressionType?: "Analógica" | "Digital";
  receivedItems?: string[];
  toothShade?: string;
  faceBiotype?: "Dolicocéfalo" | "Mesocéfalo" | "Braquicéfalo";
  faceShape?: "Ovoide" | "Quadrado" | "Triangular" | "Outro";
  faceDescription?: string;
  patientAge?: number;
  patientSex?: "Masculino" | "Feminino" | "Outro";
  teeth?: string;
  shadeSystem?: "VITA Classical" | "VITA 3D-Master" | "Bleach" | "Personalizada";
  shadeNotes?: string;
  designStatus?: "Não enviado" | "Preparando" | "Em desenho" | "Aguardando aprovação" | "Aprovado";
  upperScanFileName?: string;
  lowerScanFileName?: string;
  biteFileName?: string;
  history?: LaboratoryWorkHistoryEvent[];
}

export interface AppointmentHistoryEvent {
  id: number;
  atISO: string;
  action: "Criado" | "Remarcado" | "Cancelado" | "Faltou" | "Alterado";
  requestedBy?: "Paciente" | "Clínica" | "Dentista" | "Outro";
  reason?: string;
  previousDateISO?: string;
  previousTime?: string;
  newDateISO?: string;
  newTime?: string;
}

export interface IntegratedAppointment {
  id: number;
  patientName: string;
  patientPhone?: string;
  professionalName: string;
  procedure: string;
  nextProcedure: string;
  dateISO: string;
  time: string;
  room: string;
  status: AppointmentStatus;
  source: "Interno" | "Paciente" | "Marketing";
  category?: "1ª consulta" | "Em tratamento" | "Retorno" | "Pagamento" | "Periódico" | "Marketing" | "Indicação" | "Urgência" | "Outro";
  laboratoryWorkId?: number;
  reminders: {
    onBooking: boolean;
    oneDayBefore: boolean;
    onDay: boolean;
  };
  createdAtISO: string;
  history?: AppointmentHistoryEvent[];
}

export type OperationalAlertArea =
  | "Laboratório"
  | "Agenda"
  | "Financeiro"
  | "RH"
  | "Pacientes"
  | "Estoque";

export interface OperationalAlert {
  id: string;
  area: OperationalAlertArea;
  severity: "info" | "warning" | "error" | "success";
  title: string;
  description: string;
  dueISO?: string;
  route: string;
}
