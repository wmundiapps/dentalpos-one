import type {
  CEOAlert,
  CEOAreaScore,
  CEOForecast,
  CEOKPI,
  CEOMorningItem,
  CEOQuestionSuggestion,
  CEORecommendation,
  CEOSummary,
} from "../types/ceo";

export const ceoSummary: CEOSummary = {
  greeting: "Boa tarde, Dr. Robson.",
  dateLabel: "02 de agosto de 2026",
  clinicName: "DentalPos Clinical Group",
  generalScore: 826,
  previousScore: 812,
  healthLevel: "Bom",
  executiveMessage:
    "A operação apresenta crescimento consistente. As prioridades atuais são conversão comercial, ocupação do Consultório 4 e pendências fiscais.",
  generatedAt: "Hoje, 16:30",
};

export const ceoAreaScores: CEOAreaScore[] = [
  {
    id: 1,
    area: "Financeiro",
    score: 88,
    target: 90,
    variation: 4,
    trend: "Crescimento",
    description:
      "O caixa está positivo, mas existem recebimentos vencidos e despesas concentradas nos próximos dias.",
  },
  {
    id: 2,
    area: "Comercial",
    score: 68,
    target: 85,
    variation: -3,
    trend: "Queda",
    description:
      "A conversão de orçamentos permanece abaixo da meta estabelecida.",
  },
  {
    id: 3,
    area: "Clínico",
    score: 93,
    target: 90,
    variation: 2,
    trend: "Crescimento",
    description:
      "Boa produtividade clínica, satisfação elevada e baixa ocorrência de retrabalho.",
  },
  {
    id: 4,
    area: "Agenda",
    score: 82,
    target: 88,
    variation: 5,
    trend: "Crescimento",
    description:
      "As confirmações reduziram as faltas, mas ainda existem períodos com ociosidade.",
  },
  {
    id: 5,
    area: "RH",
    score: 86,
    target: 90,
    variation: 1,
    trend: "Estável",
    description:
      "Quadro estável, com atenção para contratos de experiência e programação de férias.",
  },
  {
    id: 6,
    area: "Estoque",
    score: 72,
    target: 90,
    variation: -6,
    trend: "Queda",
    description:
      "Dois componentes atingiram o estoque mínimo e há materiais com baixo giro.",
  },
  {
    id: 7,
    area: "Laboratório",
    score: 76,
    target: 88,
    variation: -4,
    trend: "Queda",
    description:
      "O prazo médio de produção aumentou e existe um trabalho em atraso.",
  },
  {
    id: 8,
    area: "Fiscal",
    score: 91,
    target: 95,
    variation: 3,
    trend: "Crescimento",
    description:
      "Obrigações estão controladas, mas existem documentos fiscais aguardando emissão.",
  },
  {
    id: 9,
    area: "Marketing",
    score: 79,
    target: 85,
    variation: 7,
    trend: "Crescimento",
    description:
      "Campanhas estão gerando leads, embora o custo de aquisição ainda possa melhorar.",
  },
  {
    id: 10,
    area: "Qualidade",
    score: 95,
    target: 92,
    variation: 2,
    trend: "Crescimento",
    description:
      "NPS, avaliações e cumprimento dos procedimentos operacionais estão excelentes.",
  },
];

export const ceoKPIs: CEOKPI[] = [
  {
    id: 1,
    title: "Faturamento mensal",
    value: "R$ 412.800",
    comparison: "Comparado ao mês anterior",
    variation: 14,
    trend: "Crescimento",
    area: "Financeiro",
  },
  {
    id: 2,
    title: "Lucro líquido estimado",
    value: "R$ 86.400",
    comparison: "Margem líquida de 20,9%",
    variation: 9,
    trend: "Crescimento",
    area: "Financeiro",
  },
  {
    id: 3,
    title: "Conversão comercial",
    value: "37%",
    comparison: "Meta definida em 50%",
    variation: -5,
    trend: "Queda",
    area: "Comercial",
  },
  {
    id: 4,
    title: "Ocupação da agenda",
    value: "84%",
    comparison: "Média dos últimos 30 dias",
    variation: 6,
    trend: "Crescimento",
    area: "Agenda",
  },
  {
    id: 5,
    title: "Taxa de faltas",
    value: "8,4%",
    comparison: "Redução em relação ao período anterior",
    variation: -18,
    trend: "Crescimento",
    area: "Agenda",
  },
  {
    id: 6,
    title: "NPS dos pacientes",
    value: "92",
    comparison: "Zona de excelência",
    variation: 3,
    trend: "Crescimento",
    area: "Qualidade",
  },
  {
    id: 7,
    title: "Orçamentos em aberto",
    value: "R$ 184.500",
    comparison: "23 propostas aguardando retorno",
    variation: 11,
    trend: "Estável",
    area: "Comercial",
  },
  {
    id: 8,
    title: "Capital disponível",
    value: "R$ 128.300",
    comparison: "Caixa e reservas de curto prazo",
    variation: 7,
    trend: "Crescimento",
    area: "Financeiro",
  },
];

