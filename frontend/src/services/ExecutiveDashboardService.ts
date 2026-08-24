export interface ExecutiveCard {
  title: string;
  value: string;
  variation: number;
  color: "success" | "warning" | "error" | "info";
}

export const executiveCards: ExecutiveCard[] = [
  {
    title: "Faturamento Hoje",
    value: "R$ 18.420",
    variation: 12,
    color: "success",
  },
  {
    title: "Pacientes Atendidos",
    value: "47",
    variation: 8,
    color: "info",
  },
  {
    title: "Orçamentos Fechados",
    value: "13",
    variation: 15,
    color: "success",
  },
  {
    title: "Faltas",
    value: "4",
    variation: -10,
    color: "warning",
  },
  {
    title: "Recebimentos PIX",
    value: "R$ 7.840",
    variation: 6,
    color: "success",
  },
  {
    title: "Recebimentos Cartão",
    value: "R$ 6.210",
    variation: 2,
    color: "info",
  },
  {
    title: "Boletos Pendentes",
    value: "R$ 2.450",
    variation: -4,
    color: "warning",
  },
  {
    title: "Ticket Médio",
    value: "R$ 392",
    variation: 11,
    color: "success",
  },
];