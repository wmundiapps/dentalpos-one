// Precificação: custo real de cada serviço (materiais + mão de obra direta + parte das despesas fixas), margem desejada,
// ponto de equilíbrio (break even) e lucro projetado do mês.
export const SIZE_FACTOR = { carro: 1, suv: 1.3, utilitario: 1.4, van: 1.8, caminhao: 3 } as const;
export type Cat = keyof typeof SIZE_FACTOR;

export interface PricingInput {
  services: { id: string; name: string; prices: Record<Cat, number>; materialCents: number; otherCostCents: number }[];
  fixedMonthlyCents: number;        // aluguel, salários, energia, água, etc.
  washesPerMonth: number;           // volume esperado (média real ou meta)
  avgFactor: number;                // fator médio de tamanho dos veículos atendidos
  marginPct: number; taxPct: number; cardFeePct: number; platformFeePct: number;
  targetProfitCents: number;
}

export function computePricing(i: PricingInput) {
  const varPct = (i.taxPct + i.cardFeePct + i.platformFeePct) / 100;
  const fixedPerWash = i.washesPerMonth > 0 ? i.fixedMonthlyCents / i.washesPerMonth : 0;
  const marginPct = i.marginPct / 100;
  const services = i.services.map((s) => {
    const direct = (s.materialCents + s.otherCostCents);
    const out = {} as Record<Cat, { costCents: number; currentCents: number; suggestedCents: number; currentMarginPct: number; contributionCents: number }>;
    for (const cat of Object.keys(SIZE_FACTOR) as Cat[]) {
      const f = SIZE_FACTOR[cat];
      const cost = Math.round(direct * f + fixedPerWash * (s.id ? f / i.avgFactor : 1)); // despesa fixa rateada por tamanho
      const denom = 1 - varPct - marginPct;
      const suggested = denom > 0.05 ? Math.ceil(cost / denom / 100) * 100 : 0; // arredonda para cima em reais
      const cur = s.prices[cat] ?? 0;
      const net = cur * (1 - varPct);
      out[cat] = { costCents: cost, currentCents: cur, suggestedCents: suggested, currentMarginPct: cur > 0 ? Math.round(((net - cost) / cur) * 1000) / 10 : 0, contributionCents: Math.round(net - direct * f) };
    }
    return { id: s.id, name: s.name, byCategory: out };
  });
  // Ponto de equilíbrio com a margem de contribuição média (carro de porte médio, ponderada pelo fator médio)
  const base = services.filter((s) => s.byCategory.carro.currentCents > 0);
  const avgContribution = base.length ? base.reduce((a, s) => a + s.byCategory.carro.contributionCents * i.avgFactor, 0) / base.length : 0;
  const breakEven = avgContribution > 0 ? Math.ceil(i.fixedMonthlyCents / avgContribution) : null;
  const forTarget = avgContribution > 0 ? Math.ceil((i.fixedMonthlyCents + i.targetProfitCents) / avgContribution) : null;
  const projectedProfit = Math.round(avgContribution * i.washesPerMonth - i.fixedMonthlyCents);
  return { fixedPerWashCents: Math.round(fixedPerWash), avgContributionCents: Math.round(avgContribution), breakEvenWashes: breakEven, washesForTargetProfit: forTarget, projectedProfitCents: projectedProfit, services };
}
