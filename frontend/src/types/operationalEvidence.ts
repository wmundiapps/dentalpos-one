export type EvidenceRequirement =
  | "Nenhuma"
  | "Foto"
  | "Foto e assinatura";

export interface OperationalEvidence {
  id: number;
  taskId: number;
  userId: number;
  userName: string;
  unitName: string;
  photoUrl: string;
  observation: string;
  signedBy?: string;
  createdAt: string;
}