// Kit do bloco CONTABILIDADE parte 2 (portátil): ÚNICO ponto de contato com o hospedeiro no frontend é este arquivo
// (cliente HTTP `eduApi`). Para plugar em outro sistema, troque `host.get/post/put/del` e o prefixo de rotas.
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Snackbar, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import GavelIcon from "@mui/icons-material/Gavel";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { eduApi } from "../../../services/EduApi";

export const host = { get: <T = any,>(p: string) => eduApi.get<T>(p), post: <T = any,>(p: string, b?: unknown) => eduApi.post<T>(p, b), put: <T = any,>(p: string, b?: unknown) => eduApi.put<T>(p, b), del: <T = any,>(p: string) => eduApi.del<T>(p) };

export const BASE = "/contabil";
export const SOC = `${BASE}/societario`, DP = `${BASE}/rh-dp`, IR = `${BASE}/imposto-renda`, AS = `${BASE}/assistente`;

export const FAIXA_PADRAO = "Este sistema não substitui um contador. Cálculos e guias são estimativas/simulações; valide com seu contador antes de enviar ou pagar. Seus dados são tratados conforme a LGPD.";
export const COR = { ok: "#2e9e5b", warn: "#c98a00", bad: "#d64545", info: "#0F5FDB", mute: "#64748b" };

export const errMsg = (e: any) => (e?.message ? String(e.message) : "Não foi possível concluir a operação.");
export const brl = (v: any) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const dataBr = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
export const dataHora = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
export const rotulo = (s?: string | null) => (s ? s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "—");
export const isoHoje = () => new Date().toISOString().slice(0, 10);
export const qstr = (o: Record<string, string | number | boolean | undefined | null>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

/** Faixa fixa exibida em TODAS as telas deste bloco. */
export function FaixaAviso({ extra }: { extra?: ReactNode }) {
  return (
    <Alert severity="info" icon={<GavelIcon fontSize="small" />} sx={{ mb: 2, borderRadius: 3, alignItems: "center" }} role="note">
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{FAIXA_PADRAO}</Typography>
      {extra ? <Box sx={{ mt: 0.5 }}>{extra}</Box> : null}
    </Alert>
  );
}
export const AvisoSimulacao = ({ texto }: { texto?: string }) => (
  <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
    <b>SIMULAÇÃO.</b> {texto || "Nada é enviado a órgãos públicos reais (Receita Federal, Junta Comercial, SEFAZ, prefeituras, eSocial). Números, protocolos e recibos gerados são fictícios."}
  </Alert>
);

export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) { setData(null); setLoading(false); return; }
    let vivo = true;
    setLoading(true);
    host.get<T>(path).then((d) => { if (vivo) { setData(d); setError(null); } }).catch((e) => { if (vivo) setError(errMsg(e)); }).finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

export function useToast() {
  const [msg, setMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const node = (
    <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
      {msg ? <Alert severity={msg.type} onClose={() => setMsg(null)} sx={{ whiteSpace: "pre-line" }}>{msg.text}</Alert> : undefined}
    </Snackbar>
  );
  return { toast: setMsg, node };
}

/** Executa uma ação, avisa o resultado e recarrega. */
export function useRun(toast: (m: { type: "success" | "error" | "info"; text: string }) => void, after?: () => void) {
  return useCallback(async <T,>(fn: () => Promise<T>, okText = "Concluído.", confirmar?: string): Promise<T | null> => {
    if (confirmar && !window.confirm(confirmar)) return null;
    try { const r = await fn(); toast({ type: "success", text: okText }); after?.(); return r; } catch (e: any) {
      const pend = Array.isArray(e?.data?.pendencias) ? "\n• " + e.data.pendencias.map((p: any) => (typeof p === "string" ? p : p.mensagem || p.item)).join("\n• ") : "";
      toast({ type: "error", text: errMsg(e) + pend });
      return null;
    }
  }, [toast, after]);
}

/** Carregando / erro / vazio / conteúdo. */
export function Estado({ loading, error, vazio, textoVazio = "Nenhum registro encontrado.", onRetry, children }: { loading?: boolean; error?: string | null; vazio?: boolean; textoVazio?: string; onRetry?: () => void; children: ReactNode }) {
  if (loading) return <Box sx={{ py: 4, display: "flex", justifyContent: "center" }} aria-busy="true"><CircularProgress size={28} /></Box>;
  if (error) return <Alert severity="error" action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Tentar de novo</Button> : undefined}>{error}</Alert>;
  if (vazio) return <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{textoVazio}</Typography>;
  return <>{children}</>;
}

