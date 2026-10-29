import { Box, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, Typography, useMediaQuery, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { COLORS } from "../desempenho/kit";

export const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";

export const FAIXAS: Array<{ k: string; label: string; color: string }> = [
  { k: "A_VENCER", label: "A vencer", color: COLORS.info }, { k: "D1_30", label: "1-30 dias", color: "#7aa63a" },
  { k: "D31_60", label: "31-60 dias", color: COLORS.warn }, { k: "D61_90", label: "61-90 dias", color: "#e0701a" }, { k: "D90_MAIS", label: "90+ dias", color: COLORS.bad },
];
export const faixaInfo = (k?: string) => FAIXAS.find((f) => f.k === k) ?? FAIXAS[0];
export const CANAIS = [{ value: "WHATSAPP", label: "WhatsApp" }, { value: "SMS", label: "SMS" }, { value: "EMAIL", label: "E-mail" }, { value: "TELEGRAM", label: "Telegram" }, { value: "VOZ_IA", label: "Voz IA" }];
export const SEGMENTOS = [{ value: "TODOS", label: "Todos" }, { value: "GRADUACAO", label: "Graduação" }, { value: "POS", label: "Pós-graduação" }, { value: "EAD", label: "EAD" }];
export const ACOES = [{ value: "MENSAGEM", label: "Mensagem" }, { value: "NOTIFICACAO_EXTRAJUDICIAL", label: "Notificação extrajudicial" }, { value: "NEGATIVACAO", label: "Negativação (simulada)" }, { value: "PROTESTO", label: "Protesto (simulado)" }, { value: "JURIDICO", label: "Solicitação ao Jurídico" }];

export function FaixaChip({ faixa }: { faixa?: string }) {
  const f = faixaInfo(faixa);
  return <Chip size="small" label={f.label} sx={{ bgcolor: f.color, color: "#fff", fontWeight: 700 }} />;
}

/** Baixa um CSV protegido por token. */
export async function baixarCsv(path: string, nome: string) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || `Erro ${res.status}`); }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const qstr = (o: Record<string, unknown>) => {
  const u = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "" && v !== false) u.set(k, String(v)); });
  const s = u.toString();
  return s ? `?${s}` : "";
};

export interface Col<T> { key: string; label: string; render?: (r: T) => ReactNode; align?: "right" | "left"; sortable?: boolean; hideMobile?: boolean; minWidth?: number }

/** Tabela que vira lista de cartões no celular. */
export function ResponsiveTable<T extends { [k: string]: any }>({ rows, cols, rowKey, onRow, sort, dir, onSort, footer, empty = "Nenhum registro." }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; onRow?: (r: T) => void; sort?: string; dir?: "asc" | "desc"; onSort?: (k: string) => void; footer?: ReactNode; empty?: string;
}) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  if (!rows.length) return <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{empty}</Typography>;
  if (mobile) {
    const [main, ...rest] = cols;
    return (
      <Box sx={{ display: "grid", gap: 1 }}>
        {rows.map((r) => (
          <Paper key={rowKey(r)} variant="outlined" onClick={() => onRow?.(r)} sx={{ p: 1.5, borderRadius: 3, cursor: onRow ? "pointer" : "default" }}>
            <Box sx={{ fontWeight: 800, mb: 0.5 }}>{main.render ? main.render(r) : r[main.key]}</Box>
            {rest.filter((c) => !c.hideMobile).map((c) => (
              <Box key={c.key} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.2 }}>
                <Typography variant="caption" color="text.secondary">{c.label}</Typography>
                <Typography variant="body2" component="div" sx={{ textAlign: "right" }}>{c.render ? c.render(r) : (r[c.key] ?? "—")}</Typography>
              </Box>
            ))}
          </Paper>
        ))}
        {footer}
      </Box>
    );
  }
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {cols.map((c) => (
              <TableCell key={c.key} align={c.align} sx={{ whiteSpace: "nowrap", fontWeight: 800, minWidth: c.minWidth }}>
                {c.sortable && onSort ? <TableSortLabel active={sort === c.key} direction={sort === c.key ? dir : "asc"} onClick={() => onSort(c.key)}>{c.label}</TableSortLabel> : c.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={rowKey(r)} hover onClick={() => onRow?.(r)} sx={{ cursor: onRow ? "pointer" : "default" }}>
              {cols.map((c) => <TableCell key={c.key} align={c.align} sx={{ whiteSpace: c.minWidth ? "normal" : "nowrap" }}>{c.render ? c.render(r) : (r[c.key] ?? "—")}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
        {footer}
      </Table>
    </Box>
  );
}
