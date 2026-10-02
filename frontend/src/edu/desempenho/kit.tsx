// Utilitários visuais e de dados compartilhados pelas telas de Desempenho, Pesquisa e Apoio (EduMaster Pro).
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Paper, Snackbar, TextField, Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { eduApi } from "../../services/EduApi";

// ---------------------------------------------------------------- formatação
export const fmtDate = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
export const fmtDateTime = (v: any) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
export const fmtPct = (v: any, d = 1) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : `${Number(v).toFixed(d).replace(".", ",")}%`);
export const fmtNum = (v: any, d = 1) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(d).replace(".", ","));
export const fmtMoney = (v: any) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const label = (s?: string | null) => (s ? s.replace(/_/g, " ") : "—");
export const itemsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.items || []);
export const errMsg = (e: any) => (e?.message ? String(e.message) : "Não foi possível concluir a operação.");

// ---------------------------------------------------------------- dados
export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!path) { setData(null); setLoading(false); setError(null); return; }
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const r = await eduApi.get<T>(path);
      if (id === seq.current) setData(r);
    } catch (e: any) {
      if (id === seq.current) { setError(errMsg(e)); setData(null); }
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload };
}

export interface Opt { value: string; label: string }
/** Carrega uma lista de opções (exames, cursos, turmas...) tolerando falhas. */
export function useOptions(path: string, map: (r: any) => Opt) {
  const { data } = useApi<any>(path);
  return itemsOf(data).map(map);
}
export const useExames = () => useOptions("/desempenho/exames?pageSize=100", (r) => ({ value: r.id, label: r.nome }));
export const useCursos = () => useOptions("/academico/programs", (r) => ({ value: r.id, label: r.nome }));
export const useTurmas = () => useOptions("/academico/class-sections", (r) => ({ value: r.id, label: `${r.nome}${r.discipline?.nome ? " — " + r.discipline.nome : ""}` }));

/** Mensagens rápidas (snackbar). */
export function useToast() {
  const [msg, setMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const node = (
    <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
      {msg ? <Alert severity={msg.type} onClose={() => setMsg(null)} sx={{ whiteSpace: "pre-line" }}>{msg.text}</Alert> : undefined}
    </Snackbar>
  );
  return { toast: setMsg, node };
}

/** Executa uma ação (com confirmação opcional) e mostra o resultado. */
export function useRunner(toast: (m: { type: "success" | "error" | "info"; text: string }) => void, after?: () => void) {
  return useCallback(async (fn: () => Promise<any>, okText = "Concluído.", confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return null;
    try {
      const r = await fn();
      toast({ type: "success", text: okText });
      after?.();
      return r ?? true;
    } catch (e: any) {
      const pend = (e as any)?.pendencias;
      toast({ type: "error", text: errMsg(e) + (Array.isArray(pend) ? "\n• " + pend.join("\n• ") : "") });
      return null;
    }
  }, [toast, after]);
}

// ---------------------------------------------------------------- apresentação
export function LoadBox({ loading, error, empty, emptyText = "Nenhum registro.", onRetry, children }: {
  loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string; onRetry?: () => void; children: ReactNode;
}) {
  if (loading) return <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Box>;
  if (error) return <Alert severity="warning" action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Tentar de novo</Button> : undefined}>{error}</Alert>;
  if (empty) return <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{emptyText}</Typography>;
  return <>{children}</>;
}

export function Kpi({ title, value, hint, color }: { title: string; value: ReactNode; hint?: string; color?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, minWidth: 150, flex: "1 1 150px", borderLeft: color ? `5px solid ${color}` : undefined }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase" }}>{title}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>{value}</Typography>
      {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
    </Paper>
  );
}
export const KpiRow = ({ children }: { children: ReactNode }) => <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>{children}</Box>;

export const Section = ({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) => (
  <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, mb: 2 }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
      <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>{title}</Typography>
      {actions}
    </Box>
    {children}
  </Paper>
);