export function Kpi({ titulo, valor, dica, cor }: { titulo: string; valor: ReactNode; dica?: string; cor?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, minWidth: 140, flex: "1 1 140px", borderLeft: cor ? `5px solid ${cor}` : undefined }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase" }}>{titulo}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>{valor}</Typography>
      {dica ? <Typography variant="caption" color="text.secondary">{dica}</Typography> : null}
    </Paper>
  );
}
export const KpiRow = ({ children }: { children: ReactNode }) => <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>{children}</Box>;

export const Secao = ({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) => (
  <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2.5 }, borderRadius: 4, mb: 2 }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
      <Typography variant="h6" sx={{ fontWeight: 800, flex: 1, minWidth: 160 }}>{titulo}</Typography>
      {acoes}
    </Box>
    {children}
  </Paper>
);

const CORES_STATUS: Record<string, string> = {
  ATIVO: COR.ok, VIGENTE: COR.ok, CONCLUIDA: COR.ok, CONCLUIDO: COR.ok, DEFERIDO: COR.ok, APROVADO: COR.ok, CONFERIDA: COR.ok, ENTREGUE: COR.ok, PRONTA: COR.ok, HOMOLOGADA: COR.ok, GOZADA: COR.ok, FECHADA: COR.ok, VIAVEL: COR.ok, PROCESSADA_SIMULADA: COR.ok, NO_PRAZO: COR.ok,
  VENCIDO: COR.bad, VENCIDA: COR.bad, ATRASADA: COR.bad, INDEFERIDO: COR.bad, INVIAVEL: COR.bad, CANCELADA: COR.bad, REPROVADO: COR.bad, ERRO: COR.bad, AJUSTAR: COR.bad, PENDENCIA_SIMULADA: COR.bad, DESLIGADO: COR.mute,
  EM_ANDAMENTO: COR.info, EM_ANALISE: COR.info, ENVIADO: COR.info, EM_REVISAO: COR.info, PROGRAMADA: COR.info, ADMISSAO: COR.info, EM_CONFERENCIA: COR.info, EM_PROCESSAMENTO_SIMULADO: COR.info, RECEBIDA_SIMULADA: COR.info, TRANSMITIDA_SIMULADA: COR.info,
  PENDENTE: COR.warn, EXIGENCIA: COR.warn, ALERTA: COR.warn, A_VENCER: COR.warn, PRAZO_PROXIMO: COR.warn, VIAVEL_COM_RESSALVAS: COR.warn, RASCUNHO: COR.mute, AFASTADO: COR.warn, A_PROGRAMAR: COR.warn,
};
export const StatusChip = ({ v }: { v?: string | null }) => (v ? <Chip size="small" label={rotulo(v)} sx={{ bgcolor: CORES_STATUS[v] || COR.mute, color: "#fff", fontWeight: 700 }} /> : <>—</>);

