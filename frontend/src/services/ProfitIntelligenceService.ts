import type {
  FinancialInsight,
  ProcedurePricingResult,
  ProcedureProfitability,
  ProfessionalProfitability,
  ProfitScenario,
  ProfitabilityLevel,
  RoomProfitability,
} from "../types/profitIntelligence";

export const proceduresProfitability: ProcedureProfitability[] = [
  {
    id: 1,
    name: "Implante unitário",
    specialty: "Implantodontia",
    averagePrice: 4900,
    numberOfSessions: 4,
    minutesPerSession: 75,
    monthlyQuantity: 18,
    costs: {
      materialCost: 720,
      laboratoryCost: 850,
      medicationCost: 130,
      sterilizationCost: 85,
      financialFeePercent: 3.5,
      taxPercent: 13.5,
      professionalCommissionPercent: 25,
      warrantyReservePercent: 3,
      marketingAllocation: 180,
      administrativeAllocation: 210,
      roomHourlyCost: 190,
    },
    minimumMarginPercent: 15,
    targetMarginPercent: 30,
  },
  {
    id: 2,
    name: "Prótese protocolo em resina",
    specialty: "Prótese Dentária",
    averagePrice: 19500,
    numberOfSessions: 7,
    minutesPerSession: 95,
    monthlyQuantity: 6,
    costs: {
      materialCost: 1650,
      laboratoryCost: 5200,
      medicationCost: 320,
      sterilizationCost: 210,
      financialFeePercent: 4,
      taxPercent: 13.5,
      professionalCommissionPercent: 22,
      warrantyReservePercent: 5,
      marketingAllocation: 650,
      administrativeAllocation: 780,
      roomHourlyCost: 190,
    },
    minimumMarginPercent: 18,
    targetMarginPercent: 32,
  },
  {
    id: 3,
    name: "Manutenção ortodôntica",
    specialty: "Ortodontia",
    averagePrice: 320,
    numberOfSessions: 1,
    minutesPerSession: 30,
    monthlyQuantity: 165,
    costs: {
      materialCost: 28,
      laboratoryCost: 0,
      medicationCost: 0,
      sterilizationCost: 22,
      financialFeePercent: 3.2,
      taxPercent: 13.5,
      professionalCommissionPercent: 30,
      warrantyReservePercent: 1,
      marketingAllocation: 12,
      administrativeAllocation: 18,
      roomHourlyCost: 190,
    },
    minimumMarginPercent: 12,
    targetMarginPercent: 25,
  },
  {
    id: 4,
    name: "Clareamento supervisionado",
    specialty: "Dentística",
    averagePrice: 1200,
    numberOfSessions: 3,
    minutesPerSession: 45,
    monthlyQuantity: 14,
    costs: {
      materialCost: 280,
      laboratoryCost: 0,
      medicationCost: 0,
      sterilizationCost: 45,
      financialFeePercent: 3.5,
      taxPercent: 13.5,
      professionalCommissionPercent: 30,
      warrantyReservePercent: 2,
      marketingAllocation: 90,
      administrativeAllocation: 75,
      roomHourlyCost: 190,
    },
    minimumMarginPercent: 15,
    targetMarginPercent: 28,
  },
  {
    id: 5,
    name: "Toxina botulínica",
    specialty: "Harmonização Orofacial",
    averagePrice: 1650,
    numberOfSessions: 2,
    minutesPerSession: 50,
    monthlyQuantity: 20,
    costs: {
      materialCost: 610,
      laboratoryCost: 0,
      medicationCost: 40,
      sterilizationCost: 38,
      financialFeePercent: 3.8,
      taxPercent: 13.5,
      professionalCommissionPercent: 28,
      warrantyReservePercent: 4,
      marketingAllocation: 120,
      administrativeAllocation: 90,
      roomHourlyCost: 190,
    },
    minimumMarginPercent: 15,
    targetMarginPercent: 30,
  },
];

