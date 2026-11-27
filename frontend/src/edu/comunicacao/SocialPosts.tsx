import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Pagination, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { BASE, Section, StateBox, StatusPill, asList, fmtDateTime, useLoad, type Toast } from "./common";

const STATUS = ["RASCUNHO", "EM_APROVACAO", "APROVADO", "REJEITADO", "PUBLICADO", "MANUAL", "FALHA", "CANCELADO"];
export const REDES = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK", "YOUTUBE", "X"];

function PostDialog({ open, post, onClose, toast, onDone }: { open: boolean; post: any | null; onClose: () => void; toast: (t: Toast) => void; onDone: () => void }) {
  const contas = useLoad<any[]>(open ? `${BASE}/social/contas` : null);
  const [f, setF] = useState<any>({});
  const [ref, setRef] = useState<any>(null);
  if (open && ref !== (post ?? "novo")) {
    setRef(post ?? "novo");
    setF(post ? { contaId: post.contaId, titulo: post.titulo, texto: post.texto, tema: post.tema || "", midias: (post.midiaUrls || []).join("\n"), agendadoPara: post.agendadoPara ? String(post.agendadoPara).slice(0, 16) : "" } : {});
  }
  if (!open && ref !== null) setRef(null);
  const conta = asList(contas.data).find((c) => c.id === f.contaId);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function salvar() {
    const midiaUrls = String(f.midias || "").split(/\s+/).filter(Boolean);
    const body: any = { contaId: f.contaId, titulo: f.titulo, texto: f.texto, midiaUrls, tema: f.tema || undefined, agendadoPara: f.agendadoPara ? new Date(f.agendadoPara).toISOString() : null };
    try {
      let r: any;
      if (post) { const { contaId: _c, ...resto } = body; r = await eduApi.patch(`${BASE}/social/posts/${post.id}`, resto); } else r = await eduApi.post(`${BASE}/social/posts`, body);
      toast({ type: r?.avisos?.length ? "error" : "success", text: r?.avisos?.length ? `Salvo, mas: ${r.avisos.join(" ")}` : "Post salvo." }); onClose(); onDone();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{post ? "Editar post" : "Novo post"}</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        <StateBox loading={contas.loading} error={contas.error} empty={!asList(contas.data).length} emptyText="Cadastre uma conta de rede social primeiro.">
          <TextField select size="small" label="Conta" value={f.contaId || ""} onChange={set("contaId")} disabled={!!post}>
            {asList(contas.data).filter((c) => c.ativa).map((c) => <MenuItem key={c.id} value={c.id}>{c.rede} — {c.nome}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Título interno" value={f.titulo || ""} onChange={set("titulo")} />
          <TextField size="small" label="Texto" multiline minRows={4} value={f.texto || ""} onChange={set("texto")} helperText={conta?.rede === "X" ? `${(f.texto || "").length}/280 caracteres` : `${(f.texto || "").length} caracteres`} />
          <TextField size="small" label="Links de mídia (um por linha)" multiline minRows={2} value={f.midias || ""} onChange={set("midias")} helperText="Instagram, TikTok e YouTube exigem ao menos uma mídia." />
          <TextField size="small" label="Tema / pauta" value={f.tema || ""} onChange={set("tema")} />
          <TextField size="small" type="datetime-local" label="Agendar para" value={f.agendadoPara || ""} onChange={set("agendadoPara")} slotProps={{ inputLabel: { shrink: true } }} />
        </StateBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!f.contaId || !f.titulo || f.titulo.length < 3 || !f.texto} onClick={salvar}>Salvar</Button></DialogActions>
    </Dialog>
  );
}

export default function SocialPosts({ toast }: { toast: (t: Toast) => void }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const list = useLoad<any>(`${BASE}/social/posts${qsOf({ status, page, pageSize: 20 })}`);
  const [edit, setEdit] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const rows = asList(list.data);
  const total = list.data?.total ?? rows.length;

  async function act(path: string, ok: string, body: any = {}) {
    try { await eduApi.post(`${BASE}/social/posts/${path}`, body); toast({ type: "success", text: ok }); list.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Section title="Publicações" description="Fluxo: rascunho → aprovação → publicação. Contas sem token são publicadas manualmente e marcadas como publicadas."
      actions={<Box sx={{ display: "flex", gap: 1 }}>
        <TextField select size="small" label="Situação" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} sx={{ minWidth: 170 }}>
          <MenuItem value="">Todas</MenuItem>{STATUS.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, " ")}</MenuItem>)}
        </TextField>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEdit(null); setOpen(true); }}>Novo post</Button>
      </Box>}>
      <StateBox loading={list.loading} error={list.error} onRetry={list.reload} empty={!rows.length} emptyText="Nenhum post.">
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow>{["Post", "Conta", "Agendado", "Situação", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell sx={{ maxWidth: 320 }}><b>{p.titulo}</b><Typography variant="caption" color="text.secondary" component="div" noWrap>{p.texto}</Typography>
                    {p.motivoRejeicao ? <Typography variant="caption" color="error" component="div">Rejeitado: {p.motivoRejeicao}</Typography> : null}
                    {p.erro ? <Typography variant="caption" color="error" component="div">{p.erro}</Typography> : null}
                    {p.urlPublicado ? <Typography variant="caption" component="div"><a href={p.urlPublicado} target="_blank" rel="noreferrer">Ver publicação</a></Typography> : null}</TableCell>
                  <TableCell>{p.conta?.rede} — {p.conta?.nome}</TableCell><TableCell>{p.agendadoPara ? fmtDateTime(p.agendadoPara) : "—"}</TableCell>
                  <TableCell><StatusPill value={p.status} /></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {["RASCUNHO", "REJEITADO"].includes(p.status) ? <Button size="small" onClick={() => { setEdit(p); setOpen(true); }}>Editar</Button> : null}
                    {["RASCUNHO", "REJEITADO"].includes(p.status) ? <Button size="small" onClick={() => act(`${p.id}/enviar-aprovacao`, "Enviado para aprovação.")}>Enviar p/ aprovação</Button> : null}
                    {p.status === "EM_APROVACAO" ? <>
                      <Button size="small" color="success" onClick={() => act(`${p.id}/aprovar`, "Post aprovado.")}>Aprovar</Button>
                      <Button size="small" color="error" onClick={() => { const m = window.prompt("Motivo da rejeição:"); if (m && m.length >= 3) act(`${p.id}/rejeitar`, "Post rejeitado.", { motivo: m }); }}>Rejeitar</Button>
                    </> : null}
                    {["APROVADO", "FALHA"].includes(p.status) ? <Button size="small" color="success" onClick={() => { if (window.confirm("Publicar agora na rede social?")) act(`${p.id}/publicar`, "Publicação enviada."); }}>Publicar</Button> : null}
                    {["APROVADO", "FALHA", "MANUAL"].includes(p.status) ? <Button size="small" onClick={() => { const u = window.prompt("Link da publicação (opcional):") ; if (u !== null) act(`${p.id}/marcar-publicado`, "Marcado como publicado.", u ? { url: u } : {}); }}>Marcar publicado</Button> : null}
                    {!["PUBLICADO", "CANCELADO"].includes(p.status) ? <Button size="small" color="error" onClick={() => { if (window.confirm("Cancelar este post?")) act(`${p.id}/cancelar`, "Post cancelado."); }}>Cancelar</Button> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        {total > 20 ? <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / 20)} page={page} onChange={(_, v) => setPage(v)} /></Box> : null}
      </StateBox>
      <Alert severity="info" sx={{ mt: 2 }}>Aprovar e publicar exigem perfil de Marketing ou Coordenação.</Alert>
      <PostDialog open={open} post={edit} onClose={() => setOpen(false)} toast={toast} onDone={list.reload} />
    </Section>
  );
}
