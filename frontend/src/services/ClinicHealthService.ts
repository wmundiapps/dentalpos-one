import type {
  ClinicHealthHistory,
  ClinicHealthIndicator,
  ClinicHealthLevel,
  ClinicHealthSummary,
} from "../types/clinicHealth";

export const clinicHealthIndicators: ClinicHealthIndicator[] = [
  {
    id: 1,
    title: "Ocupação da agenda",
    module: "Agenda",
    score: 86,
    weight: 12,
    description:
      "A agenda está com boa ocupação, mas ainda existem horários ociosos no período da tarde.",
    recommendation:
      "Criar campanhas para preencher horários com menor procura.",
  },
  {
    id: 2,
    title: "Conversão de orçamentos",
    module: "CRM",
    score: 62,
    weight: 15,
    description:
      "A maior perda ocorre entre a apresentação do orçamento e a aprovação.",
    recommendation:
      "Reforçar follow-up, parcelamento e apresentação do plano essencial.",
  },
  {
    id: 3,
    title: "Fluxo financeiro",
    module: "Financeiro",
    score: 78,
    weight: 15,
    description:
      "O saldo previsto é positivo, mas existem recebimentos vencidos.",
    recommendation:
      "Iniciar cobrança automática e acompanhar os recebimentos diariamente.",
  },
  {
    id: 4,
    title: "Inadimplência",
    module: "Financeiro",
    score: 71,
    weight: 10,
    description:
      "A inadimplência está acima da meta definida pela clínica.",
    recommendation:
      "Aplicar lembretes preventivos antes do vencimento.",
  },
  {
    id: 5,
    title: "Prazo do laboratório",
    module: "Laboratório",
    score: 68,
    weight: 10,
    description:
      "O tempo médio de produção aumentou nos últimos dias.",
    recommendation:
      "Redistribuir trabalhos e revisar os prazos internos.",
  },
  {
    id: 6,
    title: "Estoque e abastecimento",
    module: "Estoque",
    score: 74,
    weight: 10,
    description:
      "Existem itens abaixo do estoque mínimo.",
    recommendation:
      "Gerar pedido de compra e revisar os níveis mínimos.",
  },
  {
    id: 7,
    title: "Satisfação dos pacientes",
    module: "Avaliação do Atendimento",
    score: 94,
    weight: 12,
    description:
      "As notas dos pacientes e o NPS estão em nível excelente.",
    recommendation:
      "Solicitar avaliações no Google aos pacientes promotores.",
  },
  {
    id: 8,
    title: "Biossegurança e POPs",
    module: "Gestão Operacional",
    score: 91,
    weight: 10,
    description:
      "As tarefas críticas estão sendo cumpridas com evidências.",
    recommendation:
      "Manter auditoria semanal e treinamento dos novos funcionários.",
  },
  {
    id: 9,
    title: "Taxa de faltas",
    module: "Agenda",
    score: 82,
    weight: 6,
    description:
      "As confirmações automáticas reduziram as ausências.",
    recommendation:
      "Manter confirmações pelo WhatsApp e lembrete no dia da consulta.",
  },
];

export const clinicHealthHistory: ClinicHealthHistory[] = [
  {
    date: "27/07",
    score: 742,
  },
  {
    date: "28/07",
    score: 758,
  },
  {
    date: "29/07",
    score: 771,
  },
  {
    date: "30/07",
    score: 785,
  },
  {
    date: "31/07",
    score: 798,
  },
  {
    date: "01/08",
    score: 812,
  },
  {
    date: "02/08",
    score: 826,
  },
];

export function calculateClinicHealthScore(): number {
  const totalWeight = clinicHealthIndicators.reduce(
    (total, indicator) => total + indicator.weight,
    0,
  );

  if (totalWeight === 0) {
    return 0;
  }

  const weightedScore = clinicHealthIndicators.reduce(
    (total, indicator) =>
      total + indicator.score * indicator.weight,
    0,
  );

  return Math.round((weightedScore / totalWeight) * 10);
}

export function getClinicHealthLevel(
  score: number,
): ClinicHealthLevel {
  if (score >= 850) {
    return "Excelente";
  }

  if (score >= 750) {
    return "Bom";
  }

  if (score >= 650) {
    return "Atenção";
  }

  return "Crítico";
}

export function getClinicHealthSummary(): ClinicHealthSummary {
  const score = calculateClinicHealthScore();

  const previousScore =
    clinicHealthHistory.at(-2)?.score ?? score;

  return {
    score,
    level: getClinicHealthLevel(score),
    variation: score - previousScore,
    calculatedAt: "Hoje, 15:30",
  };
}