export const professionalProfitability: ProfessionalProfitability[] = [
  {
    id: 1,
    professionalName: "Dr. Robson",
    specialty: "Implantodontia e Prótese",
    grossRevenue: 142800,
    materialCost: 18400,
    laboratoryCost: 27600,
    commissionValue: 31400,
    taxAllocation: 19278,
    fixedCostAllocation: 12800,
    workedHours: 118,
    appointments: 92,
    reworkValue: 2400,
  },
  {
    id: 2,
    professionalName: "Dra. Cássia",
    specialty: "Ortodontia e Clínica",
    grossRevenue: 86400,
    materialCost: 7200,
    laboratoryCost: 3800,
    commissionValue: 25920,
    taxAllocation: 11664,
    fixedCostAllocation: 10600,
    workedHours: 154,
    appointments: 176,
    reworkValue: 980,
  },
  {
    id: 3,
    professionalName: "Dra. Juliana",
    specialty: "Harmonização Orofacial",
    grossRevenue: 54800,
    materialCost: 17200,
    laboratoryCost: 0,
    commissionValue: 15344,
    taxAllocation: 7398,
    fixedCostAllocation: 7400,
    workedHours: 76,
    appointments: 58,
    reworkValue: 1250,
  },
];

export const roomProfitability: RoomProfitability[] = [
  {
    id: 1,
    roomName: "Consultório 1",
    availableHours: 176,
    occupiedHours: 158,
    grossRevenue: 118000,
    variableCosts: 32400,
    fixedCostAllocation: 14800,
  },
  {
    id: 2,
    roomName: "Consultório 2",
    availableHours: 176,
    occupiedHours: 147,
    grossRevenue: 82400,
    variableCosts: 24700,
    fixedCostAllocation: 13200,
  },
  {
    id: 3,
    roomName: "Consultório 3",
    availableHours: 176,
    occupiedHours: 104,
    grossRevenue: 47600,
    variableCosts: 16200,
    fixedCostAllocation: 12600,
  },
  {
    id: 4,
    roomName: "Consultório 4",
    availableHours: 176,
    occupiedHours: 61,
    grossRevenue: 21400,
    variableCosts: 7800,
    fixedCostAllocation: 11900,
  },
];

export const profitScenarios: ProfitScenario[] = [
  {
    id: 1,
    title: "Reajuste geral de 5%",
    description:
      "Aplicação de reajuste de 5% nos procedimentos sem alteração da demanda.",
    currentMonthlyProfit: 86400,
    projectedMonthlyProfit: 103800,
    investmentRequired: 0,
  },
  {
    id: 2,
    title: "Reduzir uma consulta no protocolo",
    description:
      "Otimização clínica e laboratorial para reduzir uma sessão sem prejudicar a qualidade.",
    currentMonthlyProfit: 86400,
    projectedMonthlyProfit: 92400,
    investmentRequired: 2800,
    paybackMonths: 0.5,
  },
  {
    id: 3,
    title: "Aquisição de scanner intraoral",
    description:
      "Redução de moldagens, repetições e custos laboratoriais.",
    currentMonthlyProfit: 86400,
    projectedMonthlyProfit: 96700,
    investmentRequired: 96000,
    paybackMonths: 9.3,
  },
  {
    id: 4,
    title: "Aumentar ocupação do consultório 4",
    description:
      "Preencher 35 horas mensais ociosas com clínica geral e avaliações.",
    currentMonthlyProfit: 86400,
    projectedMonthlyProfit: 98200,
    investmentRequired: 2400,
    paybackMonths: 0.2,
  },
];

export const financialInsights: FinancialInsight[] = [
  {
    id: 1,
    title: "Clareamento com margem insuficiente",
    description:
      "O preço atual não remunera adequadamente as três sessões e os custos indiretos.",
    recommendation:
      "Reajustar o valor ou reduzir o número de sessões presenciais.",
    priority: "Alta",
    estimatedImpact: 5800,
    module: "Precificação",
  },
  {
    id: 2,
    title: "Consultório 4 com alta ociosidade",
    description:
      "A sala apresenta ocupação inferior a 35% e não cobre integralmente seu custo fixo.",
    recommendation:
      "Abrir agenda para profissionais parceiros, avaliações e locação por turno.",
    priority: "Alta",
    estimatedImpact: 11800,
    module: "Estrutura",
  },
  {
    id: 3,
    title: "Retrabalho em Harmonização Orofacial",
    description:
      "O custo de retornos e complementações está acima da reserva de garantia.",
    recommendation:
      "Revisar protocolos, critérios clínicos e percentual reservado para intercorrências.",
    priority: "Média",
    estimatedImpact: 3200,
    module: "Qualidade",
  },
  {
    id: 4,
    title: "Scanner com retorno viável",
    description:
      "A economia projetada indica retorno do investimento em aproximadamente nove meses.",
    recommendation:
      "Comparar aquisição, leasing e locação antes da decisão.",
    priority: "Baixa",
    estimatedImpact: 10300,
    module: "Investimentos",
  },
];

