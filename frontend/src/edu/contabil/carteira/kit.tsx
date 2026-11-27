import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { useState, type ReactNode } from "react";
import { eduApi, readSessionUser } from "./host";

export const C = "/contabil/carteira";
export const AVISO_LEGAL = "Este sistema não substitui um contador. Cálculos e guias são estimativas/simulações; valide com seu contador antes de enviar ou pagar. Seus dados são tratados conforme a LGPD.";

/** Faixa fixa (todas as telas da carteira e do portal): aviso legal e de LGPD. */
export function FaixaLegal() {
  return (
    <Box role="note" sx={{ position: "sticky", bottom: 0, zIndex: 5, mt: 3, mx: { xs: -1, md: 0 } }}>
      <Alert severity="warning" icon={false} sx={{ borderRadius: 2, py: 0.25, fontSize: 12.5, boxShadow: 3 }}>{AVISO_LEGAL}</Alert>
    </Box>
  );
}

export const cargo = () => String(readSessionUser()?.role || "").toUpperCase();
export const GESTAO = ["ADMIN", "OWNER", "RECTOR", "BOARD", "GESTOR_CONTABIL"];
export const CONTADORES = [...GESTAO, "CONTADOR"];
export const ehGestao = () => GESTAO.includes(cargo());
export const ehContador = () => CONTADORES.includes(cargo());
export const ehFinanceiro = () => [...GESTAO, "FINANCE"].includes(cargo());

export const ROTULO_STATUS: Record<string, string> = { PROSPECTO: "Prospecto", ATIVO: "Ativo", SUSPENSO: "Suspenso", ENCERRADO: "Encerrado" };
export const ROTULO_REGIME: Record<string, string> = { MEI: "MEI", SIMPLES: "Simples Nacional", PRESUMIDO: "Lucro Presumido", REAL: "Lucro Real", PF: "Pessoa Física", ISENTA: "Isenta", OUTRO: "Outro" };
export const ROTULO_CARGO: Record<string, string> = { ADMIN: "Administrador", OWNER: "Sócio", GESTOR_CONTABIL: "Gestor", CONTADOR: "Contador", ANALISTA_CONTABIL: "Analista", FINANCE: "Financeiro" };

type Tom = "default" | "success" | "warning" | "error" | "info" | "primary" | "secondary";
const TONS: Record<string, Tom> = {
  ATIVO: "success", PROSPECTO: "info", SUSPENSO: "warning", ENCERRADO: "default", PAGO: "success", ABERTO: "info", ATRASADO: "error", CANCELADO: "default", VIGENTE: "success", RASCUNHO: "default",
  AGUARDANDO_ASSINATURA: "warning", CONCLUIDA: "success", EM_ANDAMENTO: "info", A_FAZER: "default", AGUARDANDO_CLIENTE: "warning", CANCELADA: "default", RISCO: "error", ATENCAO: "warning", SAUDAVEL: "success",
  ENVIADA: "info", ACEITA: "success", RECUSADA: "error", EXPIRADA: "default", CONFERIDO: "success", RECEBIDO: "info", COM_PENDENCIA: "warning", REJEITADO: "error", ABERTA: "info", PAGA: "success", ALTO: "error", MEDIO: "warning", BAIXO: "success",
  URGENTE: "error", ALTA: "warning", NORMAL: "default", BAIXA: "default",
};
export function Situacao({ value }: { value?: string | null }) {
  if (!value) return <>—</>;
  const t = TONS[value];
  return <Chip size="small" color={t ?? "default"} variant={!t || t === "default" ? "outlined" : "filled"} label={ROTULO_STATUS[value] ?? value.replace(/_/g, " ")} />;
}

export const api = {
  get: <T = any,>(p: string) => eduApi.get<T>(`${C}${p}`),
  post: <T = any,>(p: string, b?: unknown) => eduApi.post<T>(`${C}${p}`, b),
  put: <T = any,>(p: string, b?: unknown) => eduApi.put<T>(`${C}${p}`, b),
  patch: <T = any,>(p: string, b?: unknown) => eduApi.patch<T>(`${C}${p}`, b),
  del: <T = any,>(p: string) => eduApi.del<T>(`${C}${p}`),
};

const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("dentalpos.token") || ""}` });

/** Abre em nova aba um relatório/documento HTML autenticado (imprimível). */
export async function abrirHtml(path: string) {
  const res = await fetch(`${API}/edu${C}${path}`, { headers: hdr() });
  if (!res.ok) throw new Error(`Erro ${res.status} ao gerar o documento.`);
  const html = await res.text();
  const w = window.open("", "_blank");
  if (!w) throw new Error("O navegador bloqueou a nova aba.");
  w.document.open(); w.document.write(html); w.document.close();
}
/** Baixa um arquivo autenticado (CSV, anexos). */
export async function baixar(path: string, nome: string) {
  const res = await fetch(`${API}/edu${C}${path}`, { headers: hdr() });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || `Erro ${res.status} ao baixar.`); }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
/** Lê um arquivo como data URL (anexos e portal). Máximo ~3 MB. */
export const lerArquivo = (f: File) => new Promise<string>((ok, no) => {
  if (f.size > 3 * 1024 * 1024) return no(new Error("Arquivo maior que 3 MB."));
  const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error("Não foi possível ler o arquivo.")); r.readAsDataURL(f);
});

export const hojeIso = (n = 0) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
export const compMes = (delta = 0) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + delta); return d.toISOString().slice(0, 7); };
export const docFmt = (d?: string | null) => { const c = String(d || ""); return c.length === 11 ? c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : c.length === 14 ? c.replace(/(\w{2})(\w{3})(\w{3})(\w{4})(\w{2})/, "$1.$2.$3/$4-$5") : c || "—"; };

/** Pede um texto (motivo, confirmação). */
export function usePrompt() {
  const [req, setReq] = useState<{ titulo: string; dica?: string; min: number; exato?: string; resolve: (v: string | null) => void } | null>(null);
  const [txt, setTxt] = useState("");
  const ask = (titulo: string, o: { dica?: string; min?: number; exato?: string } = {}) => new Promise<string | null>((resolve) => { setTxt(""); setReq({ titulo, dica: o.dica, min: o.min ?? 3, exato: o.exato, resolve }); });
  const fechar = (v: string | null) => { req?.resolve(v); setReq(null); };
  const ok = req ? (req.exato ? txt === req.exato : txt.trim().length >= req.min) : false;
  const node = (
    <Dialog open={!!req} onClose={() => fechar(null)} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 800 }}>{req?.titulo}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth margin="dense" size="small" value={txt} onChange={(e) => setTxt(e.target.value)} helperText={req?.dica ?? (req?.exato ? `Digite ${req.exato} para confirmar.` : `Mínimo de ${req?.min} caracteres (fica na auditoria).`)} />
      </DialogContent>
      <DialogActions><Button onClick={() => fechar(null)}>Cancelar</Button><Button variant="contained" disabled={!ok} onClick={() => fechar(txt)}>Confirmar</Button></DialogActions>
    </Dialog>
  );
  return { ask, node };
}

export function Titulo({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
      <Typography variant="h6" sx={{ fontWeight: 800, flex: 1, minWidth: 160 }}>{children}</Typography>
      {extra}
    </Box>
  );
}

export const Simulado = ({ texto = "SIMULADO" }: { texto?: string }) => <Chip size="small" label={texto} sx={{ ml: 0.5, borderStyle: "dashed", color: "secondary.main", borderColor: "secondary.main" }} variant="outlined" />;
