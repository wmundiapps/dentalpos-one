import type {
  PaymentSimulation,
  TreatmentItem,
  TreatmentPlan,
} from "../types/treatmentPlan";

export const treatmentPlans: TreatmentPlan[] = [
  {
    id: 1,
    patientName: "Maria Oliveira",
    patientCode: "MARI",
    professionalName: "Dr. Robson",
    title: "Reabilitação implantossuportada",
    createdAt: "02/08/2026",
    validUntil: "17/08/2026",
    status: "Em negociação",
    items: [
      {
        id: 1,
        phase: 1,
        title: "Adequação do meio bucal",
        specialty: "Clínica Geral",
        description:
          "Profilaxia, controle periodontal e adequação inicial.",
        quantity: 1,
        unitValue: 850,
        priority: "Alta",
        status: "Aprovado",
        optional: false,
      },
      {
        id: 2,
        phase: 2,
        title: "Implantes posteriores",
        specialty: "Implantodontia",
        description:
          "Instalação de quatro implantes em região posterior.",
        quantity: 4,
        unitValue: 2900,
        priority: "Alta",
        status: "Pendente",
        optional: false,
      },
      {
        id: 3,
        phase: 3,
        title: "Próteses sobre implantes",
        specialty: "Prótese Dentária",
        description:
          "Quatro coroas cerâmicas sobre implantes.",
        quantity: 4,
        unitValue: 2400,
        priority: "Média",
        status: "Pendente",
        optional: false,
      },
      {
        id: 4,
        phase: 4,
        title: "Clareamento dental",
        specialty: "Dentística",
        description:
          "Clareamento supervisionado após a reabilitação.",
        quantity: 1,
        unitValue: 1200,
        priority: "Baixa",
        status: "Pendente",
        optional: true,
      },
    ],
  },
  {
    id: 2,
    patientName: "Carlos Pereira",
    patientCode: "CARL",
    professionalName: "Dra. Cássia",
    title: "Protocolo superior",
    createdAt: "01/08/2026",
    validUntil: "16/08/2026",
    status: "Apresentado",
    items: [
      {
        id: 5,
        phase: 1,
        title: "Cirurgia de protocolo",
        specialty: "Implantodontia",
        description:
          "Instalação de implantes e prótese provisória.",
        quantity: 1,
        unitValue: 18500,
        priority: "Alta",
        status: "Pendente",
        optional: false,
      },
      {
        id: 6,
        phase: 2,
        title: "Prótese definitiva em resina",
        specialty: "Prótese Dentária",
        description:
          "Confecção da prótese definitiva após osseointegração.",
        quantity: 1,
        unitValue: 9500,
        priority: "Média",
        status: "Pendente",
        optional: false,
      },
    ],
  },
];

export function calculateTreatmentItemValue(
  item: TreatmentItem,
): number {
  return item.quantity * item.unitValue;
}

export function calculateTreatmentPlanTotal(
  plan: TreatmentPlan,
): number {
  return plan.items.reduce(
    (total, item) =>
      total + calculateTreatmentItemValue(item),
    0,
  );
}

export function calculateApprovedValue(
  plan: TreatmentPlan,
): number {
  return plan.items
    .filter(
      (item) =>
        item.status === "Aprovado" ||
        item.status === "Concluído",
    )
    .reduce(
      (total, item) =>
        total + calculateTreatmentItemValue(item),
      0,
    );
}

export function calculateEssentialValue(
  plan: TreatmentPlan,
): number {
  return plan.items
    .filter(
      (item) =>
        !item.optional &&
        (item.priority === "Urgente" ||
          item.priority === "Alta"),
    )
    .reduce(
      (total, item) =>
        total + calculateTreatmentItemValue(item),
      0,
    );
}

export function simulatePayment(
  totalValue: number,
  entryPercent: number,
  installments: number,
  monthlyCorrectionPercent = 0,
): PaymentSimulation {
  const entryValue =
    totalValue * (entryPercent / 100);

  const financedValue =
    totalValue - entryValue;

  const correctedValue =
    financedValue *
    (1 +
      (monthlyCorrectionPercent / 100) *
        installments);

  const installmentValue =
    installments > 0
      ? correctedValue / installments
      : 0;

  return {
    entryValue,
    installments,
    installmentValue,
    totalValue: entryValue + correctedValue,
  };
}