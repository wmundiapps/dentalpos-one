import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Snackbar, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Empty, Feedback, Status, fetchHtml, fmtDate, itemsOf, label, useHtmlPreview, useLoad } from "../secretaria/util";

/** Diálogo de novo requerimento do aluno (GET /secretaria/portal/tipos, POST /secretaria/portal/protocolos). */
export function NovoRequerimento({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const tipos = useLoad<any>(open ? "/secretaria/portal/tipos" : null);
  const [f, setF] = useState<any>({});
  const [err, setErr] = useState<string | null>(null);
  const lista = itemsOf(tipos.data);
  const tipo = lista.find((t) => t.id === f.tipoId);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Novo requerimento</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Feedback loading={tipos.loading} error={tipos.error} />
        <TextField select size="small" label="O que você precisa?" value={f.tipoId || ""} onChange={(e) => setF({ ...f, tipoId: e.target.value })}>
          {lista.map((t) => <MenuItem key={t.id} value={t.id}>{t.nome}</MenuItem>)}
        </TextField>
        {tipo && <Alert severity="info">Prazo de resposta: {tipo.slaDias} dia(s) úteis.{tipo.taxa > 0 ? ` Taxa: R$ ${Number(tipo.taxa).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.` : ""}{tipo.exigeAnexo ? " Será necessário anexar documentos." : ""}</Alert>}
        <TextField size="small" label="Assunto" value={f.assunto || ""} onChange={(e) => setF({ ...f, assunto: e.target.value })} />
        <TextField multiline minRows={3} label="Descreva sua solicitação" value={f.descricao || ""} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={!f.tipoId} onClick={async () => { setErr(null); try { await eduApi.post("/secretaria/portal/protocolos", { tipoId: f.tipoId, assunto: f.assunto || undefined, descricao: f.descricao || undefined }); setF({}); onDone(); } catch (e: any) { setErr(e.message); } }}>Enviar requerimento</Button></DialogActions>
    </Dialog>
  );
}

/** Pedido de revisão de nota (POST /notas/revisoes). */
export function RevisaoDialog({ alvo, onClose, onDone }: { alvo: { classSectionId: string; componenteId: string; titulo: string } | null; onClose: () => void; onDone: () => void }) {
  const [j, setJ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open={!!alvo} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Solicitar revisão de nota</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Typography>{alvo?.titulo}</Typography>
        <TextField multiline minRows={4} label="Motivo da revisão (mín. 20 caracteres)" value={j} onChange={(e) => setJ(e.target.value)} helperText={`${j.trim().length}/20`} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={j.trim().length < 20} onClick={async () => { setErr(null); try { await eduApi.post("/notas/revisoes", { classSectionId: alvo!.classSectionId, componenteId: alvo!.componenteId, justificativa: j }); setJ(""); onDone(); } catch (e: any) { setErr(e.message); } }}>Solicitar</Button></DialogActions>
    </Dialog>
  );
}

/** Meus documentos: declarações imediatas e certificados (portal). */
export function MeusDocumentos() {
  const docs = useLoad<any>("/secretaria/portal/documentos");
  const certs = useLoad<any>("/secretaria/portal/certificados");
  const { show, dialog } = useHtmlPreview();
  const [msg, setMsg] = useState<{ t: "success" | "error"; m: string } | null>(null);
  async function emitir(tipo: string) {
    show(tipo === "DECLARACAO_MATRICULA" ? "Declaração de matrícula" : "Declaração de vínculo", () => fetchHtml("/secretaria/portal/documentos/emitir?formato=html", "POST", { tipo }));
    setTimeout(() => docs.reload(), 1500);
  }
  const ld = itemsOf(docs.data);
  const lc = itemsOf(certs.data);
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button variant="contained" onClick={() => emitir("DECLARACAO_MATRICULA")}>Declaração de matrícula</Button>
        <Button variant="outlined" onClick={() => emitir("DECLARACAO_VINCULO")}>Declaração de vínculo</Button>
      </Box>
      <Typography variant="caption" color="text.secondary">Documentos com código de verificação, prontos para imprimir ou salvar em PDF.</Typography>
      <Feedback loading={docs.loading} error={docs.error} />
      {ld.map((d) => (
        <Paper key={d.id} variant="outlined" sx={{ p: 1, px: 1.5, display: "flex", alignItems: "center", gap: 1, borderRadius: 2 }}>
          <Typography variant="body2" sx={{ flex: 1 }}>{label(d.tipo)} · {fmtDate(d.createdAt)} · <code>{d.codigo}</code></Typography>
          <Button size="small" onClick={() => show(label(d.tipo), () => fetchHtml(`/secretaria/portal/documentos/${d.id}/html`))}>Abrir</Button>
        </Paper>
      ))}
      {lc.length > 0 && <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Meus certificados</Typography>}
      {lc.map((c) => (
        <Paper key={c.id} variant="outlined" sx={{ p: 1, px: 1.5, display: "flex", alignItems: "center", gap: 1, borderRadius: 2 }}>
          <Typography variant="body2" sx={{ flex: 1 }}>{c.tituloEvento || c.numero} · {fmtDate(c.emitidoEm)} <Status value={c.status} /></Typography>
          <Button size="small" onClick={() => show("Certificado", () => fetchHtml(`/secretaria/portal/certificados/${c.id}/html`))}>Abrir</Button>
        </Paper>
      ))}
      {!ld.length && !lc.length && !docs.loading && <Empty>Nenhum documento emitido ainda.</Empty>}
      {dialog}
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>{msg ? <Alert severity={msg.t}>{msg.m}</Alert> : undefined}</Snackbar>
    </Box>
  );
}