export const ceoAlerts: CEOAlert[] = [
  {
    id: 1,
    title: "Conversão abaixo da meta",
    description:
      "A clínica está convertendo 37% dos orçamentos, enquanto a meta interna é de 50%.",
    area: "Comercial",
    priority: "Crítica",
    status: "Aberto",
    createdAt: "Hoje, 08:15",
    financialImpact: 68000,
    deadline: "05/08/2026",
    responsible: "Equipe Comercial",
  },
  {
    id: 2,
    title: "Consultório 4 com alta ociosidade",
    description:
      "A ocupação do Consultório 4 está abaixo de 40% e não cobre adequadamente o custo fixo.",
    area: "Agenda",
    priority: "Alta",
    status: "Em andamento",
    createdAt: "Hoje, 09:10",
    financialImpact: 11800,
    deadline: "10/08/2026",
    responsible: "Coordenação Clínica",
  },
  {
    id: 3,
    title: "Estoque crítico de componentes",
    description:
      "Dois produtos possuem quantidade suficiente para menos de dez dias.",
    area: "Estoque",
    priority: "Alta",
    status: "Aberto",
    createdAt: "Hoje, 10:40",
    financialImpact: 9200,
    deadline: "04/08/2026",
    responsible: "Compras",
  },
  {
    id: 4,
    title: "Trabalho laboratorial atrasado",
    description:
      "Um guia cirúrgico ultrapassou o prazo e poderá afetar o atendimento agendado.",
    area: "Laboratório",
    priority: "Alta",
    status: "Aberto",
    createdAt: "Hoje, 11:05",
    financialImpact: 4800,
    deadline: "03/08/2026",
    responsible: "Laboratório",
  },
  {
    id: 5,
    title: "Receita Saúde pendente",
    description:
      "Um pagamento recebido por profissional pessoa física ainda não possui protocolo fiscal registrado.",
    area: "Fiscal",
    priority: "Média",
    status: "Aberto",
    createdAt: "Hoje, 14:00",
    financialImpact: 450,
    deadline: "03/08/2026",
    responsible: "Financeiro",
  },
];

export const ceoRecommendations: CEORecommendation[] = [
  {
    id: 1,
    title: "Reativar orçamentos de maior potencial",
    description:
      "Existem seis propostas acima de R$ 10 mil sem contato registrado nas últimas 72 horas.",
    action:
      "Criar uma sequência de ligação, WhatsApp e nova simulação de pagamento.",
    area: "Comercial",
    priority: "Crítica",
    estimatedImpact: 54000,
    confidencePercent: 86,
  },
  {
    id: 2,
    title: "Preencher horários ociosos",
    description:
      "O Consultório 4 possui disponibilidade para avaliações, clínica geral e profissionais parceiros.",
    action:
      "Abrir horários promocionais e oferecer locação por turno para profissionais selecionados.",
    area: "Agenda",
    priority: "Alta",
    estimatedImpact: 11800,
    confidencePercent: 81,
  },
  {
    id: 3,
    title: "Revisar preço do clareamento",
    description:
      "O procedimento apresenta margem inferior ao mínimo após considerar três sessões e custos indiretos.",
    action:
      "Reajustar o preço ou reduzir uma sessão presencial mantendo o acompanhamento remoto.",
    area: "Financeiro",
    priority: "Alta",
    estimatedImpact: 5800,
    confidencePercent: 91,
  },
  {
    id: 4,
    title: "Solicitar avaliações públicas",
    description:
      "Dezoito pacientes promotores ainda não receberam convite para avaliação no Google.",
    action:
      "Enviar automaticamente o convite aos pacientes com nota 9 ou 10.",
    area: "Qualidade",
    priority: "Baixa",
    estimatedImpact: 3500,
    confidencePercent: 78,
  },
];

