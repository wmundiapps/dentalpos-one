import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment,
  MenuItem, Pagination, Paper, Snackbar, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { eduApi, qsOf } from "../services/EduApi";

export type FieldType = "text" | "number" | "date" | "datetime" | "select" | "textarea" | "bool" | "json-list";
export interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  options?: Array<string | { value: string; label: string }>;
  required?: boolean;
  /** Mostrar só na criação */
  createOnly?: boolean;
  helper?: string;
  /** Valor inicial na criação (ex.: true para flags com padrão ligado no banco) */
  defaultValue?: any;
}
export interface ColumnDef {
  key: string;
  label: string;
  render?: (row: any) => ReactNode;
  width?: number | string;
}
export interface RowAction {
  label: string;
  /** Caminho relativo, com :id (ex.: "/processos/:id/protocolar") */
  path: string;
  method?: "post" | "put" | "patch";
  confirm?: string;
  hidden?: (row: any) => boolean;
  color?: "primary" | "success" | "warning" | "error";
}

interface Props {
  title: string;
  /** Prefixo da API, ex.: "/regulatorio" */
  base: string;
  /** Caminho do recurso, ex.: "/processos" */
  resource: string;
  columns: ColumnDef[];
  fields: FieldDef[];
  searchable?: boolean;
  filters?: Array<{ key: string; label: string; options: string[] }>;
  rowActions?: RowAction[];
  readOnly?: boolean;
  canDelete?: boolean;
  dense?: boolean;
  description?: string;
}

const fmtDate = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "");
const fmtDateTime = (v: any) => (v ? new Date(v).toLocaleString("pt-BR") : "");

export function renderValue(v: any, type?: FieldType): ReactNode {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "date") return fmtDate(v);
  if (type === "datetime") return fmtDateTime(v);
  if (type === "bool" || typeof v === "boolean") return v ? "Sim" : "Não";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function toInput(v: any, type?: FieldType) {
  if (v === null || v === undefined) return "";
  if (type === "date") return String(v).slice(0, 10);
  if (type === "datetime") return String(v).slice(0, 16);
  if (type === "json-list") return Array.isArray(v) ? v.join(", ") : String(v);
  return v;
}

function fromInput(v: any, type?: FieldType) {
  if (v === "" || v === undefined) return undefined;
  if (type === "number") return Number(v);
  if (type === "date") return new Date(`${v}T12:00:00`).toISOString();
  if (type === "datetime") return new Date(v).toISOString();
  if (type === "json-list") return String(v).split(",").map((s) => s.trim()).filter(Boolean);
  return v;
}

