// Kit de componentes compartilhado pelas telas de Infraestrutura, Suprimentos e Biblioteca (EduMaster Pro).
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  LinearProgress, MenuItem, Paper, Snackbar, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { eduApi } from "../../services/EduApi";

// ---------- formatação ----------
export const fmtDate = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
export const fmtDateTime = (v: any) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
export const brl = (v: any) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const num = (v: any, d = 1) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d }));
export const pct = (v: any) => (v === null || v === undefined ? "—" : `${num(v, 1)}%`);
export const itemsOf = (d: any): any[] => (Array.isArray(d) ? d : d?.items || []);
export const label = (s?: string | null) => (s ? String(s).replace(/_/g, " ") : "—");

// ---------- carregamento tolerante ----------
export interface ApiState<T = any> { data: T | null; loading: boolean; error: string | null; reload: () => void }

export function useApi<T = any>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try { setData(await eduApi.get<T>(path)); } catch (e: any) { setError(e?.message || "Falha ao carregar."); setData(null); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

/** Renderiza estado de carregando/erro e entrega os dados quando prontos. */
export function Async<T = any>({ state, children, empty }: { state: ApiState<T>; children: (d: T) => ReactNode; empty?: string }) {
  if (state.loading && !state.data) return <Box sx={{ py: 4, textAlign: "center" }}><CircularProgress size={28} /></Box>;
  if (state.error) {
    return (
      <Alert severity="warning" action={<Button size="small" onClick={state.reload}>Tentar de novo</Button>} sx={{ my: 1 }}>
        Não foi possível carregar esta seção: {state.error}
      </Alert>
    );
  }
  if (state.data === null || state.data === undefined) return <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{empty || "Sem dados."}</Typography>;
  return <>{children(state.data)}</>;
}

// ---------- avisos ----------
export function useToast() {
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const node = (
    <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
      {msg ? <Alert severity={msg.type} onClose={() => setMsg(null)} sx={{ maxWidth: 560 }}>{msg.text}</Alert> : undefined}
    </Snackbar>
  );
  /** Executa uma ação (com confirmação opcional), avisa o resultado e chama after() em caso de sucesso. */
  async function run(fn: () => Promise<any>, ok = "Concluído.", after?: (r: any) => void, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      const r = await fn();
      setMsg({ type: "success", text: ok });
      after?.(r);
      return r;
    } catch (e: any) { setMsg({ type: "error", text: e?.message || "Falha na operação." }); }
  }
  return { node, run, ok: (text: string) => setMsg({ type: "success", text }), err: (text: string) => setMsg({ type: "error", text }) };
}

// ---------- listas auxiliares (espaços, cursos) ----------
export type Opt = { value: string; label: string };
const cache: Record<string, { at: number; p: Promise<Opt[]> }> = {};
function cached(key: string, loader: () => Promise<Opt[]>) {
  const c = cache[key];
  if (c && Date.now() - c.at < 15000) return c.p;
  const p = loader().catch(() => { delete cache[key]; return [] as Opt[]; });
  cache[key] = { at: Date.now(), p };
  return p;
}
export function useOptions(key: string, loader: () => Promise<Opt[]>) {
  const [opts, setOpts] = useState<Opt[]>([]);
  useEffect(() => { let on = true; cached(key, loader).then((o) => on && setOpts(o)); return () => { on = false; }; /* eslint-disable-next-line */ }, [key]);
  return opts;
}
export const useSpaces = () => useOptions("espacos", async () => itemsOf(await eduApi.get("/core/espacos?pageSize=200")).map((s: any) => ({ value: s.id, label: [s.codigo, s.nome].filter(Boolean).join(" — ") })));
export const usePrograms = () => useOptions("cursos", async () => itemsOf(await eduApi.get("/academico/programs")).map((p: any) => ({ value: p.id, label: p.nome })));
export const useSupplierOptions = () => useOptions("fornecedores", async () => itemsOf(await eduApi.get("/suprimentos/fornecedores?pageSize=200")).map((p: any) => ({ value: p.id, label: p.razaoSocial })));
export const nameOf = (opts: Opt[], id?: string | null) => (id ? opts.find((o) => o.value === id)?.label || id : "—");

// ---------- formulário em diálogo ----------
export interface Field {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime" | "select" | "textarea" | "bool" | "list";
  options?: Array<string | Opt>;
  required?: boolean;
  helper?: string;
  full?: boolean;
  /** Valor inicial quando o formulário abre sem registro. */
  def?: any;
}

