export interface AIAgent {
  id: string;
  nome: string;
  descricao: string;
  ativo: boolean;
}

export const agents: AIAgent[] = [
  {
    id: "clinical",
    nome: "IA Clínica",
    descricao: "Auxilia no planejamento e acompanhamento clínico.",
    ativo: true,
  },
  {
    id: "commercial",
    nome: "IA Comercial",
    descricao: "CRM, funil de vendas e relacionamento.",
    ativo: true,
  },
  {
    id: "financial",
    nome: "IA Financeira",
    descricao: "Fluxo de caixa, DRE e indicadores.",
    ativo: true,
  },
  {
    id: "marketing",
    nome: "IA Marketing",
    descricao: "Campanhas, redes sociais e automações.",
    ativo: true,
  },
  {
    id: "laboratory",
    nome: "IA Laboratório",
    descricao: "Fluxo CAD/CAM e produção protética.",
    ativo: true,
  },
];