export const COLORS = { ok: "#2e9e5b", warn: "#e0a100", bad: "#d64545", info: "#0F5FDB", mute: "#94a3b8" };
/** Semáforo por percentual (verde >=60, amarelo 40-60, vermelho <40) ou conforme limites. */
export function semaforo(v: number | null | undefined, ok = 60, warn = 40) {
  if (v === null || v === undefined) return COLORS.mute;
  return v >= ok ? COLORS.ok : v >= warn ? COLORS.warn : COLORS.bad;
}

export function Bar({ value, max = 100, color, label: lbl, right, meta }: { value: number | null | undefined; max?: number; color?: string; label?: ReactNode; right?: ReactNode; meta?: number | null }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const mp = meta == null ? null : Math.max(0, Math.min(100, (meta / (max || 1)) * 100));
  return (
    <Box sx={{ mb: 1 }}>
      {(lbl || right) && (
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{lbl}</Typography>
          <Typography variant="body2" color="text.secondary">{right}</Typography>
        </Box>
      )}
      <Box sx={{ position: "relative", height: 10, bgcolor: "action.hover", borderRadius: 5, overflow: "hidden" }}>
        <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: color || COLORS.info, borderRadius: 5 }} />
        {mp != null && <Box sx={{ position: "absolute", left: `${mp}%`, top: 0, bottom: 0, width: 2, bgcolor: "text.primary" }} />}
      </Box>
    </Box>
  );
}

