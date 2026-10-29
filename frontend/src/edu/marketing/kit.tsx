// Kit do módulo Marketing: reaproveita o kit visual do Jurídico/Desempenho e acrescenta lista genérica com CRUD apontando para /marketing.
import { Box, Button, Pagination, TextField } from "@mui/material";
import { useCallback, useState, type ReactNode } from "react";
import {
  ActionsMenu, DataList, FormDialog, LoadBox, Pick, Section, Status, call, fmtDate, fmtMoney, itemsOf, label, opts, prefill, useApi, useRunner, useToast,
  type Col, type FormField, type Opt, type RowAction,
} from "../juridico/kit";

export { ActionsMenu, DataList, FormDialog, LoadBox, Pick, Section, Status, call, fmtDate, fmtMoney, itemsOf, label, opts, prefill, useApi, useRunner, useToast };
export type { Col, FormField, Opt, RowAction };
export { Bar, Kpi, KpiRow, COLORS, fmtDateTime, fmtPct, fmtNum } from "../desempenho/kit";
export const M = "/marketing";
export const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
export const PUBLIC_API = `${API}/public/edu/marketing`;
export const qstr = (o: Record<string, string | number | undefined | null>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export const ORIGENS = ["SITE", "INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK", "THREADS", "GOOGLE_ADS", "TWILIO_LIGACAO", "WHATSAPP", "EMAIL", "RADIO", "TV", "OUTDOOR", "PANFLETAGEM", "CONVENIO_EMPRESA", "CONVENIO_COLEGIO", "CONVENIO_PREFEITURA", "INDICACAO", "EVENTO", "BALCAO", "OUTRO"];
export const CANAIS = ["EMAIL", "SMS", "TELEGRAM", "WHATSAPP", "VOZ"];
export const REDES = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK", "THREADS"];
export const ETAPAS = ["NOVO", "CONTATO", "QUALIFICADO", "INSCRITO", "MATRICULADO", "PERDIDO"];

/** Baixa um CSV autenticado. */
export async function baixarCsv(path: string, nome: string) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || `Erro ${res.status}`); }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function svgUri(svg?: string | null) { return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : ""; }

export interface ListaProps {
  title: string; path: string; columns: Col[]; fields?: FormField[]; editFields?: FormField[]; filters?: Array<{ key: string; label: string; options: Opt[] }>;
  rowActions?: (row: any, ctx: { reload: () => void; run: (fn: () => Promise<any>, ok?: string, confirm?: string) => Promise<any> }) => RowAction[];
  newLabel?: string; intro?: ReactNode; extraActions?: ReactNode; defaults?: Record<string, any>; refreshKey?: number; pageSize?: number; editable?: boolean; deletable?: boolean; search?: boolean;
  toBody?: (b: Record<string, any>, row?: any) => Record<string, any>; onRowClick?: (row: any) => void; emptyText?: string; editMethod?: "PUT" | "PATCH"; embedded?: boolean;
}
/** Lista paginada com busca, filtros, criar/editar e ações por linha. */
export function Lista(p: ListaProps) {
  const [rev, setRev] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [fv, setFv] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<null | { row?: any }>(null);
  const { toast, node } = useToast();
  const reload = useCallback(() => setRev((x) => x + 1), []);
  const run = useRunner(toast, reload);
  const size = p.pageSize ?? 20;
  const l = useApi<any>(`${M}${p.path}${p.path.includes("?") ? "&" : "?"}${qstr({ page, pageSize: size, q: p.search === false ? "" : q, ...fv })}`, [rev, p.refreshKey]);
  const rows = itemsOf(l.data);
  const acoes = (row: any): RowAction[] => [
    ...(p.fields && p.editable !== false ? [{ label: "Editar", onClick: () => setEdit({ row }) }] : []),
    ...(p.rowActions ? p.rowActions(row, { reload, run }) : []),
    ...(p.deletable ? [{ label: "Excluir", color: "error" as const, onClick: () => { void run(() => call("DELETE", `${M}${p.path.split("?")[0]}/${row.id}`), "Excluído.", "Excluir este registro?"); } }] : []),
  ];
  const body = (
    <>
      {node}
      {p.intro}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        {p.search !== false && <TextField size="small" label="Buscar" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} sx={{ flex: "1 1 180px", minWidth: 0 }} />}
        {(p.filters ?? []).map((f) => <Pick key={f.key} label={f.label} value={fv[f.key] ?? ""} onChange={(v) => { setFv((o) => ({ ...o, [f.key]: v })); setPage(1); }} options={f.options} all="Todos" minWidth={150} />)}
      </Box>
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText={p.emptyText} onRetry={l.reload}>
        <DataList rows={rows} columns={p.columns} onRowClick={p.onRowClick} actions={(r) => <ActionsMenu items={acoes(r)} />} />
        <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((l.data?.total ?? rows.length) / size))} page={page} onChange={(_, n) => setPage(n)} />
      </LoadBox>
      {p.fields && (
        <FormDialog open={!!edit} title={edit?.row ? "Editar" : (p.newLabel ?? "Novo registro")} fields={edit?.row ? (p.editFields ?? p.fields) : p.fields}
          initial={edit?.row ? prefill(edit.row, p.editFields ?? p.fields) : (p.defaults ?? {})} onClose={() => setEdit(null)}
          onSubmit={async (b) => {
            const out = p.toBody ? p.toBody(b, edit?.row) : b;
            if (edit?.row) await call(p.editMethod ?? "PATCH", `${M}${p.path.split("?")[0]}/${edit.row.id}`, out); else await call("POST", `${M}${p.path.split("?")[0]}`, out);
            reload(); toast({ type: "success", text: "Salvo." });
          }} />
      )}
    </>
  );
  if (p.embedded) return <>{p.extraActions}{p.fields && <Button variant="contained" onClick={() => setEdit({})} sx={{ mb: 1.5 }}>{p.newLabel ?? "Novo"}</Button>}{body}</>;
  return <Section title={p.title} actions={<>{p.extraActions}{p.fields && <Button variant="contained" onClick={() => setEdit({})}>{p.newLabel ?? "Novo"}</Button>}</>}>{body}</Section>;
}
