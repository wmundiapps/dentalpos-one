export type PatientStatus =
  | "Novo"
  | "Triagem"
  | "Consulta"
  | "Planejamento"
  | "Orçamento"
  | "Aprovado"
  | "Em Tratamento"
  | "Finalizado"
  | "Recall";

export interface Patient {
  id: number;
  nome: string;
  telefone: string;
  email: string;
  nascimento: string;
  cpf: string;
  convenio?: string;
  status: PatientStatus;
}