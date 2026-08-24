import type { EvidenceRequirement } from "./operationalEvidence";

export type OperationalTaskStatus =
  | "Pendente"
  | "Em execução"
  | "Aguardando evidência"
  | "Concluída"
  | "Reprovada";

export type OperationalTaskPriority =
  | "Baixa"
  | "Média"
  | "Alta"
  | "Crítica";

export interface OperationalTask {
  id: number;
  title: string;
  description: string;
  sector: string;
  responsible: string;
  priority: OperationalTaskPriority;
  status: OperationalTaskStatus;
  evidenceRequirement: EvidenceRequirement;
  dueAt: string;
}