export function formatProfitMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function getProfitabilityLevel(
  marginPercent: number,
  targetMarginPercent: number,
  minimumMarginPercent: number,
): ProfitabilityLevel {
  if (marginPercent < 0) {
    return "Prejuízo";
  }

  if (marginPercent < minimumMarginPercent) {
    return "Atenção";
  }

  if (marginPercent < targetMarginPercent) {
    return "Saudável";
  }

  return "Excelente";
}

export function calculateProcedurePricing(
  procedure: ProcedureProfitability,
): ProcedurePricingResult {
  const totalClinicalHours =
    (procedure.numberOfSessions *
      procedure.minutesPerSession) /
    60;

  const directCost =
    procedure.costs.materialCost +
    procedure.costs.laboratoryCost +
    procedure.costs.medicationCost +
    procedure.costs.sterilizationCost +
    procedure.costs.marketingAllocation +
    procedure.costs.administrativeAllocation;

  const roomCost =
    totalClinicalHours *
    procedure.costs.roomHourlyCost;

  const percentageCostRate =
    procedure.costs.financialFeePercent +
    procedure.costs.taxPercent +
    procedure.costs.professionalCommissionPercent +
    procedure.costs.warrantyReservePercent;

  const percentageCosts =
    procedure.averagePrice *
    (percentageCostRate / 100);

  const totalEstimatedCost =
    directCost + roomCost + percentageCosts;

  const currentProfit =
    procedure.averagePrice - totalEstimatedCost;

  const currentMarginPercent =
    procedure.averagePrice > 0
      ? (currentProfit / procedure.averagePrice) * 100
      : 0;

  const fixedCostWithoutPricePercentages =
    directCost + roomCost;

  const variableRate = percentageCostRate / 100;

  const calculatePriceForMargin = (
    desiredMarginPercent: number,
  ): number => {
    const divisor =
      1 -
      variableRate -
      desiredMarginPercent / 100;

    if (divisor <= 0) {
      return 0;
    }

    return fixedCostWithoutPricePercentages / divisor;
  };

  const minimumPrice = calculatePriceForMargin(
    procedure.minimumMarginPercent,
  );

  const idealPrice = calculatePriceForMargin(
    procedure.targetMarginPercent,
  );

  const premiumPrice = calculatePriceForMargin(
    procedure.targetMarginPercent + 10,
  );

  return {
    procedureId: procedure.id,
    procedureName: procedure.name,
    totalClinicalHours,
    directCost,
    roomCost,
    percentageCosts,
    totalEstimatedCost,
    minimumPrice,
    idealPrice,
    premiumPrice,
    currentProfit,
    currentMarginPercent,
    level: getProfitabilityLevel(
      currentMarginPercent,
      procedure.targetMarginPercent,
      procedure.minimumMarginPercent,
    ),
  };
}

export function getAllProcedurePricing(): ProcedurePricingResult[] {
  return proceduresProfitability.map(
    calculateProcedurePricing,
  );
}

export function calculateProfessionalNetProfit(
  professional: ProfessionalProfitability,
): number {
  return (
    professional.grossRevenue -
    professional.materialCost -
    professional.laboratoryCost -
    professional.commissionValue -
    professional.taxAllocation -
    professional.fixedCostAllocation -
    professional.reworkValue
  );
}

export function calculateProfessionalMargin(
  professional: ProfessionalProfitability,
): number {
  if (professional.grossRevenue === 0) {
    return 0;
  }

  return (
    calculateProfessionalNetProfit(professional) /
    professional.grossRevenue
  ) * 100;
}

export function calculateRoomProfit(
  room: RoomProfitability,
): number {
  return (
    room.grossRevenue -
    room.variableCosts -
    room.fixedCostAllocation
  );
}

export function calculateRoomOccupancy(
  room: RoomProfitability,
): number {
  if (room.availableHours === 0) {
    return 0;
  }

  return (
    room.occupiedHours / room.availableHours
  ) * 100;
}

export function calculateTotalGrossRevenue(): number {
  return professionalProfitability.reduce(
    (total, professional) =>
      total + professional.grossRevenue,
    0,
  );
}

export function calculateTotalNetProfit(): number {
  return professionalProfitability.reduce(
    (total, professional) =>
      total +
      calculateProfessionalNetProfit(professional),
    0,
  );
}

export function calculateOverallMargin(): number {
  const revenue = calculateTotalGrossRevenue();

  if (revenue === 0) {
    return 0;
  }

  return (
    calculateTotalNetProfit() / revenue
  ) * 100;
}