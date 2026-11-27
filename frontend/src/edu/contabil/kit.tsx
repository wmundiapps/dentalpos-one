// Kit do bloco ESCRITÓRIO DE CONTABILIDADE (portátil). Único acoplamento com o sistema hospedeiro: `eduApi` (cliente HTTP autenticado)
// e a chave do token em localStorage — troque apenas este arquivo para plugar em outro sistema (ver backend/src/modules/contabil/README.md).
import { Alert, Box, Button, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { eduApi } from "../../services/EduApi";

export const C = "/contabil";
export const api = eduApi;
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export const AVISO_LEGAL = "Este sistema não substitui um contador. Cálculos e guias são estimativas/simulações; valide com seu contador antes de enviar ou pagar. Seus dados são tratados conforme a LGPD.";

export const brl = (n?: number | null) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const pct = (n?: number | null, c = 2) => (n == null ? "—" : `${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c })}%`);
export const data = (v?: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "—");
export const dataHora = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
export const isoDia = (n = 0) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
export const comp = (n = 0) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
export const errMsg = (e: any) => (e?.message ? String(e.message) : "Não foi possível concluir a operação.");
export const fmtDoc = (v?: string | null) => {
  const d = String(v ?? "").replace(/\D+/g, "");
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return v ?? "—";
};
/** Número digitado em formato brasileiro ("1.234,56") ou simples. */
export const numero = (s: string) => { const t = String(s).trim().replace(/\s|R\$/g, ""); if (!t) return NaN; const x = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t; return Number(x); };

export const REGIMES: Record<string, string> = { MEI: "MEI", SIMPLES: "Simples Nacional", PRESUMIDO: "Lucro Presumido", REAL: "Lucro Real" };
export const SITUACAO_COR: Record<string, "default" | "success" | "warning" | "error" | "info" | "primary"> = {
  ABERTO: "info", VENCIDO: "error", PAGO: "success", PAGA: "success", CANCELADO: "default", CANCELADA: "default", PENDENTE: "warning", ATRASADA: "error", A_GERAR: "warning",
  EMITIDA: "success", IMPORTADA: "info", CONCILIADO: "success", AJUSTADO: "info", IGNORADO: "default", EMITIDO: "success", SIMULADO: "warning",
};
export const Situacao = ({ v }: { v?: string | null }) => (v ? <Chip size="small" color={SITUACAO_COR[v] ?? "default"} variant={SITUACAO_COR[v] ? "filled" : "outlined"} label={v.replace(/_/g, " ").toLowerCase()} sx={{ textTransform: "capitalize" }} /> : <>—</>);
export const SimulacaoChip = ({ texto = "SIMULAÇÃO" }: { texto?: string }) => <Chip size="small" color="warning" variant="outlined" label={texto} sx={{ fontWeight: 800 }} />;

// ---------------- identidade (papel e permissões) ----------------
export interface Eu { papel: "GESTOR" | "CONTADOR" | "FINANCEIRO" | "LEITOR"; permissoes: string[]; instituicao: string; sistema: string; aviso: string }
export const NOME_PAPEL: Record<string, string> = { GESTOR: "Gestor", CONTADOR: "Contador", FINANCEIRO: "Financeiro", LEITOR: "Leitura" };
interface Ctx { eu: Eu | null; empresaId: string; empresas: any[]; recarregarEmpresas: () => void; pode: (p: string) => boolean }
export const ContabilCtx = createContext<Ctx>({ eu: null, empresaId: "", empresas: [], recarregarEmpresas: () => undefined, pode: () => false });
export const useContabil = () => useContext(ContabilCtx);

// ---------------- estados de tela ----------------
export function useApi<T = any>(path: string | null, deps: any[] = []) {
  const [d, setD] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);
  const load = useCallback(async (silencioso = false) => {
    if (!path) { setD(null); setLoading(false); return; }
    const n = ++seq.current;
    if (!silencioso) setLoading(true);
    try { const r = await api.get<T>(path); if (n === seq.current) { setD(r); setErr(null); } }
    catch (e) { if (n === seq.current) setErr(errMsg(e)); }
    finally { if (n === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { void load(); }, [load]);
  return { data: d, loading, err, reload: () => load(true) };
}

export function Estado({ loading, err, vazio, onRetry, children, textoVazio }: { loading: boolean; err: string | null; vazio?: boolean; onRetry?: () => void; children: ReactNode; textoVazio?: string }) {
  if (loading) return <Box sx={{ py: 5, textAlign: "center" }} role="status" aria-live="polite"><CircularProgress size={28} /><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Carregando…</Typography></Box>;
  if (err) return <Alert severity="error" action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Tentar de novo</Button> : undefined}>{err}</Alert>;
  if (vazio) return <Paper variant="outlined" sx={{ p: 4, textAlign: "center", color: "text.secondary" }}><Typography>{textoVazio ?? "Nada por aqui ainda."}</Typography></Paper>;
  return <>{children}</>;
}

export const Cartao = ({ titulo, acao, children, sx }: { titulo?: ReactNode; acao?: ReactNode; children: ReactNode; sx?: any }) => (
  <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, minWidth: 0, ...sx }}>
    {titulo || acao ? <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1.5, flexWrap: "wrap" }}><Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{titulo}</Typography>{acao}</Box> : null}
    {children}
  </Paper>
);