function toInput(v: any, f: Field) {
  if (v === null || v === undefined) return f.type === "bool" ? false : "";
  if (f.type === "date") return String(v).slice(0, 10);
  if (f.type === "datetime") return String(v).slice(0, 16);
  if (f.type === "list") return Array.isArray(v) ? v.join(", ") : String(v);
  return v;
}

function buildBody(fields: Field[], form: Record<string, any>) {
  const body: Record<string, any> = {};
  for (const f of fields) {
    const v = form[f.key];
    if (f.type === "bool") { body[f.key] = Boolean(v); continue; }
    if (v === "" || v === undefined || v === null) continue;
    if (f.type === "number") body[f.key] = Number(v);
    else if (f.type === "date") body[f.key] = new Date(`${v}T12:00:00`).toISOString();
    else if (f.type === "datetime") body[f.key] = new Date(v).toISOString();
    else if (f.type === "list") body[f.key] = String(v).split(",").map((s) => s.trim()).filter(Boolean);
    else body[f.key] = v;
  }
  return body;
}

export function FormDialog({ open, title, fields, initial, submitLabel = "Salvar", onClose, onSubmit, intro }: {
  open: boolean; title: string; fields: Field[]; initial?: Record<string, any> | null; submitLabel?: string; intro?: ReactNode;
  onClose: () => void; onSubmit: (body: Record<string, any>) => Promise<any>;
}) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const f: Record<string, any> = {};
    fields.forEach((fd) => { f[fd.key] = toInput(initial && initial[fd.key] !== undefined ? initial[fd.key] : fd.def, fd); });
    setForm(f);
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  async function submit() {
    const faltando = fields.filter((f) => f.required && f.type !== "bool" && (form[f.key] === "" || form[f.key] === undefined || form[f.key] === null));
    if (faltando.length) { setErr(`Preencha: ${faltando.map((f) => f.label).join(", ")}.`); return; }
    setBusy(true);
    setErr(null);
    try { await onSubmit(buildBody(fields, form)); onClose(); } catch (e: any) { setErr(e?.message || "Falha ao salvar."); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>{title}</DialogTitle>
      <DialogContent dividers>
        {intro}
        {err ? <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert> : null}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, pt: 1 }}>
          {fields.map((f) => {
            const v = form[f.key] ?? "";
            if (f.type === "bool") {
              return <FormControlLabel key={f.key} control={<Checkbox checked={Boolean(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />} label={f.label} />;
            }
            const common = {
              size: "small" as const, label: f.label, value: v, required: f.required, helperText: f.helper, fullWidth: true,
              onChange: (e: any) => setForm({ ...form, [f.key]: e.target.value }),
              sx: { gridColumn: f.full || f.type === "textarea" ? { md: "1 / -1" } : undefined },
            };
            if (f.type === "select") {
              return (
                <TextField key={f.key} {...common} select>
                  <MenuItem value="">—</MenuItem>
                  {(f.options || []).map((o) => {
                    const ov = typeof o === "string" ? o : o.value;
                    return <MenuItem key={ov} value={ov}>{typeof o === "string" ? label(o) : o.label}</MenuItem>;
                  })}
                </TextField>
              );
            }
            if (f.type === "textarea") return <TextField key={f.key} {...common} multiline minRows={3} />;
            const ht = f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : "text";
            return <TextField key={f.key} {...common} type={ht} slotProps={ht === "date" || ht === "datetime-local" ? { inputLabel: { shrink: true } } : undefined} />;
          })}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={busy}>{busy ? "Enviando…" : submitLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------- elementos visuais ----------
export function Panel({ title, subtitle, actions, children, sx }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; sx?: any }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, ...sx }}>
      {(title || actions) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
          <Box sx={{ flex: 1, minWidth: 180 }}>
            {title ? <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography> : null}
            {subtitle ? <Typography variant="body2" color="text.secondary">{subtitle}</Typography> : null}
          </Box>
          {actions}
        </Box>
      )}
      {children}
    </Paper>
  );
}

type Tone = "default" | "success" | "warning" | "error" | "info";
const TONES: Record<Tone, string> = { default: "text.primary", success: "success.main", warning: "warning.main", error: "error.main", info: "info.main" };

export function Stat({ label: l, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{l}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, color: TONES[tone], lineHeight: 1.2, mt: 0.5, wordBreak: "break-word" }}>{value}</Typography>
      {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
    </Paper>
  );
}

export function StatGrid({ children, min = 170 }: { children: ReactNode; min?: number }) {
  return <Box sx={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 1.5, mb: 2 }}>{children}</Box>;
}

