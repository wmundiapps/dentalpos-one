import { Alert, Box, Button, CircularProgress, LinearProgress, Paper, Snackbar, Typography } from "@mui/material";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { eduApi } from "../../services/EduApi";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export const fmtDate = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
export const fmtDateTime = (v: any) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
export const fmtNum = (v: any, d = 1) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d }));
export const label = (v?: string | null) => (v ? v.replace(/_/g, " ") : "—");
export const toIso = (d: string) => (d ? new Date(`${d}T12:00:00`).toISOString() : undefined);

/** Carrega um GET com estados de carregando/erro. Nunca lança. */
export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try { setData(await eduApi.get<T>(path)); } catch (e: any) { setError(e?.message || "Falha ao carregar."); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}

export function Status({ loading, error, empty, emptyText, onRetry, children }: { loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string; onRetry?: () => void; children: ReactNode }) {
  if (error) return <Alert severity="error" action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Tentar de novo</Button> : undefined}>{error}</Alert>;
  if (loading) return <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress size={28} /></Box>;
  if (empty) return <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{emptyText || "Nenhum registro."}</Typography>;
  return <>{children}</>;
}

export function Kpi({ title, value, hint, color }: { title: string; value: ReactNode; hint?: string; color?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, borderLeft: color ? `5px solid ${color}` : undefined }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase" }}>{title}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 800 }}>{value}</Typography>
      {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
    </Paper>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: 2 }}>{children}</Box>;
}

export const SEMAFORO: Record<string, string> = { VERDE: "#16a34a", AMARELO: "#eab308", VERMELHO: "#dc2626", CINZA: "#94a3b8" };
export const RISCO_COR: Record<string, string> = { CRITICO: "#dc2626", ALTO: "#ea580c", MEDIO: "#eab308", BAIXO: "#16a34a" };

export function Dot({ color, size = 14 }: { color: string; size?: number }) {
  return <Box component="span" sx={{ display: "inline-block", width: size, height: size, borderRadius: "50%", bgcolor: color, boxShadow: `0 0 0 3px ${color}33`, flexShrink: 0 }} />;
}

export function Progress({ value, color, height = 10, showLabel = true }: { value: number | null | undefined; color?: string; height?: number; showLabel?: boolean }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const c = color || (v >= 80 ? "#16a34a" : v >= 50 ? "#eab308" : "#dc2626");
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 120 }}>
      <LinearProgress variant="determinate" value={v} sx={{ flex: 1, height, borderRadius: height, bgcolor: "action.hover", "& .MuiLinearProgress-bar": { bgcolor: c, borderRadius: height } }} />
      {showLabel ? <Typography variant="caption" sx={{ fontWeight: 800, minWidth: 38, textAlign: "right" }}>{value == null ? "—" : `${fmtNum(v, 0)}%`}</Typography> : null}
    </Box>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const node = (
    <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg(null)}>
      {msg ? <Alert severity={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
    </Snackbar>
  );
  return { toast: setMsg, node };
}

/** Abre um relatório HTML protegido por token (fetch + blob). */
export async function openHtml(path: string) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Erro ${res.status}`);
  const blob = new Blob([await res.text()], { type: "text/html;charset=utf-8" });
  window.open(URL.createObjectURL(blob), "_blank");
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
        <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>{title}</Typography>
        {action}
      </Box>
      {children}
    </Paper>
  );
}