/** Gráfico de linha simples em SVG. */
export function Sparkline({ values, width = 320, height = 90, color = COLORS.info, labels }: { values: Array<number | null | undefined>; width?: number; height?: number; color?: string; labels?: string[] }) {
  const v = values.map((x) => (x == null ? null : Number(x)));
  const nums = v.filter((x): x is number => x !== null);
  if (nums.length < 1) return <Typography variant="caption" color="text.secondary">Sem dados para o gráfico.</Typography>;
  const min = Math.min(0, ...nums), max = Math.max(100, ...nums);
  const pad = 8, w = width - pad * 2, h = height - pad * 2;
  const pts = v.map((x, i) => (x == null ? null : [pad + (v.length === 1 ? w / 2 : (i / (v.length - 1)) * w), pad + h - ((x - min) / (max - min || 1)) * h] as const));
  const path = pts.filter(Boolean).map((p, i) => `${i ? "L" : "M"}${p![0].toFixed(1)},${p![1].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }} role="img" aria-label="Evolução">
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {pts.map((p, i) => p && (
        <g key={i}><circle cx={p[0]} cy={p[1]} r={3.5} fill={color} /><title>{`${labels?.[i] ?? i + 1}: ${fmtNum(v[i])}`}</title></g>
      ))}
    </svg>
  );
}

export const Dot = ({ color }: { color: string }) => <Box component="span" sx={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", bgcolor: color, mr: 0.8 }} />;

/** Chip de status com cor por convenção. */
export function Status({ value }: { value?: string | null }) {
  if (!value) return <>—</>;
  const v = value.toUpperCase();
  const color = /(CONCLU|APROV|DEFER|ATIV|PUBLIC|PAGO|ENTREG|REALIZ|RESOLV|REGULAR|CORRIG|ACEIT|DEPOSIT|ENCERRAD|RESPOND|INSCRIT|META)/.test(v) && !/(INDEFER|REPROV)/.test(v) ? "success"
    : /(ATRAS|REJEIT|INDEFER|CANCEL|FALHA|CRITIC|VENCID|REPROV|IRREGULAR|EVADIU|RECUS|FALTOU|URGENTE|ALTO|ARQUIV|RETIRAD)/.test(v) ? "error"
    : /(PEND|AGUARD|ANALISE|AVALIA|RASCUN|EM_|REVIS|ABERT|AGENDAD|TRIAGEM|SUBMET|RECEB|MEDIO|ALTA)/.test(v) ? "warning" : "default";
  return <Chip size="small" color={color as any} label={value.replace(/_/g, " ")} />;
}

// ---------------------------------------------------------------- formulários
export interface FormField {
  key: string; label: string;
  type?: "text" | "number" | "date" | "datetime" | "select" | "textarea" | "bool" | "list" | "student";
  options?: Array<string | Opt>;
  required?: boolean; helper?: string; full?: boolean; hidden?: (v: Record<string, any>) => boolean;
}

function toBody(fields: FormField[], v: Record<string, any>) {
  const body: Record<string, any> = {};
  for (const f of fields) {
    if (f.hidden?.(v)) continue;
    const x = v[f.key];
    if (f.type === "bool") { body[f.key] = Boolean(x); continue; }
    if (x === "" || x === undefined || x === null) continue;
    if (f.type === "number") body[f.key] = Number(x);
    else if (f.type === "date") body[f.key] = new Date(`${x}T12:00:00`).toISOString();
    else if (f.type === "datetime") body[f.key] = new Date(x).toISOString();
    else if (f.type === "list") body[f.key] = String(x).split(",").map((s) => s.trim()).filter(Boolean);
    else body[f.key] = x;
  }
  return body;
}

/** Seleção de aluno com busca; se a busca não estiver disponível ao papel, aceita o ID. */
export function StudentPicker({ value, onChange, label: lbl = "Aluno", required }: { value: string; onChange: (id: string) => void; label?: string; required?: boolean }) {
  const [opts, setOpts] = useState<Array<{ id: string; nome: string; ra: string }>>([]);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (failed) return;
    const t = setTimeout(async () => {
      try {
        const r = await eduApi.get(`/academico/students?pageSize=20&q=${encodeURIComponent(q)}`);
        setOpts(itemsOf(r).map((s: any) => ({ id: s.id, nome: s.nomeCompleto, ra: s.ra })));
      } catch { setFailed(true); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, failed]);
  if (failed) return <TextField size="small" fullWidth label={`${lbl} (ID)`} value={value} required={required} onChange={(e) => onChange(e.target.value)} helperText="Busca de alunos indisponível para o seu perfil: informe o ID do aluno." />;
  const cur = opts.find((o) => o.id === value) || null;
  return (
    <Autocomplete size="small" options={opts} value={cur} filterOptions={(x) => x} noOptionsText="Digite para buscar" getOptionLabel={(o) => `${o.nome} (${o.ra})`}
      isOptionEqualToValue={(a, b) => a.id === b.id} onInputChange={(_, v) => setQ(v)} onChange={(_, o) => onChange(o?.id || "")}
      renderInput={(p) => <TextField {...p} label={lbl} required={required} />} />
  );
}

export function FormDialog({ open, title, fields, initial, submitLabel = "Salvar", intro, onClose, onSubmit, maxWidth = "md", onValues }: {
  open: boolean; title: string; fields: FormField[]; initial?: Record<string, any>; submitLabel?: string; intro?: ReactNode;
  onClose: () => void; onSubmit: (body: Record<string, any>, raw: Record<string, any>) => Promise<any>; maxWidth?: "sm" | "md" | "lg";
  /** Avisa a cada mudança de valores (para opções dependentes, ex.: eixos do exame escolhido). */
  onValues?: (v: Record<string, any>) => void;
}) {
  const [v, setV] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setV(initial || {}); setErr(null); } }, [open]);
  useEffect(() => { if (open) onValues?.(v); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, v]);
  const set = (k: string, x: any) => setV((p) => ({ ...p, [k]: x }));
  async function go() {
    const falta = fields.find((f) => f.required && !f.hidden?.(v) && f.type !== "bool" && (v[f.key] === undefined || v[f.key] === ""));
    if (falta) { setErr(`Preencha: ${falta.label}.`); return; }
    setBusy(true); setErr(null);
    try { await onSubmit(toBody(fields, v), v); onClose(); }
    catch (e: any) {
      const pend = e?.pendencias;
      setErr(errMsg(e) + (Array.isArray(pend) ? " — " + pend.join(" · ") : ""));
    } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={maxWidth}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {intro}
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, pt: 1 }}>
          {fields.filter((f) => !f.hidden?.(v)).map((f) => {
            const full = { gridColumn: f.full || f.type === "textarea" ? { md: "1 / -1" } : undefined };
            if (f.type === "bool") return <FormControlLabel key={f.key} sx={full} control={<Checkbox checked={Boolean(v[f.key])} onChange={(e) => set(f.key, e.target.checked)} />} label={f.label} />;
            if (f.type === "student") return <Box key={f.key} sx={full}><StudentPicker value={v[f.key] || ""} onChange={(id) => set(f.key, id)} label={f.label} required={f.required} /></Box>;
            const common = { size: "small" as const, fullWidth: true, label: f.label, required: f.required, helperText: f.helper, value: v[f.key] ?? "", onChange: (e: any) => set(f.key, e.target.value), sx: full };
            if (f.type === "select") {
              return (
                <TextField key={f.key} {...common} select>
                  {!f.required && <MenuItem value="">—</MenuItem>}
                  {(f.options || []).map((o) => { const ov = typeof o === "string" ? o : o.value; return <MenuItem key={ov} value={ov}>{typeof o === "string" ? label(o) : o.label}</MenuItem>; })}
                </TextField>
              );
            }
            if (f.type === "textarea") return <TextField key={f.key} {...common} multiline minRows={3} />;
            const t = f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : "text";
            return <TextField key={f.key} {...common} type={t} helperText={f.type === "list" ? (f.helper || "Separe por vírgulas") : f.helper} slotProps={t === "date" || t === "datetime-local" ? { inputLabel: { shrink: true } } : undefined} />;
          })}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" onClick={go} disabled={busy}>{busy ? "Enviando…" : submitLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Seletor simples (TextField select) com opções {value,label}. */
export function Pick({ label: lbl, value, onChange, options, minWidth = 200, all }: { label: string; value: string; onChange: (v: string) => void; options: Opt[]; minWidth?: number; all?: string }) {
  return (
    <TextField select size="small" label={lbl} value={value} onChange={(e) => onChange(e.target.value)} sx={{ minWidth }}>
      {all !== undefined && <MenuItem value="">{all}</MenuItem>}
      {options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
    </TextField>
  );
}

/** Abre HTML retornado pelo backend (relatórios/atas) em nova aba, enviando o token. */
export async function openHtml(path: string) {
  const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || `Erro ${res.status}`); }
  const html = await res.text();
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(url, "_blank");
}

/** Chamada à API que preserva a lista de pendências (HTTP 422) devolvida pelo backend nos fluxos de transição. */
export async function call<T = any>(method: "POST" | "PUT" | "PATCH" | "DELETE" | "GET", path: string, body?: unknown): Promise<T> {
  const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${path}`, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Erro ${res.status}`), { status: res.status, pendencias: data?.pendencias });
  return data as T;
}

/** Quadro kanban somente-leitura: colunas por status, cartões clicáveis. */
export function Kanban<T extends { id: string }>({ columns, items, getCol, title, subtitle, meta, onOpen, colors }: {
  columns: string[]; items: T[]; getCol: (i: T) => string; title: (i: T) => ReactNode; subtitle?: (i: T) => ReactNode; meta?: (i: T) => ReactNode;
  onOpen?: (i: T) => void; colors?: Record<string, string>;
}) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 1, alignItems: "flex-start" }}>
      {columns.map((c) => {
        const col = items.filter((i) => getCol(i) === c);
        return (
          <Paper key={c} variant="outlined" sx={{ minWidth: 235, width: 235, flex: "0 0 auto", p: 1, borderRadius: 3, bgcolor: "action.hover", borderTop: `4px solid ${colors?.[c] || COLORS.info}` }}>
            <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", display: "flex", justifyContent: "space-between", px: 0.5, pb: 0.5 }}>
              <span>{label(c)}</span><span>{col.length}</span>
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 460, overflowY: "auto" }}>
              {col.map((i) => (
                <Paper key={i.id} onClick={() => onOpen?.(i)} sx={{ p: 1.2, borderRadius: 2, cursor: onOpen ? "pointer" : "default", "&:hover": onOpen ? { boxShadow: 3 } : undefined }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.25 }}>{title(i)}</Typography>
                  {subtitle && <Typography variant="caption" color="text.secondary" component="div">{subtitle(i)}</Typography>}
                  {meta && <Box sx={{ mt: 0.5 }}>{meta(i)}</Box>}
                </Paper>
              ))}
              {!col.length && <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>—</Typography>}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
