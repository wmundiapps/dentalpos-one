import type {
  BenchmarkEvolution,
  BenchmarkIndicator,
  BenchmarkPerformance,
  BenchmarkPosition,
} from "../types/benchmark";

export const benchmarkPosition: BenchmarkPosition = {
  percentile: 82,
  comparedClinics: 1248,
  similarClinics: 186,
  region: "Sul do Brasil",
  clinicSize: "Clínicas com 5 a 10 consultórios",
  specialtyProfile:
    "Implantodontia, Prótese, Ortodontia e HOF",
};

export const benchmarkIndicators: BenchmarkIndicator[] = [
  {
    id: 1,
    title: "Conversão de orçamentos",
    module: "CRM",
    clinicValue: 62,
    marketAverage: 54,
    topPerformersAverage: 71,
    unit: "%",
    higherIsBetter: true,
    description:
      "Percentual de orçamentos apresentados que foram aprovados.",
    recommendation:
      "A clínica está acima da média. Reforce o follow-up para alcançar o grupo de melhor desempenho.",
  },
  {
    id: 2,
    title: "Taxa de faltas",
    module: "Agenda",
    clinicValue: 11,
    marketAverage: 16,
    topPerformersAverage: 7,
    unit: "%",
    higherIsBetter: false,
    description:
      "Percentual de pacientes que não compareceram aos atendimentos agendados.",
    recommendation:
      "O desempenho está acima da média. Intensifique confirmações automáticas para aproximar-se das melhores clínicas.",
  },
  {
    id: 3,
    title: "Ocupação da agenda",
    module: "Agenda",
    clinicValue: 81,
    marketAverage: 73,
    topPerformersAverage: 89,
    unit: "%",
    higherIsBetter: true,
    description:
      "Percentual de horários disponíveis que foram efetivamente ocupados.",
    recommendation:
      "Existem oportunidades de preenchimento em horários de menor procura.",
  },
  {
    id: 4,
    title: "Prazo médio do laboratório",
    module: "Laboratório",
    clinicValue: 8.2,
    marketAverage: 6.4,
    topPerformersAverage: 4.9,
    unit: " dias",
    higherIsBetter: false,
    description:
      "Tempo médio entre a entrada do trabalho e a liberação para entrega.",
    recommendation:
      "O laboratório está abaixo da média. Revise gargalos de produção e distribuição de tarefas.",
  },
  {
    id: 5,
    title: "Inadimplência",
    module: "Financeiro",
    clinicValue: 14,
    marketAverage: 10,
    topPerformersAverage: 5,
    unit: "%",
    higherIsBetter: false,
    description:
      "Percentual de valores vencidos em relação ao total previsto para recebimento.",
    recommendation:
      "Implante cobrança preventiva, recorrência e análise de risco antes do parcelamento.",
  },
  {
    id: 6,
    title: "NPS dos pacientes",
    module: "Avaliação do Atendimento",
    clinicValue: 91,
    marketAverage: 76,
    topPerformersAverage: 93,
    unit: "",
    higherIsBetter: true,
    description:
      "Índice de recomendação dos pacientes após o atendimento.",
    recommendation:
      "Excelente resultado. Convide os pacientes promotores para avaliar a clínica no Google.",
  },
  {
    id: 7,
    title: "Receita por paciente ativo",
    module: "Financeiro",
    clinicValue: 1240,
    marketAverage: 980,
    topPerformersAverage: 1480,
    unit: " BRL",
    higherIsBetter: true,
    description:
      "Receita média mensal gerada por paciente ativo.",
    recommendation:
      "A clínica está acima da média. Avalie planos de continuidade e garantias estendidas.",
  },
  {
    id: 8,
    title: "Cumprimento de POPs",
    module: "Gestão Operacional",
    clinicValue: 94,
    marketAverage: 79,
    topPerformersAverage: 96,
    unit: "%",
    higherIsBetter: true,
    description:
      "Percentual de tarefas operacionais concluídas corretamente dentro do prazo.",
    recommendation:
      "Desempenho excelente. Mantenha auditorias e evidências fotográficas.",
  },
];

export const benchmarkEvolution: BenchmarkEvolution[] = [
  {
    period: "Mar",
    clinicScore: 68,
    marketScore: 65,
  },
  {
    period: "Abr",
    clinicScore: 71,
    marketScore: 66,
  },
  {
    period: "Mai",
    clinicScore: 74,
    marketScore: 66,
  },
  {
    period: "Jun",
    clinicScore: 77,
    marketScore: 67,
  },
  {
    period: "Jul",
    clinicScore: 80,
    marketScore: 68,
  },
  {
    period: "Ago",
    clinicScore: 82,
    marketScore: 68,
  },
];

export function calculateBenchmarkDifference(
  indicator: BenchmarkIndicator,
): number {
  return indicator.clinicValue - indicator.marketAverage;
}

export function getBenchmarkPerformance(
  indicator: BenchmarkIndicator,
): BenchmarkPerformance {
  const difference = calculateBenchmarkDifference(indicator);

  const adjustedDifference = indicator.higherIsBetter
    ? difference
    : difference * -1;

  const marketReference =
    Math.abs(indicator.marketAverage) || 1;

  const relativeDifference =
    (adjustedDifference / marketReference) * 100;

  if (relativeDifference >= 20) {
    return "Muito acima da média";
  }

  if (relativeDifference >= 5) {
    return "Acima da média";
  }

  if (relativeDifference > -5) {
    return "Na média";
  }

  if (relativeDifference > -20) {
    return "Abaixo da média";
  }

  return "Muito abaixo da média";
}

export function calculateBenchmarkScore(): number {
  const scores = benchmarkIndicators.map((indicator) => {
    const clinicValue = indicator.clinicValue;
    const marketValue = indicator.marketAverage;

    if (marketValue === 0) {
      return 50;
    }

    const ratio = indicator.higherIsBetter
      ? clinicValue / marketValue
      : marketValue / clinicValue;

    return Math.max(
      0,
      Math.min(100, Math.round(ratio * 70)),
    );
  });

  if (scores.length === 0) {
    return 0;
  }

  const total = scores.reduce(
    (sum, score) => sum + score,
    0,
  );

  return Math.round(total / scores.length);
}

export function countIndicatorsAboveAverage(): number {
  return benchmarkIndicators.filter((indicator) => {
    if (indicator.higherIsBetter) {
      return (
        indicator.clinicValue >
        indicator.marketAverage
      );
    }

    return (
      indicator.clinicValue <
      indicator.marketAverage
    );
  }).length;
}

export function countIndicatorsBelowAverage(): number {
  return (
    benchmarkIndicators.length -
    countIndicatorsAboveAverage()
  );
}