export function Indicador({ rotulo, valor, sub, cor }: { rotulo: string; valor: ReactNode; sub?: ReactNode; cor?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, borderLeft: 4, borderLeftColor: cor ?? "primary.main", minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{rotulo}</Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.25, fontSize: { xs: "1.05rem", sm: "1.12rem" }, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{valor}</Typography>
      {sub ? <Typography variant="caption" color="text.secondary">{sub}</Typography> : null}
    </Paper>
  );
}

export const Grade = ({ min = 210, children, gap = 1.5 }: { min?: number; children: ReactNode; gap?: number }) => <Box sx={{ display: "grid", gap, gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` }}>{children}</Box>;

/** Faixa FIXA de aviso: aparece em todas as telas do módulo. */
export function FaixaAviso() {
  return (
    <Alert severity="warning" icon={false} role="note" sx={{ position: "sticky", top: 0, zIndex: 20, mb: 1.5, py: 0.25, borderRadius: 2, fontSize: 13, fontWeight: 600, boxShadow: 1 }}>
      {AVISO_LEGAL}
    </Alert>
  );
}

// ---------------- arquivos (HTML imprimível e CSV) com o token do usuário ----------------
async function baixar(path: string) {
  const res = await fetch(`${API_BASE}/edu${C}${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem("dentalpos.token") || ""}` } });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || `Erro ${res.status}`); }
  return res;
}
/** Abre um documento imprimível (HTML do servidor) em nova aba. */
export async function abrirImprimivel(path: string) {
  const w = window.open("", "_blank");
  try {
    const html = await (await baixar(path)).text();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    if (w) w.location.href = url; else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (e) { w?.close(); throw e; }
}
export async function baixarCsv(path: string, nome: string) {
  const blob = await (await baixar(path)).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Executa uma ação com aviso de erro/sucesso. */
export function useAcao() {
  const [msg, setMsg] = useState<{ tipo: "success" | "error" | "info"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const rodar = useCallback(async <T,>(fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | null> => {
    setOcupado(true); setMsg(null);
    try { const r = await fn(); if (ok) setMsg({ tipo: "success", texto: typeof ok === "function" ? ok(r) : ok }); return r; }
    catch (e) { setMsg({ tipo: "error", texto: errMsg(e) }); return null; }
    finally { setOcupado(false); }
  }, []);
  const aviso = msg ? <Alert severity={msg.tipo} onClose={() => setMsg(null)} sx={{ mb: 1.5 }}>{msg.texto}</Alert> : null;
  return { rodar, aviso, ocupado, setMsg };
}

/** Exige empresa escolhida (a maioria das telas é por empresa). */
export function ExigeEmpresa({ children }: { children: (empresaId: string, empresa: any) => ReactNode }) {
  const { empresaId, empresas } = useContabil();
  if (!empresaId) return <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}><Typography sx={{ fontWeight: 700 }}>Escolha uma empresa no seletor acima</Typography><Typography variant="body2" color="text.secondary">Esta área trabalha com uma empresa por vez.</Typography></Paper>;
  return <>{children(empresaId, empresas.find((e) => e.id === empresaId))}</>;
}

export const tabelaSx = { overflowX: "auto", "& th": { whiteSpace: "nowrap", fontWeight: 700 } } as const;
