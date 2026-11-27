// Tabela paginada com busca e filtros para endpoints de listagem que não são CRUD genérico (workflows).
import { Alert, Box, Button, InputAdornment, MenuItem, Pagination, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { itemsOf } from "./kit";

export interface Col { key: string; label: string; render?: (r: any) => ReactNode; width?: number | string; align?: "left" | "right" | "center" }
export interface FilterDef { key: string; label: string; options: Array<string | { value: string; label: string }> }

export default function ListTable({ path, columns, filters = [], searchable = true, pageSize = 20, actions, toolbar, refreshKey = 0, dense = true, extraQuery, emptyText, onLoaded, rowSx }: {
  path: string;
  columns: Col[];
  filters?: FilterDef[];
  searchable?: boolean;
  pageSize?: number;
  /** Botões de ação por linha; recebe a função reload para atualizar após a operação. */
  actions?: (row: any, reload: () => void) => ReactNode;
  toolbar?: ReactNode;
  refreshKey?: number;
  dense?: boolean;
  extraQuery?: Record<string, any>;
  emptyText?: string;
  onLoaded?: (res: any) => void;
  rowSx?: (row: any) => any;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [fv, setFv] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const extraKey = JSON.stringify(extraQuery || {});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await eduApi.get(`${path}${qsOf({ page, pageSize, q: searchable ? q : undefined, ...fv, ...(extraQuery || {}) })}`);
      const items = itemsOf(res);
      setRows(items);
      setTotal(Array.isArray(res) ? items.length : res?.total ?? items.length);
      onLoaded?.(res);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar.");
      setRows([]);
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, page, pageSize, q, fv, extraKey, searchable]);
  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        {searchable && (
          <TextField size="small" placeholder="Buscar…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        )}
        {filters.map((f) => (
          <TextField key={f.key} select size="small" label={f.label} sx={{ minWidth: 150 }} value={fv[f.key] || ""} onChange={(e) => { setPage(1); setFv({ ...fv, [f.key]: e.target.value }); }}>
            <MenuItem value="">Todos</MenuItem>
            {f.options.map((o) => {
              const v = typeof o === "string" ? o : o.value;
              return <MenuItem key={v} value={v}>{typeof o === "string" ? o.replace(/_/g, " ") : o.label}</MenuItem>;
            })}
          </TextField>
        ))}
        <Box sx={{ flex: 1 }} />
        {toolbar}
      </Box>
      {error ? <Alert severity="warning" action={<Button size="small" onClick={load}>Tentar de novo</Button>} sx={{ mb: 2 }}>Não foi possível carregar a lista: {error}</Alert> : null}
      <Box sx={{ overflowX: "auto" }}>
        <Table size={dense ? "small" : "medium"}>
          <TableHead>
            <TableRow>
              {columns.map((c) => <TableCell key={c.key} align={c.align} sx={{ fontWeight: 800, width: c.width, whiteSpace: "nowrap" }}>{c.label}</TableCell>)}
              {actions ? <TableCell /> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id ?? i} hover sx={rowSx?.(r)}>
                {columns.map((c) => (
                  <TableCell key={c.key} align={c.align}>
                    {c.render ? c.render(r) : r[c.key] === null || r[c.key] === undefined || r[c.key] === "" ? "—" : String(r[c.key])}
                  </TableCell>
                ))}
                {actions ? <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{actions(r, load)}</TableCell> : null}
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow><TableCell colSpan={columns.length + (actions ? 1 : 0)}><Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{loading ? "Carregando…" : emptyText || "Nenhum registro."}</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
      {total > pageSize && <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / pageSize)} page={page} onChange={(_, v) => setPage(v)} /></Box>}
      <Typography variant="caption" color="text.secondary">{total} registro(s)</Typography>
    </Box>
  );
}
