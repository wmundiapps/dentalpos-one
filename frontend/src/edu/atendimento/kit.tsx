// Kit do módulo Atendimento: reaproveita os utilitários visuais de desempenho/juridico (listas responsivas, formulários, toasts).
import { Box, Chip, Typography } from "@mui/material";
import { useCallback, useState, type ReactNode } from "react";
import { call, fmtDate, fmtDateTime, itemsOf, label, useApi, type Opt } from "../desempenho/kit";

export { ActionsMenu, DataList, useIsMobile, qstr, type Col, type RowAction } from "../juridico/kit";
export { FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, StudentPicker, call, fmtDate, fmtDateTime, itemsOf, label, useApi, useRunner, useToast, COLORS, Bar, errMsg, type FormField, type Opt } from "../desempenho/kit";

export const A = "/atendimento";
export const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
export const opts = (xs: string[], rot?: Record<string, string>): Opt[] => xs.map((x) => ({ value: x, label: rot?.[x] ?? label(x) }));

export const CANAIS = ["BALCAO", "TELEFONE", "WHATSAPP", "EMAIL", "CHAT_PORTAL", "INSTAGRAM", "FACEBOOK"];
export const ROTULO_CANAL: Record<string, string> = { BALCAO: "Balcão", TELEFONE: "Telefone", WHATSAPP: "WhatsApp", EMAIL: "E-mail", CHAT_PORTAL: "Chat do portal", INSTAGRAM: "Instagram", FACEBOOK: "Facebook" };
export const PRIORIDADES = ["BAIXA", "NORMAL", "ALTA", "URGENTE"];
export const ROTULO_STATUS: Record<string, string> = { NOVO: "Novo", EM_FILA: "Na fila", EM_ATENDIMENTO: "Em atendimento", AGUARDANDO_SOLICITANTE: "Aguardando solicitante", RESOLVIDO: "Resolvido", FECHADO: "Fechado", ABERTO: "Recebido", EM_ANDAMENTO: "Em andamento", PENDENTE_SOLICITANTE: "Pendência com solicitante", CONCLUIDO: "Concluído", INDEFERIDO: "Indeferido", CANCELADO: "Cancelado" };

export function CanalChip({ canal }: { canal?: string | null }) {
  return canal ? <Chip size="small" variant="outlined" label={ROTULO_CANAL[canal] ?? canal} /> : <>—</>;
}
export function SlaChip({ sla }: { sla?: string | null }) {
  if (!sla) return <>—</>;
  const m: Record<string, [string, "success" | "warning" | "error" | "default"]> = { OK: ["No prazo", "success"], ATENCAO: ["Atenção", "warning"], ESTOURADO: ["SLA estourado", "error"], ENCERRADO: ["Encerrado", "default"] };
  const [t, c] = m[sla] ?? [sla, "default"];
  return <Chip size="small" color={c} label={t} />;
}
export function PrioChip({ p }: { p?: string | null }) {
  if (!p || p === "NORMAL") return <>Normal</>;
  return <Chip size="small" color={p === "URGENTE" ? "error" : p === "ALTA" ? "warning" : "default"} label={label(p)} />;
}
export function StatusChip({ s }: { s?: string | null }) {
  if (!s) return <>—</>;
  const color = /(CONCLU|RESOLV)/.test(s) ? "success" : /(INDEF|CANCEL)/.test(s) ? "error" : /(PEND|AGUARD)/.test(s) ? "warning" : /(ANDAMENTO|ATEND|FILA)/.test(s) ? "info" : "default";
  return <Chip size="small" color={color as any} label={ROTULO_STATUS[s] ?? label(s)} />;
}

/** Baixa um arquivo (PDF/documento) autenticado e abre/salva em nova aba. */
export async function abrirArquivo(path: string, nome: string, abrir = true) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || `Erro ${res.status}`); }
  if ((res.headers.get("content-type") || "").includes("application/json")) { const j = await res.json(); if (j.url) window.open(j.url, "_blank", "noopener,noreferrer"); return; }
  const url = URL.createObjectURL(await res.blob());
  if (abrir && /pdf/.test(res.headers.get("content-type") || "")) window.open(url, "_blank");
  else { const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function lerArquivo(f: File, max = 2_000_000): Promise<string> {
  return new Promise((ok, no) => {
    if (f.size > max) return no(new Error("Arquivo acima de 2 MB: envie um arquivo menor."));
    const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error("Falha ao ler o arquivo.")); r.readAsDataURL(f);
  });
}

export function useReload() { const [rev, setRev] = useState(0); const reload = useCallback(() => setRev((x) => x + 1), []); return { rev, reload }; }

export function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <Box sx={{ mb: 1 }}><Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase" }}>{titulo}</Typography><Box>{children}</Box></Box>;
}
export { useApi as useAtdApi, itemsOf as itemsAtd, call as atdCall, fmtDate as dataBR, fmtDateTime as dataHoraBR };
