// Kit do módulo Jurídico: lista responsiva (tabela no desktop, cartões no celular), aba de recurso genérica com filtros/CRUD,
// chip de vencimento (30/60/90), anexos (upload guard) e utilitários. Reaproveita o kit visual de desempenho.
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, Pagination, Paper,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useCallback, useState, type ReactNode } from "react";
import {
  COLORS, FormDialog, LoadBox, Pick, Section, Status, call, errMsg, fmtDate, fmtMoney, itemsOf, label, useApi, useRunner, useToast,
  type FormField, type Opt,
} from "../desempenho/kit";

export { COLORS, FormDialog, LoadBox, Pick, Section, Status, call, fmtDate, fmtMoney, itemsOf, label, useApi, useRunner, useToast };
export type { FormField, Opt };
export { Bar, Kpi, KpiRow, fmtDateTime, fmtPct, fmtNum } from "../desempenho/kit";

export const J = "/juridico";
export const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
export const AVISO_MODELO = "Textos, regras e sugestões deste módulo são modelos de apoio: valide com advogado antes de qualquer uso formal.";

export const opts = (xs: string[]): Opt[] => xs.map((x) => ({ value: x, label: label(x) }));
export const useIsMobile = () => useMediaQuery(useTheme().breakpoints.down("md"));
export const qstr = (o: Record<string, string | number | undefined | null>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

/** Chip do alerta de vencimento: ▲ vencido (vermelho) / até 30 d (laranja) / 60 d (amarelo) / 90 d (azul). */
export function AlertaChip({ alerta }: { alerta?: { dias: number | null; faixa: string | null } | null }) {
  if (!alerta || alerta.dias === null || alerta.faixa === null) return <>—</>;
  const m: Record<string, [string, string]> = { VENCIDO: [COLORS.bad, `vencido há ${Math.abs(alerta.dias)} d`], D30: ["#e07b00", `${alerta.dias} d`], D60: [COLORS.warn, `${alerta.dias} d`], D90: [COLORS.info, `${alerta.dias} d`], OK: [COLORS.ok, `${alerta.dias} d`] };
  const [bg, txt] = m[alerta.faixa] || [COLORS.mute, String(alerta.dias)];
  return <Chip size="small" sx={{ bgcolor: bg, color: "#fff", fontWeight: 700 }} label={txt} />;
}

export function NivelChip({ nivel }: { nivel?: string | null }) {
  if (!nivel) return <>—</>;
  const c = nivel === "CRITICO" ? COLORS.bad : nivel === "ALTO" ? "#e07b00" : nivel === "MEDIO" ? COLORS.warn : COLORS.ok;
  return <Chip size="small" sx={{ bgcolor: c, color: "#fff", fontWeight: 700 }} label={label(nivel)} />;
}

// ---------------------------------------------------------------- lista responsiva
export interface Col<T = any> { label: string; render: (r: T) => ReactNode; primary?: boolean; hideOnMobile?: boolean; align?: "right" }
export function DataList<T extends { id?: string }>({ rows, columns, actions, onRowClick }: { rows: T[]; columns: Array<Col<T>>; actions?: (r: T) => ReactNode; onRowClick?: (r: T) => void }) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.2 }}>
        {rows.map((r, i) => (
          <Paper key={r.id || i} variant="outlined" sx={{ p: 1.5, borderRadius: 3, cursor: onRowClick ? "pointer" : undefined }} onClick={() => onRowClick?.(r)}>
            {columns.filter((c) => c.primary).map((c) => <Box key={c.label} sx={{ fontWeight: 700, mb: 0.5 }}>{c.render(r)}</Box>)}
            {columns.filter((c) => !c.primary && !c.hideOnMobile).map((c) => (
              <Box key={c.label} sx={{ display: "flex", justifyContent: "space-between", gap: 1, py: 0.2, fontSize: 14 }}>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{c.label}</Typography>
                <Box sx={{ textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{c.render(r)}</Box>
              </Box>
            ))}
            {actions && <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>{actions(r)}</Box>}
          </Paper>
        ))}
      </Box>
    );
  }
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead><TableRow>{columns.map((c) => <TableCell key={c.label} align={c.align} sx={{ fontWeight: 800 }}>{c.label}</TableCell>)}{actions && <TableCell />}</TableRow></TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id || i} hover sx={{ cursor: onRowClick ? "pointer" : undefined }} onClick={() => onRowClick?.(r)}>
              {columns.map((c) => <TableCell key={c.label} align={c.align}>{c.render(r)}</TableCell>)}
              {actions && <TableCell align="right" sx={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>{actions(r)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export interface RowAction { label: string; onClick: () => void | Promise<void>; show?: boolean; color?: "error" | "inherit" }
/** Menu "⋮" com as ações da linha (cabe em telas pequenas). */
export function ActionsMenu({ items }: { items: RowAction[] }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const vis = items.filter((i) => i.show !== false);
  if (!vis.length) return null;
  return (
    <>
      <IconButton size="small" aria-label="Ações" onClick={(e) => setEl(e.currentTarget)}><MoreVertIcon /></IconButton>
      <Menu anchorEl={el} open={!!el} onClose={() => setEl(null)}>
        {vis.map((i) => <MenuItem key={i.label} sx={{ color: i.color === "error" ? "error.main" : undefined }} onClick={() => { setEl(null); void i.onClick(); }}>{i.label}</MenuItem>)}
      </Menu>
    </>
  );
}

// ---------------------------------------------------------------- formulário: pré-preenchimento
export function prefill(row: any, fields: FormField[]) {
  const v: Record<string, any> = { ...row };
  for (const f of fields) {
    const x = row?.[f.key];
    if (x === null || x === undefined) { delete v[f.key]; continue; }
    if (f.type === "date") v[f.key] = String(x).slice(0, 10);
    else if (f.type === "datetime") { const d = new Date(x); v[f.key] = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
    else if (f.type === "list" && Array.isArray(x)) v[f.key] = x.join(", ");
  }
  return v;
}

// ---------------------------------------------------------------- aba de recurso genérica (lista + filtros + criar/editar + ações)
export interface FilterDef { key: string; label: string; options: Opt[] }
export interface ResourceProps {
  title: string; path: string; columns: Array<Col>; fields: FormField[]; editFields?: FormField[]; filters?: FilterDef[]; vencimento?: boolean;
  rowActions?: (row: any, ctx: { reload: () => void; run: (fn: () => Promise<any>, ok?: string, confirm?: string) => Promise<any> }) => RowAction[];
  newLabel?: string; intro?: ReactNode; extraActions?: ReactNode; deletable?: boolean; editable?: boolean; defaults?: Record<string, any>; refreshKey?: number; pageSize?: number;
  toBody?: (b: Record<string, any>, row?: any) => Record<string, any>; fromRow?: (row: any) => Record<string, any>; onRowClick?: (row: any) => void; anexoRef?: string; extraQuery?: string;
  emptyText?: string; canCreate?: boolean;
}
export function ResourceTab(p: ResourceProps) {
  const [rev, setRev] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [venc, setVenc] = useState("");
  const [fv, setFv] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<null | { row?: any }>(null);
  const [anexo, setAnexo] = useState<any>(null);
  const { toast, node } = useToast();
  const reload = useCallback(() => setRev((x) => x + 1), []);
  const run = useRunner(toast, reload);
  const size = p.pageSize ?? 20;
  const url = `${J}${p.path}?${qstr({ page, pageSize: size, q, vencimento: venc, ...fv })}${p.extraQuery ? "&" + p.extraQuery : ""}`;
  const l = useApi<any>(url, [rev, p.refreshKey]);
  const rows = itemsOf(l.data);
  const edFields = p.editFields ?? p.fields;
  const acoes = (row: any): RowAction[] => [
    ...(p.editable === false ? [] : [{ label: "Editar", onClick: () => setEdit({ row }) }]),
    ...(p.rowActions ? p.rowActions(row, { reload, run }) : []),
    ...(p.anexoRef ? [{ label: "Anexos", onClick: () => setAnexo(row) }] : []),
    ...(p.deletable ? [{ label: "Excluir", color: "error" as const, onClick: () => { void run(() => call("DELETE", `${J}${p.path}/${row.id}`), "Excluído.", "Excluir este registro?"); } }] : []),
  ];
  return (
    <Section title={p.title} actions={<>{p.extraActions}{p.canCreate !== false && <Button variant="contained" onClick={() => setEdit({})}>{p.newLabel ?? "Novo"}</Button>}</>}>
      {node}
      {p.intro}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <TextField size="small" label="Buscar" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} sx={{ flex: "1 1 180px", minWidth: 0 }} />
        {p.vencimento && <Pick label="Vencimento" value={venc} onChange={(v) => { setVenc(v); setPage(1); }} all="Todos" minWidth={150}
          options={[{ value: "30", label: "Até 30 dias" }, { value: "60", label: "Até 60 dias" }, { value: "90", label: "Até 90 dias" }, { value: "vencido", label: "Vencidos" }]} />}
        {(p.filters ?? []).map((f) => <Pick key={f.key} label={f.label} value={fv[f.key] ?? ""} onChange={(v) => { setFv((o) => ({ ...o, [f.key]: v })); setPage(1); }} options={f.options} all="Todos" minWidth={150} />)}
      </Box>
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText={p.emptyText} onRetry={l.reload}>
        <DataList rows={rows} columns={p.columns} onRowClick={p.onRowClick} actions={(r) => <ActionsMenu items={acoes(r)} />} />
        <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((l.data?.total ?? 0) / size))} page={page} onChange={(_, n) => setPage(n)} />
      </LoadBox>
      <FormDialog open={!!edit} title={edit?.row ? `Editar` : (p.newLabel ?? "Novo registro")} fields={edit?.row ? edFields : p.fields} maxWidth="md"
        initial={edit?.row ? { ...prefill(edit.row, edFields), ...(p.fromRow ? p.fromRow(edit.row) : {}) } : (p.defaults ?? {})}
        onClose={() => setEdit(null)}
        onSubmit={async (b) => {
          const body = p.toBody ? p.toBody(b, edit?.row) : b;
          if (edit?.row) await call("PUT", `${J}${p.path}/${edit.row.id}`, body); else await call("POST", `${J}${p.path}`, body);
          reload(); toast({ type: "success", text: "Salvo." });
        }} />
      {anexo && p.anexoRef && <AnexosDialog refType={p.anexoRef} refId={anexo.id} titulo={anexo.titulo || anexo.codigo || anexo.objeto || anexo.apolice || anexo.numeroCnj || ""} onClose={() => setAnexo(null)} />}
    </Section>
  );
}

// ---------------------------------------------------------------- anexos (passam pelo upload guard no servidor)
const MAX_BYTES = 2_000_000;
export async function baixarAnexo(id: string, nome: string) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${J}/anexos/${id}/download`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || `Erro ${res.status}`); }
  if ((res.headers.get("content-type") || "").includes("application/json")) { const j = await res.json(); window.open(j.url, "_blank", "noopener,noreferrer"); return; }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function AnexosDialog({ refType, refId, titulo, onClose }: { refType: string; refId: string; titulo?: string; onClose: () => void }) {
  const [rev, setRev] = useState(0);
  const [url, setUrl] = useState("");
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();
  const l = useApi<any>(`${J}/anexos?refType=${refType}&refId=${refId}`, [rev]);
  const run = useRunner(toast, () => setRev((x) => x + 1));
  async function enviarArquivo(f: File) {
    if (f.size > MAX_BYTES) { toast({ type: "error", text: "Arquivo acima de 2 MB: envie um link (https) do arquivo." }); return; }
    setBusy(true);
    try {
      const dataUrl: string = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error("Falha ao ler o arquivo.")); r.readAsDataURL(f); });
      await run(() => call("POST", `${J}/anexos`, { refType, refId, arquivoNome: f.name, mime: f.type || undefined, dataUrl }), "Arquivo anexado.");
    } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Anexos{titulo ? ` — ${titulo}` : ""}</DialogTitle>
      <DialogContent dividers>
        {node}
        <Alert severity="info" sx={{ mb: 2 }}>Os arquivos passam por verificação de tipo e segurança. Executáveis e scripts são recusados. Limite de 2 MB por arquivo (ou informe um link https).</Alert>
        <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhum anexo." onRetry={l.reload}>
          {itemsOf(l.data).map((a: any) => (
            <Box key={a.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.8, borderBottom: "1px solid", borderColor: "divider", flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 160 }}>
                <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{a.nome}</Typography>
                <Typography variant="caption" color="text.secondary">{a.mime || "—"}{a.tamanhoBytes ? ` · ${Math.round(a.tamanhoBytes / 1024)} KB` : ""} · {fmtDate(a.createdAt)}</Typography>
              </Box>
              <Button size="small" onClick={() => run(() => baixarAnexo(a.id, a.nome), "Download iniciado.")}>{a.url ? "Abrir" : "Baixar"}</Button>
              <Button size="small" color="error" onClick={() => run(() => call("DELETE", `${J}/anexos/${a.id}`), "Anexo removido.", "Remover este anexo?")}>Remover</Button>
            </Box>
          ))}
        </LoadBox>
        <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="outlined" component="label" disabled={busy}>{busy ? <CircularProgress size={18} /> : "Enviar arquivo"}
            <input hidden type="file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void enviarArquivo(f); }} />
          </Button>
        </Box>
        <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr auto" }, gap: 1 }}>
          <TextField size="small" label="Nome do arquivo (link)" value={nome} onChange={(e) => setNome(e.target.value)} />
          <TextField size="small" label="Link https" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button variant="contained" disabled={!url || !nome} onClick={() => run(async () => { await call("POST", `${J}/anexos`, { refType, refId, arquivoNome: nome, arquivoUrl: url }); setUrl(""); setNome(""); }, "Link anexado.")}>Anexar link</Button>
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

/** Pequeno diálogo para pedir um texto/valor antes de uma ação (motivo, percentual, data...). */
export function PromptDialog({ open, title, fields, onClose, onSubmit, intro, submitLabel, initial }: { initial?: Record<string, any>; open: boolean; title: string; fields: FormField[]; onClose: () => void; onSubmit: (b: Record<string, any>) => Promise<any>; intro?: ReactNode; submitLabel?: string }) {
  return <FormDialog open={open} title={title} fields={fields} initial={initial} onClose={onClose} onSubmit={onSubmit} maxWidth="sm" intro={intro} submitLabel={submitLabel ?? "Confirmar"} />;
}

/** Hook: carrega uma lista de opções {value,label} de um endpoint do módulo. */
export function useJurOptions(path: string, map: (r: any) => Opt) {
  const l = useApi<any>(`${J}${path}`);
  return itemsOf(l.data).map(map);
}

export const money = fmtMoney;
export { errMsg };
