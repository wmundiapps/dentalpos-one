import {
  Alert, Box, Button, Chip, CircularProgress, Divider, IconButton, InputAdornment, ListItemIcon, ListItemText, Menu, MenuItem, Paper, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import DoneIcon from "@mui/icons-material/Done";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import LinkIcon from "@mui/icons-material/Link";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import NotificationsOffOutlinedIcon from "@mui/icons-material/NotificationsOffOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import ReplyIcon from "@mui/icons-material/Reply";
import SearchIcon from "@mui/icons-material/Search";
import SendIcon from "@mui/icons-material/Send";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { eduApi } from "../../services/EduApi";
import { ConfigCanalDialog, ContextoDialog, EncaminharDialog, type Ctx } from "./Dialogos";
import { Foto, M, ROTULO_CONTEXTO, ROTULO_MOTIVO, ROTULO_PERFIL, ROTULO_TIPO, Selo, TextoMsg, errMsg, hora, horaCurta, rotuloDia, tamanho, type Meta, type Msg } from "./kit";
import { atualizarResumo, useResumo } from "./resumo";

const SEG_CONVERSA = 4000;
const MAX_ANEXOS = 5;

function lerArquivo(f: File, maxKb: number): Promise<{ nome: string; mime: string; dataUrl: string; tamanho: number }> {
  return new Promise((ok, no) => {
    if (f.size > maxKb * 1024) return no(new Error(`"${f.name}" passa do limite de ${maxKb} KB.`));
    const r = new FileReader();
    r.onload = () => ok({ nome: f.name, mime: f.type || "application/octet-stream", dataUrl: String(r.result), tamanho: f.size });
    r.onerror = () => no(new Error(`Falha ao ler "${f.name}".`));
    r.readAsDataURL(f);
  });
}

async function baixar(anexo: { id: string; nome: string }) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
  const res = await fetch(`${API}/edu${M}/anexos/${anexo.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || `Erro ${res.status}`); }
  if ((res.headers.get("content-type") || "").includes("application/json")) { const j = await res.json(); if (j.url) window.open(j.url, "_blank", "noopener,noreferrer"); return; }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a"); a.href = url; a.download = anexo.nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

interface Props { canalId: string; meta: Meta | null; onVoltar?: () => void; onMudou: () => void; onAbrir: (id: string) => void }

export default function Chat({ canalId, meta, onVoltar, onMudou, onAbrir }: Props) {
  const nav = useNavigate();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const { resumo } = useResumo();
  const [det, setDet] = useState<any | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "error" | "success" | "info"; texto: string } | null>(null);
  const [texto, setTexto] = useState("");
  const [anexos, setAnexos] = useState<Array<{ nome: string; mime: string; dataUrl: string; tamanho: number }>>([]);
  const [resp, setResp] = useState<Msg | null>(null);
  const [edit, setEdit] = useState<Msg | null>(null);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [menu, setMenu] = useState<{ el: HTMLElement; m: Msg } | null>(null);
  const [menuCanal, setMenuCanal] = useState<HTMLElement | null>(null);
  const [dlg, setDlg] = useState<null | "config" | "ctxMsg" | "ctxConversa" | "encaminhar">(null);
  const [soFixadas, setSoFixadas] = useState(false);
  const [busca, setBusca] = useState<string | null>(null);
  const [achados, setAchados] = useState<any[] | null>(null);
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [setores, setSetores] = useState<any[]>([]);
  const [mencoes, setMencoes] = useState<{ usuarios: Record<string, string>; setores: Record<string, string> }>({ usuarios: {}, setores: {} });
  const [sugestao, setSugestao] = useState<{ termo: string; inicio: number } | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const arqRef = useRef<HTMLInputElement>(null);
  const ultimoId = useRef<string>("");
  const perto = useRef(true);
  const seq = useRef(0);

  const carregar = useCallback(async (silencioso = false) => {
    const id = ++seq.current;
    if (!silencioso) { setCarregando(true); setErro(null); }
    try {
      const [d, r] = await Promise.all([eduApi.get<any>(`${M}/canais/${canalId}`), eduApi.get<any>(`${M}/canais/${canalId}/mensagens?limite=60${soFixadas ? "&fixadas=1" : ""}`)]);
      if (id !== seq.current) return;
      setDet(d); setMsgs(r.items); setTemMais(r.temMais); setErro(null);
    } catch (e) { if (id === seq.current && !silencioso) setErro(errMsg(e)); }
    finally { if (id === seq.current && !silencioso) setCarregando(false); }
  }, [canalId, soFixadas]);

  useEffect(() => { setTexto(""); setAnexos([]); setResp(null); setEdit(null); setCtx(null); setBusca(null); setAchados(null); setAviso(null); setMencoes({ usuarios: {}, setores: {} }); ultimoId.current = ""; perto.current = true; void carregar(); }, [canalId, carregar]);
  useEffect(() => { eduApi.get<any>(`${M}/usuarios`).then((r) => setPessoas(r.items ?? [])).catch(() => undefined); eduApi.get<any>(`${M}/setores`).then((r) => setSetores(r.items ?? [])).catch(() => undefined); }, []);

  // tempo quase real: consulta curta (4 s) só com a aba visível
  useEffect(() => {
    const t = window.setInterval(() => { if (!document.hidden && !enviando) void carregar(true); }, SEG_CONVERSA);
    return () => window.clearInterval(t);
  }, [carregar, enviando]);

  // rolagem e leitura
  useEffect(() => {
    const ult = msgs[msgs.length - 1]?.id ?? "";
    if (ult && ult !== ultimoId.current) {
      const primeira = ultimoId.current === "";
      ultimoId.current = ult;
      if (primeira || perto.current) window.setTimeout(() => fimRef.current?.scrollIntoView({ behavior: primeira ? "auto" : "smooth", block: "end" }), 30);
      if (det?.participante && !document.hidden) { void eduApi.post(`${M}/canais/${canalId}/lido`, {}).then(() => { atualizarResumo(); onMudou(); }).catch(() => undefined); }
    }
  }, [msgs, det?.participante, canalId, onMudou]);
  useEffect(() => {
    const f = () => { if (!document.hidden && det?.participante) void eduApi.post(`${M}/canais/${canalId}/lido`, {}).then(() => { atualizarResumo(); onMudou(); }).catch(() => undefined); };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [canalId, det?.participante, onMudou]);

  const aoRolar = () => { const el = areaRef.current; if (el) perto.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; };
  const executar = async (fn: () => Promise<any>, ok?: string) => { setAviso(null); try { await fn(); if (ok) setAviso({ tipo: "success", texto: ok }); await carregar(true); onMudou(); } catch (e) { setAviso({ tipo: "error", texto: errMsg(e) }); } };

  const arquivado = !!det?.arquivado;
  const pedidosAqui = (resumo?.pedidos.itens ?? []).filter((p) => p.canalId === canalId);
  const mensagemSistema = (m: Msg) => m.tipo === "SISTEMA";

  // ---------- menções (@pessoa / @departamento)
  const aoDigitar = (v: string, pos: number) => {
    setTexto(v);
    const antes = v.slice(0, pos);
    const m = /(^|\s)@([\p{L}\p{N}_-]{0,40})$/u.exec(antes);
    setSugestao(m ? { termo: m[2].toLowerCase(), inicio: pos - m[2].length - 1 } : null);
  };
  const sugestoes = useMemo(() => {
    if (!sugestao) return [] as Array<{ tipo: "U" | "S"; id: string; nome: string; sub: string; token: string }>;
    const t = sugestao.termo.replace(/_/g, " ");
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const us = pessoas.filter((p) => norm(p.nome).includes(norm(t))).slice(0, 5).map((p) => ({ tipo: "U" as const, id: p.id, nome: p.nome, sub: ROTULO_PERFIL[p.role] ?? p.role, token: p.nome.replace(/\s+/g, "_") }));
    const ss = setores.filter((s) => norm(s.nome).includes(norm(t)) || norm(s.codigo).includes(norm(t))).slice(0, 4).map((s) => ({ tipo: "S" as const, id: s.id, nome: s.nome, sub: "Departamento", token: s.codigo.toLowerCase() }));
    return [...ss, ...us];
  }, [sugestao, pessoas, setores]);
  const escolherSugestao = (s: (typeof sugestoes)[number]) => {
    if (!sugestao || !campoRef.current) return;
    const pos = campoRef.current.selectionStart ?? texto.length;
    const novo = `${texto.slice(0, sugestao.inicio)}@${s.token} ${texto.slice(pos)}`;
    setTexto(novo); setSugestao(null);
    setMencoes((m) => s.tipo === "U" ? { ...m, usuarios: { ...m.usuarios, [s.id]: s.token } } : { ...m, setores: { ...m.setores, [s.id]: s.token } });
    window.setTimeout(() => { const p = sugestao.inicio + s.token.length + 2; campoRef.current?.focus(); campoRef.current?.setSelectionRange(p, p); }, 0);
  };

  // ---------- envio
  const enviar = async () => {
    const t = texto.trim();
    if (enviando || (!t && !anexos.length && !edit)) return;
    setEnviando(true); setAviso(null);
    try {
      if (edit) {
        await eduApi.patch(`${M}/mensagens/${edit.id}`, { texto: t });
        setEdit(null);
      } else {
        const usuarios = Object.entries(mencoes.usuarios).filter(([, tk]) => t.includes(`@${tk}`)).map(([id]) => id);
        const sets = Object.entries(mencoes.setores).filter(([, tk]) => t.includes(`@${tk}`)).map(([id]) => id);
        const r = await eduApi.post<any>(`${M}/canais/${canalId}/mensagens`, { texto: t || undefined, anexos: anexos.map((a) => ({ nome: a.nome, mime: a.mime, dataUrl: a.dataUrl })), respostaAId: resp?.id, mencoesUsuarios: usuarios, mencoesSetores: sets, contexto: ctx ? { tipo: ctx.tipo, id: ctx.id } : undefined });
        if (r.mencoesIgnoradas?.length) setAviso({ tipo: "info", texto: "Algumas menções não foram entregues porque a conversa é privada e a pessoa/departamento não participa." });
        if (r.auto?.respondeu) window.setTimeout(() => void carregar(true), 200);
      }
      setTexto(""); setAnexos([]); setResp(null); setCtx(null); setMencoes({ usuarios: {}, setores: {} });
      perto.current = true;
      await carregar(true); onMudou(); atualizarResumo();
    } catch (e) { setAviso({ tipo: "error", texto: errMsg(e) }); }
    finally { setEnviando(false); }
  };
  const escolherArquivos = async (fl: FileList | null) => {
    if (!fl?.length) return;
    const max = meta?.config.anexoMaxKb ?? 2048;
    if (anexos.length + fl.length > MAX_ANEXOS) { setAviso({ tipo: "error", texto: `No máximo ${MAX_ANEXOS} anexos por mensagem.` }); return; }
    try { const lidos = await Promise.all(Array.from(fl).map((f) => lerArquivo(f, max))); setAnexos((a) => [...a, ...lidos]); } catch (e) { setAviso({ tipo: "error", texto: errMsg(e) }); }
    if (arqRef.current) arqRef.current.value = "";
  };
  const buscar = async () => {
    if (!busca || busca.trim().length < 2) return;
    try { setAchados((await eduApi.get<any>(`${M}/busca?q=${encodeURIComponent(busca.trim())}&canalId=${canalId}`)).items); } catch (e) { setAviso({ tipo: "error", texto: errMsg(e) }); }
  };

  // ---------- renderização
  if (carregando && !det) return <Box sx={{ display: "grid", placeItems: "center", height: "100%", minHeight: 320 }}><CircularProgress /></Box>;
  if (erro && !det) return <Box sx={{ p: 3 }}><Alert severity="error" action={<Button color="inherit" size="small" onClick={() => carregar()}>Tentar de novo</Button>}>{erro}</Alert></Box>;
  if (!det) return null;
  const grupos: Array<{ dia: string; itens: Msg[] }> = [];
  for (const m of msgs) { const d = rotuloDia(m.createdAt); const g = grupos[grupos.length - 1]; if (g && g.dia === d) g.itens.push(m); else grupos.push({ dia: d, itens: [m] }); }
  const nomeTitulo = det.nome;
  const podeApagar = (m: Msg) => m.minha || det.podeConfigurar;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* cabeçalho */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: { xs: 1, md: 2 }, py: 1, borderBottom: 1, borderColor: "divider", minHeight: 60 }}>
        {mobile && onVoltar ? <IconButton aria-label="Voltar para a lista" onClick={onVoltar} edge="start"><ArrowBackIcon /></IconButton> : null}
        <Foto nome={nomeTitulo} tipo={det.tipo} size={38} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeTitulo}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ROTULO_TIPO[det.tipo]}{det.tipo !== "DIRETA" ? ` · ${det.membros.length} participante(s)` : ""}{det.restrito && det.tipo !== "DIRETA" ? " · restrito" : ""}{det.respostaAutomatica?.ativa ? " · resposta automática ligada" : ""}
          </Typography>
        </Box>
        {!mobile ? <>
        <Tooltip title="Buscar nesta conversa"><IconButton aria-label="Buscar nesta conversa" onClick={() => setBusca(busca === null ? "" : null)}><SearchIcon /></IconButton></Tooltip>
        <Tooltip title={soFixadas ? "Mostrar tudo" : `Mensagens fixadas (${det.fixadas})`}><span><IconButton aria-label="Mensagens fixadas" color={soFixadas ? "primary" : "default"} disabled={!det.fixadas && !soFixadas} onClick={() => setSoFixadas((v) => !v)}>{soFixadas ? <PushPinIcon /> : <PushPinOutlinedIcon />}</IconButton></span></Tooltip>
        </>
        : null}
        <IconButton aria-label="Mais opções" onClick={(e) => setMenuCanal(e.currentTarget)}><MoreVertIcon /></IconButton>
      </Box>
      {det.contexto ? (
        <Box sx={{ px: 2, py: 0.6, bgcolor: "action.hover", display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", borderBottom: 1, borderColor: "divider" }}>
          <LinkIcon fontSize="small" color="primary" />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}><b>{ROTULO_CONTEXTO[det.contexto.tipo] ?? det.contexto.tipo}:</b> {det.contexto.rotulo}</Typography>
          <Button size="small" endIcon={<OpenInNewIcon />} onClick={() => nav(det.contexto.link)}>Abrir tela</Button>
        </Box>
      ) : null}
      {busca !== null ? (
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
          <TextField size="small" fullWidth autoFocus placeholder="Buscar nesta conversa (mín. 2 letras)" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()}
            slotProps={{ input: { endAdornment: <InputAdornment position="end"><Button size="small" onClick={buscar}>Buscar</Button><IconButton size="small" aria-label="Fechar busca" onClick={() => { setBusca(null); setAchados(null); }}><CloseIcon fontSize="small" /></IconButton></InputAdornment> } }} />
          {achados ? (achados.length ? achados.map((a) => <Typography key={a.id} variant="body2" sx={{ mt: 0.6 }}><b>{horaCurta(a.createdAt)}</b> · {a.autor}: {a.trecho}</Typography>) : <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8 }}>Nada encontrado.</Typography>) : null}
        </Box>
      ) : null}
      {pedidosAqui.length ? (
        <Box sx={{ px: 2, py: 0.8, borderBottom: 1, borderColor: "divider", bgcolor: "warning.light", color: "warning.contrastText" }}>
          {pedidosAqui.map((p) => (
            <Box key={p.id} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <SupportAgentIcon fontSize="small" />
              <Typography variant="body2" sx={{ flex: 1, minWidth: 160 }}><b>{p.solicitante.nome}</b> {ROTULO_MOTIVO[p.motivo] ?? "precisa de uma pessoa"} · {horaCurta(p.createdAt)}</Typography>
              <Button size="small" variant="contained" color="inherit" sx={{ color: "text.primary" }} onClick={() => executar(async () => { await eduApi.post(`${M}/pedidos/${p.id}/assumir`, {}); atualizarResumo(); }, "Você assumiu o pedido.")}>Assumir</Button>
            </Box>
          ))}
        </Box>
      ) : null}

      {/* mensagens */}
      <Box ref={areaRef} onScroll={aoRolar} sx={{ flex: 1, overflowY: "auto", px: { xs: 1, md: 2 }, py: 1.5, bgcolor: (t) => (t.palette.mode === "dark" ? "background.default" : "#F4F7FA") }} role="log" aria-live="polite" aria-label="Mensagens da conversa">
        {temMais && !soFixadas ? <Box sx={{ textAlign: "center", mb: 1 }}><Button size="small" onClick={async () => { try { const r = await eduApi.get<any>(`${M}/canais/${canalId}/mensagens?limite=60&antes=${encodeURIComponent(msgs[0].createdAt)}`); setMsgs((x) => [...r.items, ...x]); setTemMais(r.temMais); } catch (e) { setAviso({ tipo: "error", texto: errMsg(e) }); } }}>Ver mensagens anteriores</Button></Box> : null}
        {!msgs.length ? (
          <Box sx={{ textAlign: "center", color: "text.secondary", py: 6 }}>
            <Typography sx={{ fontWeight: 700 }}>{soFixadas ? "Nenhuma mensagem fixada." : "Nenhuma mensagem ainda."}</Typography>
            {!soFixadas ? <Typography variant="body2">{det.tipo === "DEPARTAMENTO" ? "Escreva para o departamento: ele responde por aqui." : "Comece a conversa abaixo."}</Typography> : null}
          </Box>
        ) : null}
        {grupos.map((g) => (
          <Box key={g.dia}>
            <Box sx={{ textAlign: "center", my: 1 }}><Chip size="small" label={g.dia} sx={{ textTransform: "capitalize" }} /></Box>
            {g.itens.map((m) => {
              const auto = m.autorTipo === "AUTO";
              const sis = mensagemSistema(m);
              if (sis) return <Typography key={m.id} variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", my: 1 }}>{m.conteudo} · {hora(m.createdAt)}</Typography>;
              const ctxMsg = m.metadados?.contexto;
              return (
                <Box key={m.id} sx={{ display: "flex", justifyContent: m.minha ? "flex-end" : "flex-start", mb: 1, gap: 1 }}>
                  {!m.minha ? <Box sx={{ pt: 0.3 }}>{auto ? <Foto nome="Automático" size={30} /> : <Foto nome={m.autor?.nome ?? "?"} size={30} />}</Box> : null}
                  <Paper elevation={0} sx={{
                    maxWidth: { xs: "88%", md: "72%" }, px: 1.4, py: 0.9, borderRadius: 3, border: 1, borderColor: m.fixada ? "warning.main" : auto ? "info.light" : "divider",
                    bgcolor: m.minha ? "primary.main" : auto ? "info.50" : "background.paper", color: m.minha ? "primary.contrastText" : "text.primary",
                    ...(auto ? { bgcolor: (t) => (t.palette.mode === "dark" ? "rgba(2,136,209,.16)" : "#E8F4FD") } : {}),
                  }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, flexWrap: "wrap" }}>
                      {!m.minha ? <Typography variant="caption" sx={{ fontWeight: 800, color: m.minha ? "inherit" : auto ? "info.dark" : "primary.main" }}>{auto ? "Resposta automática" : m.autor?.nome ?? "Usuário removido"}</Typography> : null}
                      {!m.minha && !auto && m.autor?.role ? <Typography variant="caption" color="text.secondary">{ROTULO_PERFIL[m.autor.role] ?? m.autor.role}</Typography> : null}
                      {auto ? <SmartToyOutlinedIcon sx={{ fontSize: 15 }} color="info" /> : null}
                      {m.tipo === "ENCAMINHAMENTO" ? <Selo cor="info">encaminhamento</Selo> : null}
                      {m.tipo === "AUSENCIA" ? <Selo cor="warning">ausência</Selo> : null}
                      {m.fixada ? <PushPinIcon sx={{ fontSize: 14 }} color="warning" titleAccess="Fixada" /> : null}
                    </Box>
                    {m.respostaA ? <Box sx={{ borderLeft: 3, borderColor: m.minha ? "rgba(255,255,255,.7)" : "primary.main", pl: 1, my: 0.5, opacity: 0.85 }}><Typography variant="caption" sx={{ fontWeight: 700 }}>{m.respostaA.autor ?? "Mensagem"}</Typography><Typography variant="caption" sx={{ display: "block" }}>{m.respostaA.trecho}</Typography></Box> : null}
                    {m.removida ? <Typography variant="body2" sx={{ fontStyle: "italic", opacity: 0.7 }}>Mensagem removida</Typography> : <Typography variant="body2" component="div"><TextoMsg texto={m.conteudo} /></Typography>}
                    {ctxMsg && !m.removida ? (
                      <Button size="small" startIcon={<LinkIcon />} onClick={() => nav(ctxMsg.link)} sx={{ mt: 0.5, textTransform: "none", bgcolor: "action.hover", color: "text.primary", borderRadius: 2, maxWidth: "100%", justifyContent: "flex-start", textAlign: "left" }}>{ctxMsg.rotulo}</Button>
                    ) : null}
                    {m.anexos.map((a) => (
                      <Box key={a.id} sx={{ mt: 0.6 }}>
                        <Button size="small" startIcon={<InsertDriveFileOutlinedIcon />} onClick={() => baixar(a).catch((e) => setAviso({ tipo: "error", texto: errMsg(e) }))} sx={{ textTransform: "none", bgcolor: "action.hover", color: "text.primary", borderRadius: 2, maxWidth: "100%", overflow: "hidden" }}>
                          <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</Box>{a.tamanho ? <Box component="span" sx={{ ml: 0.8, opacity: 0.7 }}>{tamanho(a.tamanho)}</Box> : null}
                        </Button>
                      </Box>
                    ))}
                    <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 0.5, mt: 0.3 }}>
                      {m.editada && !m.removida ? <Typography variant="caption" sx={{ opacity: 0.7 }}>editada</Typography> : null}
                      <Typography variant="caption" sx={{ opacity: 0.75 }}>{hora(m.createdAt)}</Typography>
                      {m.minha && m.lidaPor !== undefined ? (m.lidaPor && m.lidaPor >= (m.totalDestinatarios ?? 1) ? <Tooltip title="Lida por todos"><DoneAllIcon sx={{ fontSize: 15 }} /></Tooltip> : m.lidaPor ? <Tooltip title={`Lida por ${m.lidaPor} de ${m.totalDestinatarios}`}><DoneAllIcon sx={{ fontSize: 15, opacity: 0.6 }} /></Tooltip> : <Tooltip title="Enviada"><DoneIcon sx={{ fontSize: 15, opacity: 0.7 }} /></Tooltip>) : null}
                      {!m.removida && !arquivado ? <IconButton size="small" aria-label="Ações da mensagem" onClick={(e) => setMenu({ el: e.currentTarget, m })} sx={{ p: 0.2, color: "inherit", opacity: 0.7 }}><MoreVertIcon sx={{ fontSize: 16 }} /></IconButton> : null}
                    </Box>
                  </Paper>
                </Box>
              );
            })}
          </Box>
        ))}
        <div ref={fimRef} />
      </Box>

      {/* compositor */}
      <Box sx={{ borderTop: 1, borderColor: "divider", p: { xs: 1, md: 1.5 }, bgcolor: "background.paper", position: "relative" }}>
        {aviso ? <Alert severity={aviso.tipo} sx={{ mb: 1 }} onClose={() => setAviso(null)}>{aviso.texto}</Alert> : null}
        {arquivado ? <Alert severity="info">Conversa arquivada: somente leitura.</Alert> : (<>
          {!det.participante ? <Alert severity="info" sx={{ mb: 1 }} action={<Button size="small" onClick={() => executar(() => eduApi.post(`${M}/canais/${canalId}/entrar`, {}), "Você entrou na conversa.")}>Entrar</Button>}>Você está só olhando este canal aberto. Ao enviar uma mensagem, você passa a participar.</Alert> : null}
          {resp ? <Chip sx={{ mb: 0.8, maxWidth: "100%" }} icon={<ReplyIcon />} label={`Respondendo a ${resp.autor?.nome ?? "mensagem"}: ${resp.conteudo.slice(0, 60)}`} onDelete={() => setResp(null)} /> : null}
          {edit ? <Chip sx={{ mb: 0.8 }} color="warning" icon={<EditOutlinedIcon />} label="Editando mensagem" onDelete={() => { setEdit(null); setTexto(""); }} /> : null}
          {ctx ? <Chip sx={{ mb: 0.8, ml: 0.5, maxWidth: "100%" }} color="primary" variant="outlined" icon={<LinkIcon />} label={`${ROTULO_CONTEXTO[ctx.tipo] ?? ctx.tipo}${ctx.rotulo ? `: ${ctx.rotulo}` : ""}`} onDelete={() => setCtx(null)} /> : null}
          {anexos.length ? <Box sx={{ display: "flex", gap: 0.6, flexWrap: "wrap", mb: 0.8 }}>{anexos.map((a, i) => <Chip key={i} size="small" icon={<InsertDriveFileOutlinedIcon />} label={`${a.nome} · ${tamanho(a.tamanho)}`} onDelete={() => setAnexos((x) => x.filter((_, j) => j !== i))} />)}</Box> : null}
          {sugestao && sugestoes.length ? (
            <Paper elevation={4} sx={{ position: "absolute", bottom: "100%", left: 12, right: 12, maxHeight: 220, overflowY: "auto", zIndex: 5 }} role="listbox" aria-label="Sugestões de menção">
              {sugestoes.map((s) => (
                <MenuItem key={`${s.tipo}${s.id}`} onClick={() => escolherSugestao(s)} role="option">
                  <ListItemIcon><Foto nome={s.nome} tipo={s.tipo === "S" ? "DEPARTAMENTO" : undefined} size={28} /></ListItemIcon>
                  <ListItemText primary={s.nome} secondary={s.sub} />
                </MenuItem>
              ))}
            </Paper>
          ) : null}
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "flex-end" }}>
            <input ref={arqRef} type="file" multiple hidden onChange={(e) => escolherArquivos(e.target.files)} />
            <Tooltip title="Anexar arquivo"><span><IconButton aria-label="Anexar arquivo" disabled={!!edit} onClick={() => arqRef.current?.click()}><AttachFileIcon /></IconButton></span></Tooltip>
            {meta ? <Tooltip title="Vincular esta mensagem a um registro do sistema"><span><IconButton aria-label="Vincular a um registro" disabled={!!edit} onClick={() => setDlg("ctxMsg")}><LinkIcon /></IconButton></span></Tooltip> : null}
            <TextField inputRef={campoRef} fullWidth multiline maxRows={6} size="small" placeholder={det.tipo === "DEPARTAMENTO" ? `Mensagem para ${nomeTitulo} (use @ para mencionar)` : "Escreva uma mensagem (use @ para mencionar)"} value={texto}
              onChange={(e) => aoDigitar(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !mobile) { e.preventDefault(); void enviar(); } if (e.key === "Escape") { setSugestao(null); } }} slotProps={{ htmlInput: { maxLength: 4000, "aria-label": "Mensagem" } }} />
            <Tooltip title={edit ? "Salvar edição" : "Enviar"}><span><IconButton color="primary" aria-label="Enviar mensagem" disabled={enviando || (!texto.trim() && !anexos.length)} onClick={enviar}>{enviando ? <CircularProgress size={22} /> : <SendIcon />}</IconButton></span></Tooltip>
          </Box>
          {det.tipo === "DEPARTAMENTO" && det.respostaAutomatica?.ativa ? <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>Este departamento tem resposta automática. Escreva “quero falar com uma pessoa” para chamar alguém da equipe.</Typography> : null}
        </>)}
      </Box>

      {/* menus */}
      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        {menu ? [
          <MenuItem key="r" onClick={() => { setResp(menu.m); setMenu(null); campoRef.current?.focus(); }}><ListItemIcon><ReplyIcon fontSize="small" /></ListItemIcon>Responder</MenuItem>,
          det.participante ? <MenuItem key="f" onClick={() => { const m = menu.m; setMenu(null); void executar(() => (m.fixada ? eduApi.del(`${M}/mensagens/${m.id}/fixar`) : eduApi.post(`${M}/mensagens/${m.id}/fixar`, {})), m.fixada ? "Mensagem desafixada." : "Mensagem fixada."); }}><ListItemIcon><PushPinOutlinedIcon fontSize="small" /></ListItemIcon>{menu.m.fixada ? "Desafixar" : "Fixar"}</MenuItem> : null,
          menu.m.minha && menu.m.tipo === "TEXTO" ? <MenuItem key="e" onClick={() => { setEdit(menu.m); setTexto(menu.m.conteudo); setMenu(null); campoRef.current?.focus(); }}><ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>Editar</MenuItem> : null,
          podeApagar(menu.m) ? <MenuItem key="d" onClick={() => { const m = menu.m; setMenu(null); if (window.confirm("Remover esta mensagem para todos? Os anexos serão apagados.")) void executar(() => eduApi.del(`${M}/mensagens/${m.id}`), "Mensagem removida."); }}><ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>Remover</MenuItem> : null,
        ] : null}
      </Menu>
      <Menu anchorEl={menuCanal} open={!!menuCanal} onClose={() => setMenuCanal(null)}>
        {mobile ? <MenuItem onClick={() => { setMenuCanal(null); setBusca(busca === null ? "" : null); }}><ListItemIcon><SearchIcon fontSize="small" /></ListItemIcon>Buscar nesta conversa</MenuItem> : null}
        {mobile && (det.fixadas > 0 || soFixadas) ? <MenuItem onClick={() => { setMenuCanal(null); setSoFixadas((v) => !v); }}><ListItemIcon><PushPinOutlinedIcon fontSize="small" /></ListItemIcon>{soFixadas ? "Mostrar todas as mensagens" : `Mensagens fixadas (${det.fixadas})`}</MenuItem> : null}
        {det.participante ? <MenuItem onClick={() => { setMenuCanal(null); void executar(() => eduApi.patch(`${M}/canais/${canalId}/preferencias`, { fixado: !det.fixado }), det.fixado ? "Conversa desafixada." : "Conversa fixada no topo da lista."); }}><ListItemIcon><PushPinOutlinedIcon fontSize="small" /></ListItemIcon>{det.fixado ? "Desafixar conversa" : "Fixar conversa no topo"}</MenuItem> : null}
        {det.participante ? <MenuItem onClick={() => { setMenuCanal(null); void executar(() => eduApi.patch(`${M}/canais/${canalId}/preferencias`, { silenciado: !det.silenciado }), det.silenciado ? "Notificações reativadas." : "Conversa silenciada (não conta no contador)."); }}><ListItemIcon><NotificationsOffOutlinedIcon fontSize="small" /></ListItemIcon>{det.silenciado ? "Reativar avisos" : "Silenciar"}</MenuItem> : null}
        {meta?.podeEncaminhar && det.tipo !== "DIRETA" ? <MenuItem onClick={() => { setMenuCanal(null); setDlg("encaminhar"); }}><ListItemIcon><SupportAgentIcon fontSize="small" /></ListItemIcon>Encaminhar atendimento ao departamento…</MenuItem> : null}
        {det.tipo !== "DEPARTAMENTO" && det.participante ? <MenuItem onClick={() => { setMenuCanal(null); setDlg("ctxConversa"); }}><ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>{det.contexto ? "Trocar vínculo com registro…" : "Vincular a um registro…"}</MenuItem> : null}
        <Divider />
        {det.tipo !== "DIRETA" ? <MenuItem onClick={() => { setMenuCanal(null); setDlg("config"); }}><ListItemIcon><SettingsOutlinedIcon fontSize="small" /></ListItemIcon>{det.tipo === "DEPARTAMENTO" ? "Participantes, resposta automática e FAQ" : "Participantes e ajustes"}</MenuItem> : null}
        {det.tipo !== "DIRETA" && det.participante && det.membros.find((x: any) => x.userId === meta?.usuarioId)?.origem !== "SETOR" ? <MenuItem onClick={() => { setMenuCanal(null); if (window.confirm("Sair desta conversa?")) void executar(async () => { await eduApi.post(`${M}/canais/${canalId}/sair`, {}); onMudou(); onVoltar?.(); }); }}>Sair da conversa</MenuItem> : null}
      </Menu>
      <ContextoDialog aberto={dlg === "ctxMsg"} onClose={() => setDlg(null)} onEscolher={(c) => setCtx(c)} />
      <ContextoDialog aberto={dlg === "ctxConversa"} onClose={() => setDlg(null)} onEscolher={(c) => void executar(() => eduApi.put(`${M}/canais/${canalId}/contexto`, { contexto: c ? { tipo: c.tipo, id: c.id } : null }), c ? "Conversa vinculada ao registro." : "Vínculo removido.")} />
      <ConfigCanalDialog aberto={dlg === "config"} onClose={() => setDlg(null)} canalId={canalId} meta={meta} onMudou={() => { void carregar(true); onMudou(); }} />
      <EncaminharDialog aberto={dlg === "encaminhar"} onClose={() => setDlg(null)} canal={{ id: det.id, tipo: det.tipo, nome: det.nome }} onFeito={(id) => { onMudou(); if (id !== canalId) onAbrir(id); else void carregar(true); }} />
    </Box>
  );
}
