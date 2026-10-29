// Utilitários das telas de Campos de prática (reaproveita o kit visual de Desempenho/Jurídico).
import { Alert, Box, Button, Chip, LinearProgress, Typography } from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";
import { call, itemsOf, useApi, type Opt } from "../desempenho/kit";
import { readSessionUser } from "../../services/DemoAccess";

export { COLORS, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, StudentPicker, errMsg, fmtDate, fmtDateTime, fmtMoney, fmtNum, itemsOf, label, useApi, useRunner, useToast, type FormField, type Opt } from "../desempenho/kit";
export { ActionsMenu, DataList, type Col, type RowAction } from "../juridico/kit";

export const BASE = "/campos-pratica";
/** Chamada à API do módulo. */
export const cp = <T = any,>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) => call<T>(method, `${BASE}${path}`, body);
export const useCp = <T = any,>(path: string | null, deps: unknown[] = []) => useApi<T>(path ? `${BASE}${path}` : null, deps);

/** Perfil do usuário logado (só para mostrar/ocultar ações; a API valida de verdade). */
export function perfil() {
  const role = String(readSessionUser()?.role || "").toUpperCase();
  const gestor = ["ADMIN", "OWNER", "RECTOR", "BOARD", "COORDINATOR"].includes(role);
  const recepcao = gestor || ["SECRETARY", "STAFF"].includes(role);
  return { role, gestor, recepcao, secretaria: gestor || role === "SECRETARY", professor: role === "TEACHER", aluno: role === "STUDENT", operacao: recepcao || role === "TEACHER", escreveCampo: gestor || role === "TEACHER" };
}

export const hojeIso = () => new Date().toISOString().slice(0, 10);
export const dataIso = (d: string) => new Date(`${d}T12:00:00`).toISOString();
/** Converte "yyyy-MM-ddTHH:mm" local para ISO. */
export const dtIso = (d: string) => new Date(d).toISOString();
export const localInput = (ms: number) => { const d = new Date(ms); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const hora = (v: any) => (v ? new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

export function Aviso({ children, severity = "info" }: { children: ReactNode; severity?: "info" | "warning" | "success" | "error" }) {
  return <Alert severity={severity} sx={{ mb: 2 }}>{children}</Alert>;
}

export function Acoes({ children }: { children: ReactNode }) {
  return <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>{children}</Box>;
}

/** Botão que executa uma chamada com bloqueio de clique duplo. */
export function Btn({ children, onClick, color, variant = "outlined", size = "small", disabled }: { children: ReactNode; onClick: () => void | Promise<unknown>; color?: "primary" | "error" | "success" | "warning"; variant?: "outlined" | "contained" | "text"; size?: "small" | "medium"; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return <Button size={size} variant={variant} color={color} disabled={disabled || busy} onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}>{children}</Button>;
}

export const Etiqueta = ({ t, color = "default" }: { t: ReactNode; color?: "default" | "success" | "warning" | "error" | "info" }) => <Chip size="small" color={color} label={t} />;

export function Progresso({ valor, texto }: { valor: number; texto?: string }) {
  return (
    <Box sx={{ minWidth: 110 }}>
      <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, valor))} sx={{ height: 8, borderRadius: 4 }} />
      <Typography variant="caption" color="text.secondary">{texto ?? `${valor.toFixed(0)}%`}</Typography>
    </Box>
  );
}

export const corSeveridade = (s: string) => (s === "CRITICO" ? "error" : s === "ATENCAO" ? "warning" : "info") as "error" | "warning" | "info";

/** Opções de professores/coordenadores (orientador, supervisor). */
export function useEquipe() {
  const r = useApi<any>(`${BASE}/equipe`);
  const opts: Opt[] = itemsOf(r.data).map((u: any) => ({ value: u.id, label: u.nome }));
  return { opts, loading: r.loading };
}
export function useCursosOpts() {
  const r = useApi<any>("/academico/programs");
  return itemsOf(r.data).map((p: any) => ({ value: p.id, label: p.nome })) as Opt[];
}

/** Debounce simples para campos de busca. */
export function useDebounced<T>(v: T, ms = 300) {
  const [x, setX] = useState(v);
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return x;
}

export const AREAS: Opt[] = [
  { value: "PSICOLOGIA", label: "Psicologia" }, { value: "BIOMEDICINA", label: "Biomedicina" }, { value: "FONOAUDIOLOGIA", label: "Fonoaudiologia" },
  { value: "VETERINARIA", label: "Medicina Veterinária" }, { value: "ODONTOLOGIA", label: "Odontologia" }, { value: "MEDICINA", label: "Medicina" },
];
