import { Chip } from "@mui/material";
import { COLORS } from "../desempenho/kit";

export const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";

/** Baixa um arquivo protegido por token (pacote do titular, CSV do ROPA). */
export async function baixar(path: string, nomeArquivo: string) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || `Erro ${res.status}`); }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = nomeArquivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const TIPOS_SOLICITACAO: Array<{ value: string; label: string }> = [
  { value: "CONFIRMACAO", label: "Confirmação de tratamento" }, { value: "ACESSO", label: "Acesso aos dados" }, { value: "CORRECAO", label: "Correção de dados" },
  { value: "ANONIMIZACAO", label: "Anonimização/bloqueio" }, { value: "ELIMINACAO", label: "Eliminação de dados" }, { value: "PORTABILIDADE", label: "Portabilidade" },
  { value: "INFO_COMPARTILHAMENTO", label: "Informação sobre compartilhamento" }, { value: "REVOGACAO_CONSENTIMENTO", label: "Revogação de consentimento" },
  { value: "OPOSICAO", label: "Oposição a tratamento" }, { value: "REVISAO_AUTOMATIZADA", label: "Revisão de decisão automatizada" },
];
export const STATUS_SOLICITACAO = ["ABERTA", "EM_ANALISE", "AGUARDANDO_TITULAR", "ATENDIDA", "ATENDIDA_PARCIALMENTE", "NEGADA", "CANCELADA"];
export const BASES_LEGAIS = ["CONSENTIMENTO", "CONSENTIMENTO_DESTACADO", "CUMPRIMENTO_OBRIGACAO_LEGAL", "POLITICAS_PUBLICAS", "ESTUDOS_ORGAO_PESQUISA", "EXECUCAO_CONTRATO", "EXERCICIO_REGULAR_DIREITOS", "PROTECAO_VIDA", "TUTELA_SAUDE", "LEGITIMO_INTERESSE", "PROTECAO_CREDITO", "GARANTIA_PREVENCAO_FRAUDE"];

/** Semáforo do prazo (15 dias úteis do titular / 3 dias úteis de incidente). */
export function PrazoChip({ estado, dias }: { estado?: string; dias?: number }) {
  if (!estado) return <>—</>;
  const cor = estado === "VENCIDA" ? COLORS.bad : estado === "VENCENDO" ? COLORS.warn : estado === "ENCERRADA" ? COLORS.mute : COLORS.ok;
  const txt = estado === "VENCIDA" ? `vencida há ${Math.abs(dias ?? 0)} d` : estado === "ENCERRADA" ? "encerrada" : `${dias} d`;
  return <Chip size="small" sx={{ bgcolor: cor, color: "#fff", fontWeight: 700 }} label={txt} />;
}
