import {
  Alert, Badge, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Pagination, Tab, Tabs, TextField, Tooltip, Typography,
} from "@mui/material";
import BugReportIcon from "@mui/icons-material/BugReport";
import ThumbUpAltOutlinedIcon from "@mui/icons-material/ThumbUpAltOutlined";
import ThumbUpAltIcon from "@mui/icons-material/ThumbUpAlt";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { eduApi } from "../../services/EduApi";
import { readSessionUser } from "../../services/DemoAccess";
import { instalarCapturaConsole, logsCapturados, sanitizar } from "./sanitize";

instalarCapturaConsole();

const TIPOS = [["SUGESTAO", "Sugestão"], ["MELHORIA", "Melhoria de algo existente"], ["ERRO", "Erro na tela"], ["BUG", "Bug (comportamento incorreto)"], ["DUVIDA", "Dúvida"]];
const CATEGORIAS = ["ACADEMICO", "FINANCEIRO", "SECRETARIA", "PORTAL", "INFRAESTRUTURA", "RH", "DESEMPENHO", "DESIGN", "OUTRO"];
const PRIOR = [["BAIXA", "Baixa"], ["MEDIA", "Média"], ["ALTA", "Alta"], ["CRITICA", "Crítica — impede o trabalho"]];
const VERSAO = (import.meta as any).env?.VITE_APP_VERSION || (import.meta as any).env?.MODE || "dev";
const MAX_BYTES = 1_800_000;
const lbl = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function lerArquivo(f: File): Promise<string> {
  return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error("Falha ao ler o arquivo.")); r.readAsDataURL(f); });
}
async function reduzir(f: File): Promise<{ arquivoNome: string; mime: string; dataUrl: string }> {
  if (!f.type.startsWith("image/")) throw new Error("A captura de tela deve ser uma imagem.");
  const orig = await lerArquivo(f);
  if (f.size <= 900_000) return { arquivoNome: f.name, mime: f.type, dataUrl: orig };
  const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Imagem inválida.")); i.src = orig; });
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", 0.78);
  if (dataUrl.length > MAX_BYTES * 1.37) throw new Error("Imagem muito grande.");
  return { arquivoNome: f.name.replace(/\.\w+$/, "") + ".jpg", mime: "image/jpeg", dataUrl };
}

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  // acessível por teclado: Alt+Shift+F
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.altKey && e.shiftKey && e.key.toLowerCase() === "f") setOpen(true); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  if (!localStorage.getItem("dentalpos.token")) return null;
  return (
    <>
      <Tooltip title="Sugestões e problemas (Alt+Shift+F)" placement="left">
        <IconButton
          className="no-print" aria-label="Enviar sugestão ou relatar problema" onClick={() => setOpen(true)} data-testid="feedback-fab"
          sx={{ position: "fixed", right: 14, bottom: 14, zIndex: 1200, width: 40, height: 40, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", boxShadow: 2, opacity: 0.5, transition: "opacity .2s", "&:hover,&:focus-visible": { opacity: 1, bgcolor: "background.paper" } }}
        ><BugReportIcon fontSize="small" /></IconButton>
      </Tooltip>
      {open && <FeedbackDialog onClose={() => setOpen(false)} rota={loc.pathname + loc.search} />}
    </>
  );
}

function FeedbackDialog({ onClose, rota }: { onClose: () => void; rota: string }) {
  const [aba, setAba] = useState(0);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle sx={{ pb: 0 }}>Sugestões e problemas</DialogTitle>
      <Tabs value={aba} onChange={(_, v) => setAba(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Enviar" sx={{ textTransform: "none", fontWeight: 700 }} /><Tab label="Votar" sx={{ textTransform: "none", fontWeight: 700 }} /><Tab label="Meus envios" sx={{ textTransform: "none", fontWeight: 700 }} />
      </Tabs>
      {aba === 0 && <Enviar rota={rota} onClose={onClose} />}
      {aba === 1 && <Votar onClose={onClose} />}
      {aba === 2 && <Meus onClose={onClose} />}
    </Dialog>
  );
}

function Enviar({ rota, onClose }: { rota: string; onClose: () => void }) {
  const [f, setF] = useState<Record<string, any>>({ tipo: "SUGESTAO", categoria: "OUTRO", prioridade: "MEDIA", ctx: true, logs: true, anonimo: false });
  const [shot, setShot] = useState<{ arquivoNome: string; mime: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<any>(null);
  const [verLogs, setVerLogs] = useState(false);
  const [logs] = useState(() => logsCapturados());
  const set = (k: string, v: any) => setF((o) => ({ ...o, [k]: v }));
  const erro = f.tipo === "ERRO" || f.tipo === "BUG";
  const user = readSessionUser();

  async function anexar(file?: File) {
    if (!file) return; setErr(null);
    try { setShot(await reduzir(file)); } catch (e: any) { setErr(e.message); }
  }
  async function capturarTela() {
    setErr(null);
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, preferCurrentTab: true });
      const v = document.createElement("video"); v.srcObject = stream; await v.play();
      await new Promise((r) => setTimeout(r, 400));
      const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d")!.drawImage(v, 0, 0);
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.8));
      await anexar(new File([blob], "captura-de-tela.jpg", { type: "image/jpeg" }));
    } catch { setErr("Não foi possível capturar a tela neste navegador. Anexe uma imagem pelo botão ao lado."); }
  }
  async function enviar() {
    setBusy(true); setErr(null);
    try {
      const contexto = f.ctx ? {
        rota, tela: document.title, versaoApp: String(VERSAO), navegador: navigator.userAgent, plataforma: (navigator as any).userAgentData?.platform || navigator.platform || undefined,
        viewport: `${window.innerWidth}x${window.innerHeight}`, idioma: navigator.language, logsConsole: f.logs && logs ? sanitizar(logs) : undefined,
      } : { rota: rota.split("?")[0] };
      const r = await eduApi.post<any>("/feedback/itens", {
        tipo: f.tipo, categoria: f.categoria, prioridade: f.prioridade, titulo: f.titulo, descricao: f.descricao, passosReproduzir: erro && f.passos ? f.passos : undefined,
        anonimo: !!f.anonimo, contexto, capturas: shot ? [shot] : undefined,
      });
      setOk(r);
    } catch (e: any) { setErr(e.message || "Não foi possível enviar."); } finally { setBusy(false); }
  }
  if (ok) {
    return (
      <>
        <DialogContent>
          <Alert severity="success">Recebido! Seu registro é <b>{ok.numero}</b>. Você será avisado quando a equipe responder.</Alert>
          {ok.similares?.length > 0 && <Alert severity="info" sx={{ mt: 1.5 }}>Já existem pedidos parecidos — vote neles na aba “Votar”: {ok.similares.map((s: any) => `${s.numero} (${s.titulo})`).join("; ")}</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      </>
    );
  }
  const valido = (f.titulo || "").length >= 5 && (f.descricao || "").length >= 10;
  return (
    <>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 1.5 }}>{err}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5, pt: 1 }}>
          <TextField select size="small" label="O que você quer enviar?" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>{TIPOS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
          <TextField select size="small" label="Área" value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>{CATEGORIAS.map((c) => <MenuItem key={c} value={c}>{lbl(c)}</MenuItem>)}</TextField>
          <TextField size="small" label="Título" required value={f.titulo || ""} onChange={(e) => set("titulo", e.target.value)} slotProps={{ htmlInput: { maxLength: 160 } }} sx={{ gridColumn: "1 / -1" }} />
          <TextField size="small" label={erro ? "O que aconteceu?" : "Descreva sua ideia"} required multiline minRows={3} value={f.descricao || ""} onChange={(e) => set("descricao", e.target.value)} helperText="Não escreva senhas nem dados pessoais de terceiros." sx={{ gridColumn: "1 / -1" }} />
          {erro && <TextField size="small" label="Passos para reproduzir (opcional)" multiline minRows={2} value={f.passos || ""} onChange={(e) => set("passos", e.target.value)} sx={{ gridColumn: "1 / -1" }} />}
          <TextField select size="small" label="Prioridade" value={f.prioridade} onChange={(e) => set("prioridade", e.target.value)}>{PRIOR.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
        </Box>
        <Box sx={{ mt: 1.5, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <Button size="small" variant="outlined" component="label">Anexar captura de tela<input hidden type="file" accept="image/*" onChange={(e) => { void anexar(e.target.files?.[0]); e.target.value = ""; }} /></Button>
          {typeof navigator !== "undefined" && (navigator.mediaDevices as any)?.getDisplayMedia && <Button size="small" onClick={capturarTela}>Capturar esta tela</Button>}
          {shot && <Chip size="small" label={shot.arquivoNome} onDelete={() => setShot(null)} />}
        </Box>
        {shot && <img src={shot.dataUrl} alt="Pré-visualização da captura" style={{ maxWidth: "100%", maxHeight: 140, marginTop: 8, borderRadius: 8, border: "1px solid #ccc" }} />}
        <Box sx={{ mt: 1.5, p: 1.2, borderRadius: 2, bgcolor: "action.hover" }}>
          <FormControlLabel control={<Checkbox size="small" checked={f.ctx} onChange={(e) => set("ctx", e.target.checked)} />} label={<Typography variant="body2">Incluir informações técnicas: tela <code>{rota.split("?")[0]}</code>, versão {String(VERSAO)}, perfil {user?.role || "—"}, navegador</Typography>} />
          {f.ctx && <FormControlLabel control={<Checkbox size="small" checked={f.logs} onChange={(e) => set("logs", e.target.checked)} />} label={<Typography variant="body2">Incluir últimos erros do console (sem senhas, tokens, e-mails ou CPF) {logs ? <Button size="small" onClick={(ev) => { ev.preventDefault(); setVerLogs(!verLogs); }}>{verLogs ? "ocultar" : "ver"}</Button> : "— nenhum registrado"}</Typography>} />}
          {verLogs && <Box component="pre" sx={{ m: 0, mt: 0.5, p: 1, fontSize: 11, maxHeight: 120, overflow: "auto", bgcolor: "background.paper", borderRadius: 1, whiteSpace: "pre-wrap" }}>{sanitizar(logs) || "—"}</Box>}
          <FormControlLabel control={<Checkbox size="small" checked={f.anonimo} onChange={(e) => set("anonimo", e.target.checked)} />} label={<Typography variant="body2">Enviar sem mostrar meu nome à equipe (você ainda recebe a resposta)</Typography>} />
          <Typography variant="caption" color="text.secondary" component="div">Usamos estes dados só para entender e corrigir o problema; logs e capturas de itens encerrados são apagados após 180 dias (LGPD).</Typography>
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!valido || busy} onClick={enviar}>{busy ? <CircularProgress size={18} /> : "Enviar"}</Button></DialogActions>
    </>
  );
}

function Votar({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const carregar = useCallback(() => { eduApi.get<any>(`/feedback/sugestoes?page=${page}&pageSize=8&q=${encodeURIComponent(q)}`).then(setD).catch((e) => setErr(e.message)); }, [page, q]);
  useEffect(() => { carregar(); }, [carregar]);
  async function votar(id: string) { try { const r = await eduApi.post<any>(`/feedback/itens/${id}/votar`, {}); setD((o: any) => ({ ...o, items: o.items.map((i: any) => (i.id === id ? { ...i, votos: r.votos, jaVotei: r.jaVotei } : i)) })); } catch (e: any) { setErr(e.message); } }
  return (
    <>
      <DialogContent>
        <TextField size="small" fullWidth label="Buscar sugestões" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} sx={{ mb: 1.5 }} />
        {err && <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setErr(null)}>{err}</Alert>}
        {!d ? <CircularProgress size={24} /> : d.items.length === 0 ? <Typography color="text.secondary">Nenhuma sugestão encontrada.</Typography> : d.items.map((i: any) => (
          <Box key={i.id} sx={{ display: "flex", gap: 1, py: 1, borderBottom: "1px solid", borderColor: "divider", alignItems: "flex-start" }}>
            <Box sx={{ textAlign: "center", minWidth: 48 }}>
              <IconButton size="small" aria-label={i.jaVotei ? "Remover meu voto" : "Votar"} color={i.jaVotei ? "primary" : "default"} onClick={() => votar(i.id)}>{i.jaVotei ? <ThumbUpAltIcon /> : <ThumbUpAltOutlinedIcon />}</IconButton>
              <Typography variant="caption" component="div">{i.votos}</Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 700 }}>{i.titulo}</Typography><Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{i.descricao}</Typography><Chip size="small" label={lbl(i.status)} sx={{ mt: 0.5 }} /></Box>
          </Box>
        ))}
        {d && <Pagination sx={{ mt: 1.5 }} count={Math.max(1, Math.ceil(d.total / 8))} page={page} onChange={(_, n) => setPage(n)} />}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </>
  );
}

function Meus({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { eduApi.get<any>("/feedback/itens/meus?pageSize=30").then(setD).catch((e) => setErr(e.message)); }, []);
  return (
    <>
      <DialogContent>
        {err && <Alert severity="warning">{err}</Alert>}
        {!d && !err ? <CircularProgress size={24} /> : d?.items?.length === 0 ? <Typography color="text.secondary">Você ainda não enviou nada.</Typography> : d?.items?.map((i: any) => (
          <Box key={i.id} sx={{ py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><Typography sx={{ fontWeight: 700 }}>{i.titulo}</Typography><Badge color="primary" variant="dot" invisible={!i.respostaAutor}><Chip size="small" label={lbl(i.status)} /></Badge></Box>
            <Typography variant="caption" color="text.secondary">{i.numero} · {lbl(i.tipo)} · {new Date(i.createdAt).toLocaleDateString("pt-BR")}</Typography>
            {i.respostaAutor && <Alert severity="info" sx={{ mt: 0.8 }}><b>Resposta da equipe:</b> {i.respostaAutor}</Alert>}
          </Box>
        ))}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </>
  );
}
