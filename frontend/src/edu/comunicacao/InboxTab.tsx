import {
  Badge, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SendIcon from "@mui/icons-material/Send";
import { useCallback, useEffect, useRef, useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { BASE, ROTULO_CANAL, StateBox, StatusPill, asList, fmtDateTime, useLoad, type Toast } from "./common";

const STATUS = ["ABERTA", "PENDENTE", "EM_ATENDIMENTO", "AGUARDANDO_CONTATO", "RESOLVIDA", "ARQUIVADA"];
const SLA_COR: Record<string, string> = { OK: "#2e7d32", ATENCAO: "#ed6c02", ESTOURADO: "#d32f2f", ENCERRADA: "#9e9e9e" };

function Semaforo({ sla }: { sla: string }) {
  return <Box title={`SLA: ${sla}`} sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: SLA_COR[sla] || "#9e9e9e", flex: "0 0 12px" }} />;
}

function NovaConversa({ open, onClose, toast, onDone }: { open: boolean; onClose: () => void; toast: (t: Toast) => void; onDone: (id: string) => void }) {
  const [q, setQ] = useState("");
  const contatos = useLoad<any>(open ? `${BASE}/contatos${qsOf({ q, pageSize: 30 })}` : null);
  const [f, setF] = useState<any>({ canal: "WHATSAPP" });
  async function criar() {
    try {
      const r = await eduApi.post(`${BASE}/conversas`, { contatoId: f.contatoId, canal: f.canal, texto: f.texto, assunto: f.assunto || undefined });
      toast({ type: "success", text: "Conversa iniciada." }); onClose(); setF({ canal: "WHATSAPP" }); onDone(r.conversa?.id);
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Iniciar conversa</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        <TextField size="small" label="Buscar contato" value={q} onChange={(e) => setQ(e.target.value)} />
        <TextField select size="small" label="Contato" value={f.contatoId || ""} onChange={(e) => setF({ ...f, contatoId: e.target.value })}>
          {asList(contatos.data).map((c) => <MenuItem key={c.id} value={c.id}>{c.nome} {c.telefone ? `· ${c.telefone}` : c.email ? `· ${c.email}` : ""}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Canal" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}>
          {["WHATSAPP", "TELEGRAM", "EMAIL", "SMS"].map((c) => <MenuItem key={c} value={c}>{ROTULO_CANAL[c]}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Assunto (opcional)" value={f.assunto || ""} onChange={(e) => setF({ ...f, assunto: e.target.value })} />
        <TextField size="small" label="Primeira mensagem" multiline minRows={3} value={f.texto || ""} onChange={(e) => setF({ ...f, texto: e.target.value })} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!f.contatoId || !f.texto} onClick={criar}>Enviar</Button></DialogActions>
    </Dialog>
  );
}

function Thread({ id, toast, onChanged }: { id: string; toast: (t: Toast) => void; onChanged: () => void }) {
  const conv = useLoad<any>(`${BASE}/conversas/${id}`);
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState(false);
  const [etq, setEtq] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const c = conv.data;

  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [c?.mensagens?.length]);
  useEffect(() => { if (c?.naoLidas) eduApi.post(`${BASE}/conversas/${id}/lida`).then(onChanged).catch(() => undefined); }, [c?.naoLidas, id, onChanged]);

  async function act(fn: () => Promise<any>, ok?: string) {
    try { await fn(); if (ok) toast({ type: "success", text: ok }); conv.reload(); onChanged(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function enviar() {
    await act(async () => { await eduApi.post(`${BASE}/conversas/${id}/mensagens`, { texto: texto.trim(), nota }); setTexto(""); });
  }

  return (
    <StateBox loading={conv.loading && !c} error={conv.error} onRetry={conv.reload}>
      {c ? (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 520 }}>
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Semaforo sla={c.sla} />
            <Box sx={{ flex: 1, minWidth: 160 }}>
              <Typography sx={{ fontWeight: 800 }}>{c.contato?.nome}</Typography>
              <Typography variant="caption" color="text.secondary">{ROTULO_CANAL[c.canalTipo] || c.canalTipo}{c.assunto ? ` · ${c.assunto}` : ""} · {c.botAtivo ? "chatbot respondendo" : c.atribuidoAId ? "com atendente" : "sem atendente"}</Typography>
            </Box>
            <TextField select size="small" value={c.status} onChange={(e) => act(() => eduApi.post(`${BASE}/conversas/${id}/status`, { status: e.target.value }), "Situação atualizada.")} sx={{ minWidth: 190 }}>
              {STATUS.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, " ")}</MenuItem>)}
            </TextField>
            <Button size="small" variant="outlined" onClick={() => act(() => eduApi.post(`${BASE}/conversas/${id}/assumir`), "Você assumiu a conversa.")}>Assumir</Button>
            {c.atribuidoAId ? <Button size="small" onClick={() => act(() => eduApi.post(`${BASE}/conversas/${id}/atribuir`, { userId: null }), "Devolvida à fila.")}>Devolver à fila</Button> : null}
          </Box>
          <Box sx={{ px: 1.5, py: 1, display: "flex", gap: 0.5, alignItems: "center", flexWrap: "wrap" }}>
            {(c.etiquetas || []).map((e: string) => <Chip key={e} size="small" label={e} onDelete={() => act(() => eduApi.post(`${BASE}/conversas/${id}/etiquetas`, { remover: [e] }))} />)}
            <TextField size="small" variant="standard" placeholder="+ etiqueta" value={etq} onChange={(e) => setEtq(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && etq.trim()) { const v = etq.trim(); setEtq(""); act(() => eduApi.post(`${BASE}/conversas/${id}/etiquetas`, { adicionar: [v] })); } }} sx={{ width: 110 }} />
          </Box>
          <Box sx={{ flex: 1, overflowY: "auto", p: 1.5, display: "flex", flexDirection: "column", gap: 1, bgcolor: "action.hover", maxHeight: 420 }}>
            {(c.mensagens || []).length === 0 ? <Typography color="text.secondary" sx={{ textAlign: "center", py: 4 }}>Sem mensagens.</Typography> : null}
            {(c.mensagens || []).map((m: any) => {
              const entrada = m.direcao === "ENTRADA";
              const interna = m.direcao === "NOTA_INTERNA";
              return (
                <Box key={m.id} sx={{ alignSelf: entrada ? "flex-start" : interna ? "center" : "flex-end", maxWidth: "80%" }}>
                  <Paper elevation={0} sx={{ p: 1, px: 1.5, borderRadius: 3, bgcolor: interna ? "warning.light" : entrada ? "background.paper" : "primary.main", color: interna ? "warning.contrastText" : entrada ? "text.primary" : "primary.contrastText" }}>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{interna ? "Nota interna: " : ""}{m.conteudo}</Typography>
                  </Paper>
                  <Typography variant="caption" color="text.secondary">{m.autorTipo === "BOT" || m.autorTipo === "BOT_IA" ? "Bot · " : ""}{fmtDateTime(m.createdAt)}{!entrada && !interna ? ` · ${m.status}` : ""}{m.erro ? ` · ${m.erro}` : ""}</Typography>
                </Box>
              );
            })}
            <div ref={fim} />
          </Box>
          <Box sx={{ p: 1.5, display: "grid", gap: 1, borderTop: 1, borderColor: "divider" }}>
            <TextField multiline minRows={2} maxRows={6} size="small" placeholder={nota ? "Nota interna (não vai ao contato)…" : "Escreva a resposta…"} value={texto} onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && texto.trim()) enviar(); }} />
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <FormControlLabel label="Nota interna" control={<Checkbox size="small" checked={nota} onChange={(e) => setNota(e.target.checked)} />} />
              <Button variant="contained" endIcon={<SendIcon />} disabled={!texto.trim()} onClick={enviar}>{nota ? "Salvar nota" : "Enviar"}</Button>
            </Box>
          </Box>
        </Box>
      ) : null}
    </StateBox>
  );
}