export interface Coluna<T> { titulo: string; render: (r: T) => ReactNode; principal?: boolean; esconderNoCelular?: boolean; direita?: boolean }
/** Tabela no desktop (rola na horizontal dentro do cartão) e cartões no celular. */
export function Lista<T extends { id?: string }>({ linhas, colunas, acoes, aoClicar }: { linhas: T[]; colunas: Array<Coluna<T>>; acoes?: (r: T) => ReactNode; aoClicar?: (r: T) => void }) {
  const mobile = useMediaQuery(useTheme().breakpoints.down("md"));
  if (mobile) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.2 }}>
        {linhas.map((r, i) => (
          <Paper key={r.id || i} variant="outlined" sx={{ p: 1.5, borderRadius: 3, cursor: aoClicar ? "pointer" : undefined }} onClick={() => aoClicar?.(r)}>
            {colunas.filter((c) => c.principal).map((c) => <Box key={c.titulo} sx={{ fontWeight: 700, mb: 0.5 }}>{c.render(r)}</Box>)}
            {colunas.filter((c) => !c.principal && !c.esconderNoCelular).map((c) => (
              <Box key={c.titulo} sx={{ display: "flex", justifyContent: "space-between", gap: 1, py: 0.2, fontSize: 14 }}>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{c.titulo}</Typography>
                <Box sx={{ textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{c.render(r)}</Box>
              </Box>
            ))}
            {acoes ? <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end", gap: 0.5, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>{acoes(r)}</Box> : null}
          </Paper>
        ))}
      </Box>
    );
  }
  return (
    <Box sx={{ overflowX: "auto", maxWidth: "100%" }}>
      <Table size="small">
        <TableHead><TableRow>{colunas.map((c) => <TableCell key={c.titulo} align={c.direita ? "right" : "left"} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{c.titulo}</TableCell>)}{acoes ? <TableCell /> : null}</TableRow></TableHead>
        <TableBody>
          {linhas.map((r, i) => (
            <TableRow key={r.id || i} hover sx={{ cursor: aoClicar ? "pointer" : undefined }} onClick={() => aoClicar?.(r)}>
              {colunas.map((c) => <TableCell key={c.titulo} align={c.direita ? "right" : "left"}>{c.render(r)}</TableCell>)}
              {acoes ? <TableCell align="right" onClick={(e) => e.stopPropagation()} sx={{ whiteSpace: "nowrap" }}>{acoes(r)}</TableCell> : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export interface Campo { nome: string; rotulo: string; tipo?: "text" | "number" | "date" | "select" | "textarea" | "checkbox"; opcoes?: Array<{ value: string; label: string }>; obrigatorio?: boolean; ajuda?: string; padrao?: any }
/** Diálogo de formulário simples. */
export function Formulario({ aberto, titulo, campos, inicial, enviarRotulo = "Salvar", aoFechar, aoEnviar }: { aberto: boolean; titulo: string; campos: Campo[]; inicial?: Record<string, any>; enviarRotulo?: string; aoFechar: () => void; aoEnviar: (v: Record<string, any>) => Promise<unknown> | unknown }) {
  const [v, setV] = useState<Record<string, any>>({});
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (aberto) setV({ ...Object.fromEntries(campos.filter((c) => c.padrao !== undefined).map((c) => [c.nome, c.padrao])), ...(inicial || {}) }); /* eslint-disable-next-line */ }, [aberto]);
  const faltando = campos.some((c) => c.obrigatorio && (v[c.nome] === undefined || v[c.nome] === "" || v[c.nome] === null));
  const enviar = async () => {
    setSalvando(true);
    const out: Record<string, any> = {};
    for (const c of campos) { const x = v[c.nome]; if (x === undefined || x === "") continue; out[c.nome] = c.tipo === "number" ? Number(x) : x; }
    try { await aoEnviar(out); } finally { setSalvando(false); }
  };
  return (
    <Dialog open={aberto} onClose={aoFechar} fullWidth maxWidth="sm" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gap: 2, pt: 0.5 }}>
          {campos.map((c) => c.tipo === "checkbox" ? (
            <label key={c.nome} style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={!!v[c.nome]} onChange={(e) => setV({ ...v, [c.nome]: e.target.checked })} /> {c.rotulo}</label>
          ) : (
            <TextField key={c.nome} size="small" label={c.rotulo} required={c.obrigatorio} helperText={c.ajuda} type={c.tipo === "number" ? "number" : c.tipo === "date" ? "date" : "text"} multiline={c.tipo === "textarea"} minRows={c.tipo === "textarea" ? 3 : undefined}
              select={c.tipo === "select"} slotProps={c.tipo === "date" ? { inputLabel: { shrink: true } } : undefined} value={v[c.nome] ?? ""} onChange={(e) => setV({ ...v, [c.nome]: e.target.value })}>
              {c.tipo === "select" ? [<MenuItem key="" value="">—</MenuItem>, ...(c.opcoes || []).map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)] : undefined}
            </TextField>
          ))}
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={aoFechar}>Cancelar</Button><Button variant="contained" disabled={faltando || salvando} onClick={enviar}>{salvando ? "Salvando..." : enviarRotulo}</Button></DialogActions>
    </Dialog>
  );
}

/** Texto imprimível em diálogo (minutas, holerite, termo, recibo) com botão Imprimir. */
export function TextoImprimivel({ aberto, titulo, texto, aoFechar }: { aberto: boolean; titulo: string; texto: string; aoFechar: () => void }) {
  const imprimir = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    const esc = texto.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    w.document.write(`<html><head><title>${titulo.replace(/</g, "")}</title></head><body style="font-family:monospace;white-space:pre-wrap;padding:24px;line-height:1.4">${esc}</body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  return (
    <Dialog open={aberto} onClose={aoFechar} fullWidth maxWidth="md" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent dividers><Box component="pre" sx={{ m: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace", fontSize: 13 }}>{texto}</Box></DialogContent>
      <DialogActions><Button onClick={() => navigator.clipboard?.writeText(texto)}>Copiar</Button><Button onClick={imprimir}>Imprimir</Button><Button variant="contained" onClick={aoFechar}>Fechar</Button></DialogActions>
    </Dialog>
  );
}
