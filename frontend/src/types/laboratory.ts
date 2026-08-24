export type LaboratoryWorkStatus =
  | "Recebido"
  | "Triagem"
  | "Aguardando aprovação"
  | "Planejamento"
  | "CAD"
  | "CAM"
  | "Acabamento"
  | "Controle de qualidade"
  | "Liberado"
  | "Entregue"
  | "Refação"
  | "Atrasado";

export type LaboratoryPriority =
  | "Normal"
  | "Alta"
  | "Urgente";

export interface LaboratoryWork {
  id: number;
  trackingCode: string;
  patientCode: string;
  dentistName: string;
  clinicName: string;
  workType: string;
  material: string;
  responsibleTechnician: string;
  entryDate: string;
  dueDate: string;
  status: LaboratoryWorkStatus;
  priority: LaboratoryPriority;
  hasCadCamFile: boolean;
  observations?: string;
}