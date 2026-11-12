// Kit do Agente de análise de documentos: constantes, chips de gravidade/resultado e utilitários de arquivo.
// Reaproveita o kit visual do Jurídico (lista responsiva, ações) e de desempenho (formulários, API).
import { Chip } from "@mui/material";
import {
  COLORS, DataList, ActionsMenu, FormDialog, LoadBox, Pick, Section, Kpi, KpiRow, call, errMsg, fmtDate, fmtDateTime, itemsOf, label, useApi, useRunner, useToast, qstr, useIsMobile,
  type FormField, type Opt, type RowAction,
} from "../juridico/kit";

export { COLORS, DataList, ActionsMenu, FormDialog, LoadBox, Pick, Section, Kpi, KpiRow, call, errMsg, fmtDate, fmtDateTime, itemsOf, label, useApi, useRunner, useToast, qstr, useIsMobile };
export type { FormField, Opt, RowAction };

export const AD = "/analise-docs";
export const AVISO_AGENTE = "O agente apoia a conferência humana: não substitui perícia documental nem a decisão da instituição.";
export const AVISO_SIMULADO = "Verificação de instituições SIMULADA: usa uma base local de demonstração (cadastro fictício). Nenhuma consulta real ao MEC (e-MEC) ou às secretarias estaduais de educação é feita até que a integração seja configurada.";

export const ORIGENS: Opt[] = [{ value: "SECRETARIA", label: "Secretaria" }, { value: "FINANCEIRO", label: "Financeiro" }, { value: "JURIDICO", label: "Jurídico" }];
export const CONTEXTOS: Opt[] = [
  { value: "MATRICULA", label: "Matrícula" }, { value: "TRANSFERENCIA", label: "Transferência" }, { value: "EQUIVALENCIA", label: "Equivalência de disciplinas" }, { value: "DIPLOMA", label: "Diploma" },
  { value: "COMPROVANTE", label: "Comprovante" }, { value: "NOTA_FISCAL", label: "Nota fiscal" }, { value: "CONTRATO", label: "Contrato" }, { value: "CERTIDAO", label: "Certidão" }, { value: "OUTRO", label: "Outro" },
];
export const rotuloOrigem = (o?: string | null) => ORIGENS.find((x) => x.value === o)?.label ?? label(o);

const COR_GRAV: Record<string, string> = { CRITICA: "#b91c1c", ALTA: "#c2410c", MEDIA: "#a16207", BAIXA: "#475569", INFO: "#0f766e" };
const ROT_GRAV: Record<string, string> = { CRITICA: "Crítica", ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa", INFO: "Informativa" };
export function GravidadeChip({ g }: { g?: string | null }) {
  if (!g) return <>—</>;
  return <Chip size="small" label={ROT_GRAV[g] ?? g} sx={{ bgcolor: COR_GRAV[g] ?? COLORS.mute, color: "#fff", fontWeight: 700 }} />;
}

export function ResultadoChip({ r }: { r?: string | null }) {
  if (!r) return <Chip size="small" variant="outlined" label="Sem análise" />;
  const m: Record<string, [string, string]> = { OK: [COLORS.ok, "Sem pendências"], ATENCAO: [COLORS.warn, "Atenção"], CRITICO: [COLORS.bad, "CRÍTICO"] };
  const [bg, txt] = m[r] ?? [COLORS.mute, r];
  return <Chip size="small" label={txt} sx={{ bgcolor: bg, color: "#fff", fontWeight: 700 }} />;
}

export const ROT_STATUS: Record<string, string> = { EM_FILA: "Aguardando análise", EM_REVISAO: "Em revisão humana", APROVADO: "Aprovado", REJEITADO: "Rejeitado", DOCUMENTO_SOLICITADO: "Novo documento solicitado" };
export function StatusChip({ s }: { s?: string | null }) {
  if (!s) return <>—</>;
  const cor = s === "APROVADO" ? "success" : s === "REJEITADO" ? "error" : s === "EM_REVISAO" ? "warning" : s === "DOCUMENTO_SOLICITADO" ? "info" : "default";
  return <Chip size="small" color={cor as any} variant="outlined" label={ROT_STATUS[s] ?? s} />;
}

/** Lê um arquivo do computador/celular como data URL (limite de 8 MB; o arquivo NÃO é guardado, só o hash e os campos extraídos cifrados). */
export function lerArquivoComoDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    if (f.size > 8 * 1024 * 1024) { rej(new Error("Arquivo acima de 8 MB.")); return; }
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(f);
  });
}

/** Configuração do agente (percentuais, SLA, diretorias) — leitura liberada aos operadores. */
export function useConfigAD() {
  return useApi<any>(`${AD}/config`).data as any;
}

export const slaTexto =(c: { slaEm?: string; status?: string; atrasado?: boolean }) => {
  if (!c.slaEm || !["EM_FILA", "EM_REVISAO"].includes(c.status || "")) return "—";
  const h = Math.round((new Date(c.slaEm).getTime() - Date.now()) / 3_600_000);
  return h < 0 ? `atrasado ${Math.abs(h)} h` : `${h} h`;
};
