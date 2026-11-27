import { Chip } from "@mui/material";
export { Bar, Section, Stat, StateBox, asList, fmtDate, fmtDateTime, money, pct, useLoad, useToast, type Toast } from "../admissoes/common";

export const BASE = "/comunicacao";

export const CANAIS_ENVIO = ["WHATSAPP", "EMAIL", "SMS", "TELEGRAM", "VOZ"];

export const ROTULO_CANAL: Record<string, string> = {
  WHATSAPP: "WhatsApp", TELEGRAM: "Telegram", EMAIL: "E-mail", SMS: "SMS", VOZ: "Voz", INSTAGRAM: "Instagram", FACEBOOK: "Facebook", SITE_CHAT: "Chat do site", IN_APP: "No app",
};

/** Chip colorido por status de notificação/campanha/post. */
export function StatusPill({ value }: { value?: string | null }) {
  if (!value) return <>—</>;
  const v = value.toUpperCase();
  const color = /(ENVIAD|ENTREGUE|LIDA|CONCLUIDA|PUBLICADO|APROVADO|ATIV|RESOLVIDA|OK)/.test(v) ? "success"
    : /(FALHA|CANCEL|REJEIT|ESTOUR|SPAM)/.test(v) ? "error"
    : /(PENDENTE|AGENDADA|EXECUTANDO|APROVACAO|ATENCAO|AGUARD|MANUAL|EM_ATEND)/.test(v) ? "warning" : "default";
  return <Chip size="small" color={color as any} label={value.replace(/_/g, " ")} />;
}
