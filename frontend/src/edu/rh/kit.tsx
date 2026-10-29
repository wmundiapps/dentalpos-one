// Utilitários das telas de RH do EduMaster (reaproveita o kit visual de Desempenho/Apoio).
import { Alert, Box, Button, Card, CardContent, Chip, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import { useState, type ReactNode } from "react";
import { call, itemsOf, useApi, type Opt } from "../desempenho/kit";

export { COLORS, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, fmtDate, fmtDateTime, fmtMoney, fmtNum, itemsOf, label, useApi, useRunner, useToast, errMsg, type FormField, type Opt } from "../desempenho/kit";

/** Chamada à API do RH (prefixo /rh). */
export const rh = <T = any,>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) => call<T>(method, `/rh${path}`, body);
export const useRh = <T = any,>(path: string | null, deps: unknown[] = []) => useApi<T>(path ? `/rh${path}` : null, deps);

export const fmtMin = (m: number | null | undefined) => { if (m === null || m === undefined) return "—"; const s = m < 0 ? "-" : ""; const a = Math.abs(Math.round(m)); return `${s}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`; };
export const hojeMes = () => new Date().toISOString().slice(0, 7);
export const mesAnterior = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
export const dataIso = (d: string) => new Date(`${d}T12:00:00`).toISOString();

export interface Col<T> { h: string; r: (row: T) => ReactNode; hideMobile?: boolean }
/** Tabela responsiva: no celular vira lista de cartões (rótulo: valor). */
export function Tabela<T extends { id?: string }>({ cols, rows, onRow, vazio = "Nenhum registro." }: { cols: Col<T>[]; rows: T[]; onRow?: (r: T) => void; vazio?: string }) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));
  if (!rows.length) return <Typography color="text.secondary" sx={{ py: 2, textAlign: "center" }}>{vazio}</Typography>;
  if (mobile) {
    return (
      <Box sx={{ display: "grid", gap: 1 }}>
        {rows.map((row, i) => (
          <Card key={row.id ?? i} variant="outlined" onClick={onRow ? () => onRow(row) : undefined} sx={{ cursor: onRow ? "pointer" : undefined }}>
            <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
              {cols.filter((c) => !c.hideMobile).map((c) => (
                <Box key={c.h} sx={{ display: "flex", justifyContent: "space-between", gap: 1, py: 0.25 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{c.h}</Typography>
                  <Box sx={{ textAlign: "right", fontSize: 14 }}>{c.r(row)}</Box>
                </Box>
              ))}
            </CardContent>
          </Card>
        ))}
      </Box>
    );
  }
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead><TableRow>{cols.map((c) => <TableCell key={c.h} sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>{c.h}</TableCell>)}</TableRow></TableHead>
        <TableBody>{rows.map((row, i) => <TableRow key={row.id ?? i} hover onClick={onRow ? () => onRow(row) : undefined} sx={{ cursor: onRow ? "pointer" : undefined }}>{cols.map((c) => <TableCell key={c.h}>{c.r(row)}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </Box>
  );
}

/** Opções de colaboradores (RH/gestor). */
export function useColabs(extra = "") {
  const r = useApi<any>(`/rh/colaboradores?pageSize=200${extra}`);
  const opts: Opt[] = itemsOf(r.data).map((c: any) => ({ value: c.id, label: `${c.nome}${c.matricula ? ` (${c.matricula})` : ""}` }));
  return { opts, data: itemsOf(r.data), loading: r.loading, error: r.error };
}

export function Aviso({ children }: { children: ReactNode }) { return <Alert severity="info" sx={{ mb: 2 }}>{children}</Alert>; }
export const ModeloAviso = () => <Alert severity="warning" sx={{ mb: 2 }}>Cálculos trabalhistas e tributários são <b>modelos simplificados a validar por contador</b>; não substituem eSocial, TRCT nem convenção coletiva.</Alert>;

export function MesField({ value, onChange, label = "Competência" }: { value: string; onChange: (v: string) => void; label?: string }) {
  return <TextField size="small" type="month" label={label} value={value} onChange={(e) => onChange(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 170 }} />;
}

export function Acoes({ children }: { children: ReactNode }) { return <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>{children}</Box>; }

/** Botão que executa uma chamada com confirmação opcional. */
export function Btn({ children, onClick, color, variant = "outlined", size = "small", disabled }: { children: ReactNode; onClick: () => void | Promise<unknown>; color?: "primary" | "error" | "success" | "warning"; variant?: "outlined" | "contained" | "text"; size?: "small" | "medium"; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return <Button size={size} variant={variant} color={color} disabled={disabled || busy} onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}>{children}</Button>;
}

export const Etiqueta = ({ t, color = "default" }: { t: ReactNode; color?: "default" | "success" | "warning" | "error" | "info" }) => <Chip size="small" color={color} label={t} />;

import { readSessionUser } from "../../services/DemoAccess";
/** Perfil do usuário logado para mostrar/ocultar ações (a API valida de verdade). */
export function perfil() {
  const role = String(readSessionUser()?.role || "").toUpperCase();
  const rhOk = ["ADMIN", "OWNER", "RECTOR", "BOARD", "HR"].includes(role);
  return { role, rh: rhOk, fin: role === "FINANCE", gestor: role === "COORDINATOR" };
}
