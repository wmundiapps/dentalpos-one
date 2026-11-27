import { Alert, Box, Button, CircularProgress, LinearProgress, Paper, Snackbar, Typography } from "@mui/material";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { eduApi } from "../../services/EduApi";

export const BASE = "/admissoes";

export const money = (v: any) => (typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");
export const pct = (v: any) => (typeof v === "number" ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
export const fmtDate = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
export const fmtDateTime = (v: any) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

/** Carrega um GET com estados de carregando/erro e recarga manual. `path` nulo = não carrega. */
export function useLoad<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!path) { setData(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try { setData(await eduApi.get<T>(path)); } catch (e: any) { setError(e?.message || "Falha ao carregar."); setData(null); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload };
}

export interface Toast { type: "success" | "error"; text: string }
export function useToast() {
  const [msg, setMsg] = useState<Toast | null>(null);
  const node = (
    <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg(null)}>
      {msg ? <Alert severity={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
    </Snackbar>
  );
  return { setMsg, node };
}

/** Exibe carregando / erro (com botão de tentar de novo) / vazio ou o conteúdo. */
export function StateBox({ loading, error, empty, emptyText, onRetry, children }: {
  loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string; onRetry?: () => void; children: ReactNode;
}) {
  if (loading) return <Box sx={{ py: 4, textAlign: "center" }}><CircularProgress size={28} /></Box>;
  if (error) return <Alert severity="warning" action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Tentar de novo</Button> : undefined}>Não foi possível carregar estes dados: {error}</Alert>;
  if (empty) return <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{emptyText || "Nada por aqui ainda."}</Typography>;
  return <>{children}</>;
}

export function Stat({ label, value, hint, color }: { label: string; value: ReactNode; hint?: string; color?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, minWidth: 150, flex: "1 1 150px" }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{label}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, color }}>{value}</Typography>
      {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
    </Paper>
  );
}

export function Bar({ value, max = 100, color = "primary", label }: { value: number; max?: number; color?: "primary" | "success" | "warning" | "error" | "info"; label?: ReactNode }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <Box>
      {label ? <Typography variant="caption">{label}</Typography> : null}
      <LinearProgress variant="determinate" value={p} color={color} sx={{ height: 10, borderRadius: 5 }} />
    </Box>
  );
}

export function Section({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
          {description ? <Typography variant="body2" color="text.secondary">{description}</Typography> : null}
        </Box>
        {actions}
      </Box>
      {children}
    </Paper>
  );
}

export function asList(res: any): any[] {
  return Array.isArray(res) ? res : res?.items || [];
}