export default function InboxTab({ toast }: { toast: (t: Toast) => void }) {
  const [status, setStatus] = useState("");
  const [atr, setAtr] = useState("");
  const [canal, setCanal] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [data, setData] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await eduApi.get(`${BASE}/conversas${qsOf({ status, atribuido: atr, canal, q, encerradas: status ? undefined : false, pageSize: 60 })}`);
      setData(r); setErro(null);
    } catch (e: any) { setErro(e.message); } finally { setLoading(false); }
  }, [status, atr, canal, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  const rows = asList(data);

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "360px 1fr" }, gap: 2, alignItems: "start" }}>
      <Paper variant="outlined" sx={{ borderRadius: 4, overflow: "hidden" }}>
        <Box sx={{ p: 1.5, display: "grid", gap: 1, borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField size="small" fullWidth placeholder="Buscar nome, telefone, assunto…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button variant="contained" onClick={() => setNovo(true)} aria-label="Nova conversa" sx={{ minWidth: 44 }}><AddIcon /></Button>
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField select size="small" label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ flex: 1 }}>
              <MenuItem value="">Em aberto</MenuItem>{STATUS.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, " ")}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Atendente" value={atr} onChange={(e) => setAtr(e.target.value)} sx={{ flex: 1 }}>
              <MenuItem value="">Todos</MenuItem><MenuItem value="me">Minhas</MenuItem><MenuItem value="none">Na fila</MenuItem>
            </TextField>
          </Box>
          <TextField select size="small" label="Canal" value={canal} onChange={(e) => setCanal(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>{Object.keys(ROTULO_CANAL).filter((k) => k !== "IN_APP").map((k) => <MenuItem key={k} value={k}>{ROTULO_CANAL[k]}</MenuItem>)}
          </TextField>
        </Box>
        <Box sx={{ maxHeight: 560, overflowY: "auto" }}>
          <StateBox loading={loading} error={erro} onRetry={load} empty={!rows.length} emptyText="Nenhuma conversa neste filtro.">
            {rows.map((c) => (
              <Box key={c.id} onClick={() => setSel(c.id)} sx={{ p: 1.5, cursor: "pointer", borderBottom: 1, borderColor: "divider", bgcolor: sel === c.id ? "action.selected" : "transparent", "&:hover": { bgcolor: "action.hover" } }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Semaforo sla={c.sla} />
                  <Typography sx={{ fontWeight: c.naoLidas ? 800 : 600, flex: 1 }} noWrap>{c.contato?.nome}</Typography>
                  {c.naoLidas ? <Badge badgeContent={c.naoLidas} color="error" sx={{ mr: 1 }} /> : null}
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", mt: 0.5, flexWrap: "wrap" }}>
                  <Chip size="small" variant="outlined" label={ROTULO_CANAL[c.canalTipo] || c.canalTipo} />
                  <StatusPill value={c.status} />
                  {!c.atribuidoAId ? <Chip size="small" label="Na fila" color="warning" variant="outlined" /> : null}
                </Box>
                <Typography variant="caption" color="text.secondary">{c.assunto ? `${c.assunto} · ` : ""}{fmtDateTime(c.ultimaMensagemEm)}</Typography>
              </Box>
            ))}
          </StateBox>
        </Box>
      </Paper>
      <Paper variant="outlined" sx={{ borderRadius: 4, overflow: "hidden", minHeight: 520 }}>
        {sel ? <Thread key={sel} id={sel} toast={toast} onChanged={load} /> : <Typography color="text.secondary" sx={{ p: 6, textAlign: "center" }}>Selecione uma conversa para atender.</Typography>}
      </Paper>
      <NovaConversa open={novo} onClose={() => setNovo(false)} toast={toast} onDone={(id) => { load(); if (id) setSel(id); }} />
    </Box>
  );
}
