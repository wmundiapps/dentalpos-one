// Utilitários compartilhados das telas de Tesouraria / Financeiro Edu.
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { eduApi } from "../../services/EduApi";

export const TES = "/tesouraria";
export { brl, fmtDate, fmtDateTime, itemsOf, label, num, Panel, Stat, StatGrid, Bars, Light, Tag, Async, Empty, useApi, useToast } from "../infraestrutura/kit";

/** Hoje + n dias no formato AAAA-MM-DD (para campos de data). */
export const isoDia = (n = 0) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
export const dataISO = (d: string) => new Date(`${d}T12:00:00`).toISOString();

export const FORMAS_RECEBIMENTO = ["PIX", "BOLETO", "CARTAO", "DINHEIRO", "TRANSFERENCIA", "PERMUTA"];
export const FORMAS_PAGAMENTO = ["PIX", "TED", "BOLETO", "CREDITO_CONTA", "DINHEIRO"];

type Tom = "default" | "success" | "warning" | "error" | "info" | "primary" | "secondary";
const TONS: Record<string, Tom> = {
  RASCUNHO: "default", CONFERIDO: "info", AUTORIZADO: "primary", ENVIADO_BANCO: "secondary", PAGO: "success", CONCILIADO: "success", REJEITADO: "error", CANCELADO: "default",
  GERADA: "info", ENVIADA: "secondary", PROCESSADA: "success", ERRO: "error", EMITIDO: "success", APROVADA: "primary", LIQUIDADA: "success",
  LANCADA: "success", OK: "success", DIVERGENTE: "error", PENDENTE: "warning", ATRASADO: "error", IGNORADO: "default",
};
/** Chip de situação com cor consistente em todas as telas da tesouraria. */
export function Situacao({ value }: { value?: string | null }) {
  if (!value) return <>—</>;
  return <Chip size="small" color={TONS[value] ?? "default"} variant={TONS[value] === "default" || !TONS[value] ? "outlined" : "filled"} label={value.replace(/_/g, " ")} />;
}

export type ContaOpt = { value: string; label: string; tipo: string; saldo: number };
/** Contas bancárias/caixa do tenant (para seletores). */
export function useContas() {
  const [contas, setContas] = useState<ContaOpt[]>([]);
  const load = useCallback(async () => {
    try {
      const r = await eduApi.get(`${TES}/contas`);
      setContas((r.items || []).filter((c: any) => c.ativa).map((c: any) => ({ value: c.id, label: `${c.nome}${c.tipo === "CAIXA" ? " (caixa)" : ""}`, tipo: c.tipo, saldo: c.saldo })));
    } catch { setContas([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { contas, reload: load };
}

export const erro = (e: any) => (e?.message ? String(e.message) : "Não foi possível concluir a operação.");
export const pendenciasDe = (e: any): string[] => (Array.isArray(e?.data?.pendencias) ? e.data.pendencias : []);

/** Mensagem completa de erro (inclui a lista de pendências quando houver). */
export function erroCompleto(e: any) {
  const p = pendenciasDe(e);
  return erro(e) + (p.length ? ` — ${p.join(" · ")}` : "");
}

/**
 * Reautenticação 2FA para ações sensíveis: se o servidor pedir o código, solicita ao usuário e repete a chamada.
 * Código aceito: TOTP do aplicativo autenticador ou código de recuperação.
 */
export async function comReauth<T>(fn: (extra: { codigo2fa?: string }) => Promise<T>): Promise<T> {
  try {
    return await fn({});
  } catch (e: any) {
    const code = e?.data?.code;
    if (code === "2FA_REQUERIDO" || code === "2FA_INVALIDO") {
      const c = window.prompt("Ação sensível: informe o código do aplicativo autenticador (2FA) ou um código de recuperação.");
      if (!c) throw e;
      return fn({ codigo2fa: c.trim() });
    }
    throw e;
  }
}

/** Diálogo para pedir um motivo (cancelar, rejeitar, devolver...). */
export function useMotivo() {
  const [req, setReq] = useState<{ titulo: string; min: number; resolve: (v: string | null) => void } | null>(null);
  const [txt, setTxt] = useState("");
  const ask = (titulo: string, min = 5) => new Promise<string | null>((resolve) => { setTxt(""); setReq({ titulo, min, resolve }); });
  const fechar = (v: string | null) => { req?.resolve(v); setReq(null); };
  const node = (
    <Dialog open={!!req} onClose={() => fechar(null)} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 800 }}>{req?.titulo}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth multiline minRows={2} margin="dense" size="small" label="Motivo" value={txt} onChange={(e) => setTxt(e.target.value)} helperText={`Mínimo de ${req?.min ?? 5} caracteres (fica na trilha de auditoria).`} />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => fechar(null)}>Voltar</Button>
        <Button variant="contained" disabled={txt.trim().length < (req?.min ?? 5)} onClick={() => fechar(txt.trim())}>Confirmar</Button>
      </DialogActions>
    </Dialog>
  );
  return { ask, node };
}

/** Baixa um texto como arquivo no navegador. */
export function baixarArquivo(nome: string, conteudo: string, mime = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([conteudo], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lê um arquivo escolhido pelo usuário como texto (UTF-8, com fallback Latin-1 para extratos de bancos). */
export async function lerArquivoTexto(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const utf = new TextDecoder("utf-8").decode(buf);
  return utf.includes("�") ? new TextDecoder("latin1").decode(buf) : utf;
}

/** Imprime um HTML (recibo) em janela própria. */
export function imprimirHtml(html: string, titulo = "Documento") {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title></head><body style="margin:24px">${html}<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

/** Cartão de ação responsivo (usado nas filas em telas pequenas). */
export function Cartao({ children, destaque }: { children: ReactNode; destaque?: "warning" | "error" | "success" }) {
  const cor = destaque === "error" ? "error.main" : destaque === "warning" ? "warning.main" : destaque === "success" ? "success.main" : "divider";
  return <Box sx={{ border: 1, borderColor: cor, borderRadius: 3, p: 1.5, bgcolor: "background.paper", minWidth: 0 }}>{children}</Box>;
}

/** Alerta de simulação do provedor bancário. */
export function AvisoSimulado() {
  return <Alert severity="info" sx={{ mb: 2 }}>Provedor bancário <b>simulado</b>: o envio não move dinheiro nem usa credenciais reais. Integração bancária real exige credenciais, certificado e homologação com o banco.</Alert>;
}

/** Rótulo secundário (texto pequeno cinza). */
export const Sub = ({ children }: { children: ReactNode }) => <Typography variant="caption" color="text.secondary" component="div">{children}</Typography>;

/** Mantém o último valor assíncrono (evita piscar ao recarregar). */
export function useUltimo<T>(v: T | null) {
  const r = useRef<T | null>(null);
  if (v !== null && v !== undefined) r.current = v;
  return r.current;
}
