export type MarketingChannel =
  | "Meta Ads"
  | "Google Ads"
  | "WhatsApp"
  | "E-mail"
  | "SMS"
  | "Instagram"
  | "Facebook";

export type MarketingCampaignStatus =
  | "Rascunho"
  | "Aguardando aprovação"
  | "Agendada"
  | "Em execução"
  | "Pausada"
  | "Finalizada";

export interface MarketingCampaign {
  id: number;
  name: string;
  objective: string;
  audience: string;
  channels: MarketingChannel[];
  budget: number;
  leads: number;
  conversions: number;
  revenue: number;
  startDate: string;
  endDate: string;
  status: MarketingCampaignStatus;
  responsible: string;
}