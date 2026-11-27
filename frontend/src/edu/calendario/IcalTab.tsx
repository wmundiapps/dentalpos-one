import { Alert, Box, Button, MenuItem, Paper, TextField, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LinkIcon from "@mui/icons-material/Link";
import DownloadIcon from "@mui/icons-material/Download";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { baixarArquivo, fmtDT, itemsOf, Row, useGet, useTerms, useToast } from "./kit";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const absolute = (u: string) => (u.startsWith("http") ? u : `${API.replace(/\/api\/?$/, "")}${u}`);
const ESCOPOS = [["INSTITUCIONAL", "Calendário institucional"], ["ALUNO", "Meu calendário de aluno"], ["PROFESSOR", "Agenda de professor"], ["TURMA", "Turma (informar ID)"], ["ESPACO", "Espaço (informar ID)"]];

export default function IcalTab() {
  const terms = useTerms();
  const feeds = useGet<any>("/calendario/feeds");
  const [escopo, setEscopo] = useState("INSTITUCIONAL");
  const [refId, setRefId] = useState(""); const [termId, setTermId] = useState(""); const [titulo, setTitulo] = useState("");
  const [novo, setNovo] = useState<any>(null);
  const { toast, node } = useToast();
  const precisaRef = ["TURMA", "ESPACO"].includes(escopo);

  async function criar() {
    try { const r = await eduApi.post("/calendario/feeds", { escopo, refId: refId || undefined, termId: termId || undefined, titulo: titulo || undefined }); setNovo(r); feeds.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function copiar(u: string) { try { await navigator.clipboard.writeText(absolute(u)); toast({ type: "success", text: "Link copiado." }); } catch { toast({ type: "info", text: absolute(u) }); } }
  async function revogar(id: string) {
    if (!window.confirm("Revogar este link? Quem já o assinou deixará de receber atualizações.")) return;
    try { await eduApi.del(`/calendario/feeds/${id}`); feeds.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function baixar() { try { await baixarArquivo("/calendario/meu-calendario.ics", "meu-calendario.ics"); } catch (e: any) { toast({ type: "error", text: e.message }); } }

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>Assine o calendário no Google Agenda, Outlook ou Apple Calendário usando um link iCal (.ics). Trate o link como uma senha: quem o possui enxerga a agenda.</Alert>
      <Row><Button variant="outlined" startIcon={<DownloadIcon />} onClick={baixar}>Baixar meu calendário (.ics)</Button></Row>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Novo link de assinatura</Typography>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <TextField select size="small" label="Escopo" value={escopo} onChange={(e) => setEscopo(e.target.value)}>{ESCOPOS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
          {precisaRef ? <TextField size="small" required label="ID de referência" value={refId} onChange={(e) => setRefId(e.target.value)} /> : null}
          <TextField select size="small" label="Período letivo (opcional)" value={termId} onChange={(e) => setTermId(e.target.value)}><MenuItem value="">Todos</MenuItem>{terms.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}</TextField>
          <TextField size="small" label="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </Box>
        <Button sx={{ mt: 2 }} variant="contained" startIcon={<LinkIcon />} disabled={precisaRef && !refId} onClick={criar}>Gerar link</Button>
        {novo ? <Alert severity="success" sx={{ mt: 2 }} action={<Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copiar(novo.url)}>Copiar</Button>}><Box sx={{ wordBreak: "break-all" }}>{absolute(novo.url)}</Box></Alert> : null}
      </Paper>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Links ativos</Typography>
      {feeds.error ? <Alert severity="warning">Não foi possível carregar os links: {feeds.error}</Alert> : !itemsOf(feeds.data).length ? <Typography color="text.secondary">Nenhum link criado.</Typography> : itemsOf(feeds.data).map((f: any) => (
        <Paper key={f.id} variant="outlined" sx={{ p: 1.5, mb: 1, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography sx={{ fontWeight: 700 }}>{f.titulo || f.escopo}</Typography>
            <Typography variant="caption" color="text.secondary">{f.escopo} · criado em {fmtDT(f.createdAt)} · último acesso: {f.ultimoAcesso ? fmtDT(f.ultimoAcesso) : "nunca"}</Typography>
          </Box>
          <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copiar(f.url)}>Copiar link</Button>
          <Button size="small" color="error" onClick={() => revogar(f.id)}>Revogar</Button>
        </Paper>
      ))}
      {node}
    </Box>
  );
}
