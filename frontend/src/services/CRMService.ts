import type { CRMLead } from "../types/crm";

export const crmLeads: CRMLead[] = [
  {
    id: 1,
    nome: "João Silva",
    telefone: "(44)99999-1111",
    origem: "Instagram",
    procedimento: "Implante",
    responsavel: "Juliana",
    status: "Avaliação",
    ultimaAtualizacao: "Hoje",
    observacoes: "Paciente interessado em carga imediata.",
    valorEstimado: 7200,
  },

  {
    id: 2,
    nome: "Maria Souza",
    telefone: "(44)99999-2222",
    origem: "Google",
    procedimento: "Ortodontia",
    responsavel: "Fernanda",
    status: "Orçamento",
    ultimaAtualizacao: "Ontem",
    observacoes: "Solicitou parcelamento.",
    valorEstimado: 4900,
  },

  {
    id: 3,
    nome: "Carlos Lima",
    telefone: "(44)99999-3333",
    origem: "Indicação",
    procedimento: "Protocolo",
    responsavel: "Juliana",
    status: "Negociação",
    ultimaAtualizacao: "2 dias",
    observacoes: "Aguardando retorno.",
    valorEstimado: 28000,
  },
];