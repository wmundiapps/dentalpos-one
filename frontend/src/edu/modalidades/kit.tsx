import { Box, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";
import { eduApi } from "../../services/EduApi";
import { Loadable, useAsync } from "../jornadas/common";

export { Loadable, useAsync };
export type Opt = { value: string; label: string };
export const itemsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.items || []);
export const fmtD = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
export const fmtDT = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

const cache: Record<string, Promise<Opt[]>> = {};
function useOptions(key: string, loader: () => Promise<Opt[]>) {
  const [opts, setOpts] = useState<Opt[]>([]);
  useEffect(() => {
    let on = true;
    if (!cache[key]) cache[key] = loader().catch(() => { delete cache[key]; return [] as Opt[]; });
    cache[key].then((o) => on && setOpts(o));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return opts;
}
export const usePrograms = () => useOptions("m-cursos", async () => itemsOf(await eduApi.get("/academico/programs?pageSize=200")).map((p: any) => ({ value: p.id, label: p.nome })));
export const useDisciplines = () => useOptions("m-disc", async () => itemsOf(await eduApi.get("/academico/disciplines?pageSize=300")).map((p: any) => ({ value: p.id, label: [p.codigo, p.nome].filter(Boolean).join(" — ") })));
export const useTerms = () => useOptions("m-terms", async () => itemsOf(await eduApi.get("/academico/terms?pageSize=100")).map((p: any) => ({ value: p.id, label: p.nome || p.codigo || p.id })));
export const usePolos = () => useOptions("m-polos", async () => itemsOf(await eduApi.get("/modalidades/polos?pageSize=200")).map((p: any) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` })));
export const useTutores = () => useOptions("m-tutores", async () => itemsOf(await eduApi.get("/modalidades/tutores?pageSize=200")).map((p: any) => ({ value: p.id, label: p.nome })));
export const useOfertas = () => useOptions("m-ofertas", async () => itemsOf(await eduApi.get("/modalidades/ofertas?pageSize=200")).map((p: any) => ({ value: p.id, label: `${p.modalidade} · ${p.id.slice(0, 6)}` })));
export const usePosProgramas = () => useOptions("m-pos", async () => itemsOf(await eduApi.get("/modalidades/pos/programas?pageSize=200")).map((p: any) => ({ value: p.id, label: p.nome })));
export const nameOf = (opts: Opt[], id?: string | null) => (id ? opts.find((o) => o.value === id)?.label || id : "—");

export function Card({ label, value, color, hint }: { label: string; value: ReactNode; color?: string; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, flex: "1 1 150px", minWidth: 150, borderLeft: `5px solid ${color || "#2563eb"}` }}>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
    </Paper>
  );
}

export function Section({ title, hint, actions, children }: { title: string; hint?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
          {hint ? <Typography variant="body2" color="text.secondary">{hint}</Typography> : null}
        </Box>
        {actions}
      </Box>
      {children}
    </Paper>
  );
}

/** Semáforo: VERDE/AMARELO/VERMELHO. */
export function Semaforo({ nivel, label }: { nivel: "ok" | "atencao" | "critico"; label?: string }) {
  const cor = nivel === "ok" ? "#16a34a" : nivel === "atencao" ? "#ca8a04" : "#dc2626";
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.8 }}>
      <Box sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: cor, boxShadow: `0 0 0 3px ${cor}33` }} />
      {label ? <Typography variant="body2" sx={{ fontWeight: 700 }}>{label}</Typography> : null}
    </Box>
  );
}

export function StatusChip({ v }: { v?: string | null }) {
  if (!v) return <>—</>;
  const u = v.toUpperCase();
  const color = /(CREDENCIADO|ATIV|CONCLU|REALIZ|APROV|PUBLIC|DEFEND|TITUL|ENCERRADO_OK)/.test(u) ? "success"
    : /(SUSPENS|CANCEL|DESCRED|REPROV|JUBIL|DESLIG|ESCALAD|CRITIC|ALTO)/.test(u) ? "error"
    : /(EM_|PEND|ABERT|AGEND|PLANEJ|ATENC|MEDIO)/.test(u) ? "warning" : "default";
  return <Chip size="small" color={color as any} label={v.replace(/_/g, " ")} />;
}

/** Tabela somente leitura alimentada por um GET. */
export function MiniTable({ url, columns, empty = "Nenhum registro.", pick }: {
  url: string; columns: Array<{ label: string; render: (r: any) => ReactNode; align?: "right" }>; empty?: string; pick?: (r: any) => any[];
}) {
  const { data, loading, error } = useAsync(() => eduApi.get(url), [url]);
  const rows = pick ? pick(data) : itemsOf(data);
  return (
    <Loadable loading={loading} error={error}>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead><TableRow>{columns.map((c) => <TableCell key={c.label} align={c.align} sx={{ fontWeight: 800 }}>{c.label}</TableCell>)}</TableRow></TableHead>
          <TableBody>
            {rows.map((r, i) => <TableRow key={r.id || i} hover>{columns.map((c) => <TableCell key={c.label} align={c.align}>{c.render(r)}</TableCell>)}</TableRow>)}
            {!rows.length && <TableRow><TableCell colSpan={columns.length}><Typography color="text.secondary" sx={{ py: 2, textAlign: "center" }}>{empty}</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Box>
    </Loadable>
  );
}

/** Abre um relatório HTML protegido (requer o token) em nova aba. */
export async function abrirHtml(path: string) {
  const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem("dentalpos.token") || ""}` } });
  if (!res.ok) throw new Error(`Erro ${res.status} ao gerar o relatório.`);
  const blob = new Blob([await res.text()], { type: "text/html;charset=utf-8" });
  window.open(URL.createObjectURL(blob), "_blank");
}