/** Tela CRUD genérica para qualquer recurso criado com mountCrud no backend. */
export default function EduResourcePage(p: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [filterVals, setFilterVals] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const pageSize = 25;
  const url = `${p.base}${p.resource}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await eduApi.get(`${url}${qsOf({ page, pageSize, q, ...filterVals })}`);
      const items = Array.isArray(res) ? res : res.items || [];
      setRows(items);
      setTotal(Array.isArray(res) ? items.length : res.total ?? items.length);
    } catch (e: any) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [url, page, q, filterVals]);
  useEffect(() => { load(); }, [load]);

  const visibleFields = useMemo(() => p.fields.filter((f) => !(f.createOnly && editing?.id)), [p.fields, editing]);

  function openNew() {
    const f: Record<string, any> = {};
    p.fields.forEach((fd) => { if (fd.defaultValue !== undefined) f[fd.key] = fd.defaultValue; });
    setForm(f);
    setEditing({});
  }
  function openEdit(row: any) {
    const f: Record<string, any> = {};
    p.fields.forEach((fd) => { f[fd.key] = toInput(row[fd.key], fd.type); });
    setForm(f);
    setEditing(row);
  }

  async function save() {
    try {
      const body: Record<string, any> = {};
      visibleFields.forEach((fd) => {
        const v = fd.type === "bool" ? (form[fd.key] === undefined || form[fd.key] === "" ? undefined : Boolean(form[fd.key])) : fromInput(form[fd.key], fd.type);
        if (v !== undefined) body[fd.key] = v;
      });
      if (editing?.id) await eduApi.put(`${url}/${editing.id}`, body);
      else await eduApi.post(url, body);
      setEditing(null);
      setMsg({ type: "success", text: "Salvo com sucesso." });
      load();
    } catch (e: any) { setMsg({ type: "error", text: e.message }); }
  }

  async function remove(row: any) {
    if (!window.confirm("Remover este registro?")) return;
    try { await eduApi.del(`${url}/${row.id}`); load(); } catch (e: any) { setMsg({ type: "error", text: e.message }); }
  }

  async function runAction(a: RowAction, row: any) {
    if (a.confirm && !window.confirm(a.confirm)) return;
    try {
      await (eduApi as any)[a.method || "post"](`${p.base}${a.path.replace(":id", row.id)}`, {});
      setMsg({ type: "success", text: `${a.label}: concluído.` });
      load();
    } catch (e: any) { setMsg({ type: "error", text: e.message }); }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{p.title}</Typography>
          {p.description ? <Typography variant="body2" color="text.secondary">{p.description}</Typography> : null}
        </Box>
        {p.searchable !== false && (
          <TextField size="small" placeholder="Buscar…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        )}
        {(p.filters || []).map((f) => (
          <TextField key={f.key} select size="small" label={f.label} sx={{ minWidth: 150 }} value={filterVals[f.key] || ""}
            onChange={(e) => { setPage(1); setFilterVals({ ...filterVals, [f.key]: e.target.value }); }}>
            <MenuItem value="">Todos</MenuItem>
            {f.options.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
          </TextField>
        ))}
        {!p.readOnly && <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>Novo</Button>}
      </Box>

      <Box sx={{ overflowX: "auto" }}>
        <Table size={p.dense ? "small" : "medium"}>
          <TableHead>
            <TableRow>
              {p.columns.map((c) => <TableCell key={c.key} sx={{ fontWeight: 800, width: c.width }}>{c.label}</TableCell>)}
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} hover>
                {p.columns.map((c) => (
                  <TableCell key={c.key}>
                    {c.render ? c.render(r) : renderValue(r[c.key], p.fields.find((f) => f.key === c.key)?.type)}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  {(p.rowActions || []).filter((a) => !a.hidden?.(r)).map((a) => (
                    <Button key={a.label} size="small" color={a.color || "primary"} onClick={() => runAction(a, r)}>{a.label}</Button>
                  ))}
                  {!p.readOnly && <Tooltip title="Editar"><IconButton size="small" onClick={() => openEdit(r)}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
                  {!p.readOnly && p.canDelete !== false && <Tooltip title="Remover"><IconButton size="small" onClick={() => remove(r)}><DeleteOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow><TableCell colSpan={p.columns.length + 1}><Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{loading ? "Carregando…" : "Nenhum registro."}</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
      {total > pageSize && <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / pageSize)} page={page} onChange={(_, v) => setPage(v)} /></Box>}
      <Typography variant="caption" color="text.secondary">{total} registro(s)</Typography>

      <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="md">
        <DialogTitle>{editing?.id ? "Editar" : "Novo"} — {p.title}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, pt: 1 }}>
            {visibleFields.map((f) => {
              const v = form[f.key] ?? "";
              if (f.type === "bool") {
                return <FormControlLabel key={f.key} control={<Checkbox checked={Boolean(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />} label={f.label} />;
              }
              const common = { size: "small" as const, label: f.label, value: v, required: f.required, helperText: f.helper, fullWidth: true,
                onChange: (e: any) => setForm({ ...form, [f.key]: e.target.value }) };
              if (f.type === "select") {
                return (
                  <TextField key={f.key} {...common} select>
                    <MenuItem value="">—</MenuItem>
                    {(f.options || []).map((o) => {
                      const ov = typeof o === "string" ? o : o.value;
                      return <MenuItem key={ov} value={ov}>{typeof o === "string" ? o : o.label}</MenuItem>;
                    })}
                  </TextField>
                );
              }
              if (f.type === "textarea") return <TextField key={f.key} {...common} multiline minRows={3} sx={{ gridColumn: { md: "1 / -1" } }} />;
              const htmlType = f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : "text";
              return <TextField key={f.key} {...common} type={htmlType} slotProps={htmlType === "date" || htmlType === "datetime-local" ? { inputLabel: { shrink: true } } : undefined} />;
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancelar</Button>
          <Button variant="contained" onClick={save}>Salvar</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Paper>
  );
}

export function StatusChip({ value }: { value?: string | null }) {
  if (!value) return <>—</>;
  const v = value.toUpperCase();
  const color = /(CONCLU|APROV|DEFER|ATIV|PUBLIC|PAGO|ENTREG|VIGENTE|OK|ABERT)/.test(v) ? "success"
    : /(ATRAS|REJEIT|INDEFER|CANCEL|FALHA|CRITIC|VENCID|REPROV)/.test(v) ? "error"
    : /(PEND|AGUARD|ANALISE|DILIG|RASCUN|EM_)/.test(v) ? "warning" : "default";
  return <Chip size="small" color={color as any} label={value.replace(/_/g, " ")} />;
}
