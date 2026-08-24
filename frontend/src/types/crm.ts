export type CRMStatus =
  | "Novo Lead"
  | "Contato"
  | "Avaliação"
  | "Orçamento"
  | "Negociação"
  | "Fechado"
  | "Perdido";

export interface CRMLead {
  id: number;

  nome: string;

  telefone: string;

  origem: string;

  procedimento: string;

  responsavel: string;

  status: CRMStatus;

  ultimaAtualizacao: string;

  observacoes: string;

  valorEstimado: number;
}