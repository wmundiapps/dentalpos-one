import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Paper, TextField, Typography,
} from "@mui/material";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { eduApi } from "../../services/EduApi";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

/** Busca uma página HTML (documentos/certificados) com o token do usuário. */
export async function fetchHtml(path: string, method: "GET" | "POST" = "GET", body?: unknown, publicRoute = false): Promise<string> {
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}${publicRoute ? "" : "/edu"}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const txt = await res.text();
  if (!res.ok) {
    try { throw new Error(JSON.parse(txt).error || `Erro ${res.status}`); } catch (e: any) { throw new Error(e?.message?.startsWith("Unexpected") ? `Erro ${res.status}` : e.message); }
  }
  return txt;
}

export const fmtDate = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
export const fmtDateTime = (v: any) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
export const fmtMoney = (v: any) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtNum = (v: any, d = 1) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const label = (s?: string | null) => (s ? s.replace(/_/g, " ") : "—");

/** Carrega dados de um endpoint com estados de carregando/erro. */
export function useLoad<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!path) { setData(null); setLoading(false); return; }
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const r = await eduApi.get<T>(path);
      if (my === seq.current) setData(r);
    } catch (e: any) {
      if (my === seq.current) { setError(e.message || "Falha ao carregar."); setData(null); }
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}

export const itemsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? []);

export function Feedback({ loading, error, onRetry }: { loading?: boolean; error?: string | null; onRetry?: () => void }) {
  if (loading) return <Box sx={{ py: 3, display: "flex", justifyContent: "center" }}><CircularProgress size={26} /></Box>;
  if (error) return <Alert severity="warning" action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Tentar de novo</Button> : undefined} sx={{ my: 1 }}>{error}</Alert>;
  return null;
}

export function Empty({ children }: { children?: ReactNode }) {
  return <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{children || "Nada por aqui ainda."}</Typography>;
}

export function StatCard({ title, value, hint, color }: { title: string; value: ReactNode; hint?: string; color?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, borderLeft: color ? `5px solid ${color}` : undefined }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase" }}>{title}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.15 }}>{value}</Typography>
      {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
    </Paper>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, mb: 2 }}>{children}</Box>;
}

export function Progress({ value, color = "primary" }: { value: number; color?: "primary" | "success" | "warning" | "error" }) {
  return <LinearProgress variant="determinate" color={color} value={Math.max(0, Math.min(100, value))} sx={{ height: 8, borderRadius: 4 }} />;
}

const STATUS_COLOR: Array<[RegExp, "success" | "error" | "warning" | "info" | "default"]> = [
  [/(CONCLU|APROV|DEFER|ATIV|EMITID|VIGENTE|REGISTRADO|ENTREGUE|APTO|COLOU|PAGA|REALIZADA|ENCERRADA)/, "success"],
  [/(ATRAS|REJEIT|INDEFER|CANCEL|REVOG|REPROV|VENCID|EXCLUID|AUSENTE|ALTO)/, "error"],
  [/(PEND|AGUARD|ANALISE|DILIG|RASCUN|SOLICIT|CONFER|ATENCAO|CONVOCADA|SUSPENS|ELEGIVEL|RECUP|EXAME)/, "warning"],
  [/(ABERTO|REGISTRO|INSCRITO|PLANEJADA|EM_CURSO)/, "info"],
];
export function Status({ value }: { value?: string | null }) {
  if (!value) return <>—</>;
  const v = String(value).toUpperCase();
  const c = STATUS_COLOR.find(([re]) => re.test(v))?.[1] ?? "default";
  return <Chip size="small" color={c} label={label(value)} />;
}

/** Pré-visualização de HTML imprimível (documento, certificado, ata, termo). */
export function HtmlPreviewDialog({ open, title, html, loading, error, onClose }: { open: boolean; title: string; html: string | null; loading?: boolean; error?: string | null; onClose: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const print = () => { try { ref.current?.contentWindow?.focus(); ref.current?.contentWindow?.print(); } catch { /* ignore */ } };
  const openTab = () => {
    if (!html) return;
    const w = window.open("", "_blank");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers sx={{ minHeight: 420, bgcolor: "action.hover" }}>
        <Feedback loading={loading} error={error} />
        {html && !loading ? <Box component="iframe" ref={ref} title={title} srcDoc={html} sx={{ width: "100%", height: "70vh", border: 0, bgcolor: "#fff", borderRadius: 1 }} /> : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={openTab} startIcon={<OpenInNewIcon />} disabled={!html}>Abrir em nova aba</Button>
        <Button onClick={print} startIcon={<PrintOutlinedIcon />} disabled={!html} variant="contained">Imprimir / PDF</Button>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Hook para abrir pré-visualizações a partir de uma função assíncrona que devolve HTML. */
export function useHtmlPreview() {
  const [state, setState] = useState<{ open: boolean; title: string; html: string | null; loading: boolean; error: string | null }>({ open: false, title: "", html: null, loading: false, error: null });
  const show = useCallback(async (title: string, loader: () => Promise<string>) => {
    setState({ open: true, title, html: null, loading: true, error: null });
    try { setState({ open: true, title, html: await loader(), loading: false, error: null }); }
    catch (e: any) { setState({ open: true, title, html: null, loading: false, error: e.message || "Falha ao gerar o documento." }); }
  }, []);
  const dialog = <HtmlPreviewDialog {...state} onClose={() => setState((s) => ({ ...s, open: false }))} />;
  return { show, dialog };
}

/** Seletor de aluno com busca por nome, RA ou CPF (GET /secretaria/alunos). */
export function StudentSearch(props: { value: { id: string; nome: string; ra?: string } | null; onChange: (v: { id: string; nome: string; ra?: string } | null) => void; labelText?: string; required?: boolean }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setOpts([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try { setOpts(itemsOf(await eduApi.get(`/secretaria/alunos?pageSize=10&q=${encodeURIComponent(q.trim())}`))); } catch { setOpts([]); } finally { setBusy(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  if (props.value) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, border: 1, borderColor: "divider", borderRadius: 1, px: 1.5, py: 0.5, minHeight: 40 }}>
        <Typography sx={{ flex: 1 }} noWrap><b>{props.value.nome}</b>{props.value.ra ? ` · RA ${props.value.ra}` : ""}</Typography>
        <Button size="small" onClick={() => props.onChange(null)}>Trocar</Button>
      </Box>
    );
  }
  return (
    <Box>
      <TextField size="small" fullWidth required={props.required} label={`${props.labelText || "Aluno"} — nome, RA ou CPF`} value={q} onChange={(e) => setQ(e.target.value)}
        helperText={busy ? "Buscando…" : q.trim().length >= 2 && !opts.length ? "Nenhum aluno encontrado." : undefined} />
      {opts.length > 0 && (
        <Paper variant="outlined" sx={{ mt: 0.5, maxHeight: 220, overflow: "auto" }}>
          {opts.map((o) => (
            <MenuItem key={o.id} onClick={() => { props.onChange({ id: o.id, nome: o.nomeCompleto, ra: o.ra }); setQ(""); setOpts([]); }}>
              <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{o.nomeCompleto}</Typography><Typography variant="caption" color="text.secondary">RA {o.ra} · {label(o.status)}</Typography></Box>
            </MenuItem>
          ))}
        </Paper>
      )}
    </Box>
  );
}