/** Barras horizontais simples (CSS puro). */
export function Bars({ items, format = (v: number) => num(v, 0), empty = "Sem dados no período." }: {
  items: Array<{ label: string; value: number; color?: string; hint?: string }>; format?: (v: number) => string; empty?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 0);
  if (!items.length || max <= 0) return <Typography variant="body2" color="text.secondary">{empty}</Typography>;
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      {items.map((i) => (
        <Box key={i.label}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
            <Typography variant="body2" noWrap title={i.label}>{i.label}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{format(i.value)}</Typography>
          </Box>
          <Box sx={{ height: 8, borderRadius: 4, bgcolor: "action.hover", overflow: "hidden" }}>
            <Box sx={{ height: "100%", width: `${Math.max(2, (i.value / max) * 100)}%`, bgcolor: i.color || "primary.main", borderRadius: 4 }} />
          </Box>
          {i.hint ? <Typography variant="caption" color="text.secondary">{i.hint}</Typography> : null}
        </Box>
      ))}
    </Box>
  );
}

export function ProgressBar({ value, color = "primary", showLabel = true }: { value: number; color?: "primary" | "success" | "warning" | "error"; showLabel?: boolean }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <LinearProgress variant="determinate" value={v} color={color} sx={{ flex: 1, height: 8, borderRadius: 4 }} />
      {showLabel ? <Typography variant="caption" sx={{ minWidth: 38, textAlign: "right", fontWeight: 700 }}>{num(v, 0)}%</Typography> : null}
    </Box>
  );
}

/** Semáforo: bolinha colorida + texto. */
export function Light({ tone, text }: { tone: "success" | "warning" | "error" | "default"; text?: string }) {
  const color = tone === "success" ? "#2e7d32" : tone === "warning" ? "#ed6c02" : tone === "error" ? "#d32f2f" : "#9e9e9e";
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
      <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: color, boxShadow: `0 0 0 3px ${color}33` }} />
      {text ? <Typography variant="body2">{text}</Typography> : null}
    </Box>
  );
}

export function Tag({ text, tone = "default" }: { text: ReactNode; tone?: "default" | "success" | "warning" | "error" | "info" }) {
  return <Chip size="small" color={tone === "default" ? "default" : tone} label={text} variant={tone === "default" ? "outlined" : "filled"} />;
}

/** Colunas de um quadro kanban. */
export function Kanban<T = any>({ columns, rows, groupBy, render, empty = "Vazio" }: {
  columns: Array<{ key: string; title: string; color?: string }>; rows: T[]; groupBy: (r: T) => string; render: (r: T) => ReactNode; empty?: string;
}) {
  return (
    <Box sx={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: { xs: "80%", md: "minmax(220px, 1fr)" }, gap: 1.5, overflowX: "auto", pb: 1 }}>
      {columns.map((c) => {
        const list = rows.filter((r) => groupBy(r) === c.key);
        return (
          <Box key={c.key} sx={{ bgcolor: "action.hover", borderRadius: 3, p: 1.25, minHeight: 120 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: c.color || "primary.main" }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, flex: 1 }}>{c.title}</Typography>
              <Chip size="small" label={list.length} />
            </Box>
            <Box sx={{ display: "grid", gap: 1 }}>
              {list.map((r, i) => <Paper key={i} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>{render(r)}</Paper>)}
              {!list.length && <Typography variant="caption" color="text.secondary">{empty}</Typography>}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** Navegação secundária (dentro de uma aba). */
export function SubNav({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: Array<{ key: string; label: string }> }) {
  return (
    <Box sx={{ overflowX: "auto", mb: 2 }}>
      <ToggleButtonGroup exclusive size="small" value={value} onChange={(_, v) => v && onChange(v)}>
        {items.map((i) => <ToggleButton key={i.key} value={i.key} sx={{ textTransform: "none", px: 2, fontWeight: 700 }}>{i.label}</ToggleButton>)}
      </ToggleButtonGroup>
    </Box>
  );
}

export function Empty({ text = "Nenhum registro." }: { text?: string }) {
  return <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{text}</Typography>;
}

/** Abre um HTML retornado por endpoint (relatórios imprimíveis) autenticado em nova aba. */
export async function openHtml(path: string) {
  const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Erro ${res.status} ao gerar o documento.`);
  const html = await res.text();
  const w = window.open("", "_blank");
  if (!w) throw new Error("O navegador bloqueou a nova aba.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}