export const ceoForecasts: CEOForecast[] = [
  {
    id: 1,
    type: "Faturamento",
    period: "Agosto de 2026",
    currentValue: 412800,
    projectedValue: 448000,
    variationPercent: 8.53,
    confidencePercent: 84,
  },
  {
    id: 2,
    type: "Lucro",
    period: "Agosto de 2026",
    currentValue: 86400,
    projectedValue: 98200,
    variationPercent: 13.66,
    confidencePercent: 79,
  },
  {
    id: 3,
    type: "Fluxo de caixa",
    period: "Próximos 30 dias",
    currentValue: 128300,
    projectedValue: 146800,
    variationPercent: 14.42,
    confidencePercent: 82,
  },
  {
    id: 4,
    type: "Impostos",
    period: "Agosto de 2026",
    currentValue: 60400,
    projectedValue: 63900,
    variationPercent: 5.79,
    confidencePercent: 88,
  },
  {
    id: 5,
    type: "Folha",
    period: "Agosto de 2026",
    currentValue: 28280,
    projectedValue: 29100,
    variationPercent: 2.9,
    confidencePercent: 94,
  },
  {
    id: 6,
    type: "Estoque",
    period: "Próximos 30 dias",
    currentValue: 78600,
    projectedValue: 72400,
    variationPercent: -7.89,
    confidencePercent: 76,
  },
];

export const ceoMorningItems: CEOMorningItem[] = [
  {
    id: 1,
    title: "Confirmar pagamento de entrada",
    description:
      "Paciente Maria Oliveira aguarda confirmação financeira para agendamento cirúrgico.",
    area: "Financeiro",
    priority: "Alta",
    completed: false,
  },
  {
    id: 2,
    title: "Resolver atraso laboratorial",
    description:
      "O guia cirúrgico do paciente João Ribeiro precisa ser liberado hoje.",
    area: "Laboratório",
    priority: "Crítica",
    completed: false,
  },
  {
    id: 3,
    title: "Repor componentes críticos",
    description:
      "Mini Pilar CM 3,5 e componente W48 atingiram o ponto de reposição.",
    area: "Estoque",
    priority: "Alta",
    completed: false,
  },
  {
    id: 4,
    title: "Conferir documento fiscal",
    description:
      "Existe um recibo de Receita Saúde aguardando protocolo.",
    area: "Fiscal",
    priority: "Média",
    completed: false,
  },
  {
    id: 5,
    title: "Solicitar avaliações no Google",
    description:
      "Dezoito pacientes promotores estão aptos a receber o convite.",
    area: "Qualidade",
    priority: "Baixa",
    completed: false,
  },
];

export const ceoQuestionSuggestions: CEOQuestionSuggestion[] = [
  {
    id: 1,
    question:
      "Quanto posso investir este mês sem comprometer o fluxo de caixa?",
    category: "Financeiro",
  },
  {
    id: 2,
    question:
      "Qual especialidade apresenta a melhor margem líquida?",
    category: "Rentabilidade",
  },
  {
    id: 3,
    question:
      "Quais pacientes possuem maior probabilidade de aprovar o orçamento?",
    category: "Comercial",
  },
  {
    id: 4,
    question:
      "A clínica está preparada para abrir uma nova unidade?",
    category: "Expansão",
  },
  {
    id: 5,
    question:
      "Vale mais a pena comprar, financiar ou alugar um scanner intraoral?",
    category: "Investimentos",
  },
];

export function formatCEOMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function calculateOpenCEOAlerts(): number {
  return ceoAlerts.filter(
    (alert) =>
      alert.status === "Aberto" ||
      alert.status === "Em andamento",
  ).length;
}

export function calculateCriticalCEOAlerts(): number {
  return ceoAlerts.filter(
    (alert) =>
      alert.priority === "Crítica" &&
      alert.status !== "Resolvido",
  ).length;
}

export function calculatePotentialImpact(): number {
  return ceoRecommendations.reduce(
    (total, recommendation) =>
      total + recommendation.estimatedImpact,
    0,
  );
}

export function calculateAverageAreaScore(): number {
  if (ceoAreaScores.length === 0) {
    return 0;
  }

  const total = ceoAreaScores.reduce(
    (sum, score) => sum + score.score,
    0,
  );

  return total / ceoAreaScores.length;
}