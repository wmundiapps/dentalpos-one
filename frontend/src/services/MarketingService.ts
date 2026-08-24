import type { MarketingCampaign } from "../types/marketing";

export const marketingCampaigns: MarketingCampaign[] = [
  {
    id: 1,
    name: "Implantes Agosto",
    objective: "Gerar avaliações para implantodontia",
    audience: "Adultos de 40 a 70 anos em Maringá e região",
    channels: ["Meta Ads", "WhatsApp", "Instagram"],
    budget: 2500,
    leads: 186,
    conversions: 24,
    revenue: 128000,
    startDate: "01/08/2026",
    endDate: "31/08/2026",
    status: "Em execução",
    responsible: "Equipe WMundi",
  },
  {
    id: 2,
    name: "Reativação de Pacientes",
    objective: "Retomar tratamentos interrompidos",
    audience: "Pacientes sem consulta há mais de 6 meses",
    channels: ["WhatsApp", "E-mail", "SMS"],
    budget: 800,
    leads: 248,
    conversions: 37,
    revenue: 46500,
    startDate: "05/08/2026",
    endDate: "20/08/2026",
    status: "Agendada",
    responsible: "Juliana",
  },
  {
    id: 3,
    name: "Especialização em Implantodontia",
    objective: "Formar nova turma de especialização",
    audience: "Cirurgiões-dentistas do Paraná e estados próximos",
    channels: ["Meta Ads", "Google Ads", "E-mail"],
    budget: 5000,
    leads: 94,
    conversions: 12,
    revenue: 144000,
    startDate: "01/08/2026",
    endDate: "15/09/2026",
    status: "Em execução",
    responsible: "Equipe Comercial",
  },
  {
    id: 4,
    name: "Multiple W48 para Professores",
    objective: "Cadastrar professores parceiros",
    audience: "Professores de Implantodontia e Prótese",
    channels: ["Instagram", "WhatsApp", "E-mail"],
    budget: 1800,
    leads: 42,
    conversions: 8,
    revenue: 21800,
    startDate: "10/08/2026",
    endDate: "30/08/2026",
    status: "Aguardando aprovação",
    responsible: "Robson",
  },
];

export function calculateCampaignConversionRate(
  leads: number,
  conversions: number,
): number {
  if (leads === 0) {
    return 0;
  }

  return (conversions / leads) * 100;
}

export function calculateCampaignReturn(
  budget: number,
  revenue: number,
): number {
  if (budget === 0) {
    return 0;
  }

  return revenue / budget;
}