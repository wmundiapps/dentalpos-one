import { Alert, Box, Paper, Snackbar, Typography } from "@mui/material";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { eduApi } from "../../services/EduApi";

export type Opt = { value: string; label: string };
export const itemsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.items || r?.itens || []);
export const DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
export const DIAS_CURTO = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const minToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const fmtD = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
export const fmtDT = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
/** Converte valor de <input type="datetime-local"> em ISO. */
export const toISO = (v: string) => (v ? new Date(v).toISOString() : undefined);

/** Carrega um GET com estados de carregando/erro; tolerante a falhas. */
export function useGet<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!path) { setData(null); setLoading(false); return; }
    setLoading(true); setError(null);
    try { setData(await eduApi.get<T>(path)); } catch (e: any) { setError(e?.message || "Falha ao carregar."); setData(null); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload };
}

const cache: Record<string, Promise<Opt[]>> = {};
function useOptions(key: string, loader: () => Promise<Opt[]>) {
  const [opts, setOpts] = useState<Opt[]>([]);
  useEffect(() => {
    let on = true;
    if (!cache[key]) cache[key] = loader().catch(() => { delete cache[key]; return [] as Opt[]; });
    cache[key].then((o) => on && setOpts(o));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return opts;
}
export const useTerms = () => useOptions("cal-terms", async () => itemsOf(await eduApi.get("/academico/terms?pageSize=100")).map((p: any) => ({ value: p.id, label: p.nome || p.codigo || p.id })));
export const usePrograms = () => useOptions("cal-programs", async () => itemsOf(await eduApi.get("/academico/programs?pageSize=200")).map((p: any) => ({ value: p.id, label: p.nome })));
export const useSpaces = () => useOptions("cal-spaces", async () => itemsOf(await eduApi.get("/core/espacos?pageSize=300")).map((p: any) => ({ value: p.id, label: `${p.codigo ? p.codigo + " — " : ""}${p.nome}` })));
export const useSections = () => useOptions("cal-sections", async () => itemsOf(await eduApi.get("/academico/class-sections?pageSize=300")).map((r: any) => ({ value: r.id, label: `${r.nome}${r.discipline?.nome ? " — " + r.discipline.nome : ""}` })));

export function useToast() {
  const [msg, setMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const node = (
    <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
      {msg ? <Alert severity={msg.type} onClose={() => setMsg(null)} sx={{ whiteSpace: "pre-line" }}>{msg.text}</Alert> : undefined}
    </Snackbar>
  );
  return { toast: setMsg, node };
}

export function Card({ label, value, color, hint }: { label: string; value: ReactNode; color?: string; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, flex: "1 1 150px", minWidth: 150, borderLeft: `5px solid ${color || "#2563eb"}` }}>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
    </Paper>
  );
}

export const Row = ({ children }: { children: ReactNode }) => <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>{children}</Box>;

export const TIPO_COR: Record<string, string> = {
  FERIADO: "#dc2626", PONTO_FACULTATIVO: "#f97316", RECESSO: "#f59e0b", FERIAS: "#eab308", PROVA: "#7c3aed", SEGUNDA_CHAMADA: "#8b5cf6", EXAME_FINAL: "#6d28d9",
  INICIO_PERIODO: "#16a34a", FIM_PERIODO: "#15803d", MATRICULA: "#0891b2", REMATRICULA: "#0e7490", PRAZO_NOTAS: "#db2777", PRAZO_DIARIO: "#be185d",
  REUNIAO: "#64748b", CONSELHO_CLASSE: "#475569", COLACAO: "#ca8a04", FORMATURA: "#a16207", SEMANA_ACADEMICA: "#2563eb", EVENTO_INSTITUCIONAL: "#0F5FDB",
};
export const corDe = (e: { cor?: string | null; tipo?: string }) => e.cor || TIPO_COR[e.tipo || ""] || "#0F5FDB";
export const rotuloTipo = (t: string) => t.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
export const TIPOS_EVENTO = ["INICIO_PERIODO", "FIM_PERIODO", "MATRICULA", "REMATRICULA", "TRANCAMENTO", "AULA_INAUGURAL", "PROVA", "SEGUNDA_CHAMADA", "EXAME_FINAL", "FERIADO", "PONTO_FACULTATIVO", "RECESSO", "FERIAS", "REUNIAO", "CONSELHO_CLASSE", "COLACAO", "FORMATURA", "PRAZO_NOTAS", "PRAZO_DIARIO", "SEMANA_ACADEMICA", "VESTIBULAR", "ENADE", "DIA_LETIVO_EXTRA", "EVENTO_INSTITUCIONAL", "OUTRO"];
export const TIPOS_EXAME = ["PROVA_1", "PROVA_2", "SUBSTITUTIVA", "EXAME_FINAL", "SEGUNDA_CHAMADA", "REAVALIACAO", "PROVA_UNICA", "PRATICA", "TRABALHO", "SIMULADO"];

/** Cor de calor (verde → amarelo → vermelho) para taxa 0..1. */
export const heat = (t: number) => {
  const x = Math.max(0, Math.min(1, t || 0));
  const hue = 120 - 120 * x;
  return `hsl(${hue}, 70%, ${x === 0 ? 92 : 62}%)`;
};

/** Baixa um arquivo autenticado (ex.: .ics) e dispara o download no navegador. */
export async function baixarArquivo(path: string, nome: string) {
  const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.error || `Erro ${res.status}`);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}
