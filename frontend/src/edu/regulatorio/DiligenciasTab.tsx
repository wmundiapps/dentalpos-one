import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import { fmtDate, label, Section, Status, useApi, useToast } from "./ui";

export default function DiligenciasTab() {
  const [status, setStatus] = useState("");
  const { data, loading, error, reload } = useApi<any>(`/regulatorio/diligencias?pageSize=100${status ? `&status=${status}` : ""}`);
  const [resp, setResp] = useState<any | null>(null);
  const [texto, setTexto] = useState("");
  const { toast, node } = useToast();
  const items: any[] = data?.items || [];

  async function act(d: any, acao: "cumprir" | "cancelar") {
    if (!window.confirm(acao === "cancelar" ? "Cancelar esta diligência?" : "Marcar como cumprida?")) return;
    try { await eduApi.post(`/regulatorio/diligencias/${d.id}/${acao}`, {}); toast({ type: "success", text: "Diligência atualizada." }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function responder() {
    try { await eduApi.post(`/regulatorio/diligencias/${resp.id}/responder`, { resposta: texto }); setResp(null); setTexto(""); toast({ type: "success", text: "Resposta registrada." }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Section title="Diligências" action={
      <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}>
        <MenuItem value="">Todas</MenuItem>{["ABERTA", "VENCIDA", "RESPONDIDA", "CUMPRIDA", "CANCELADA"].map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}
      </TextField>}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Novas diligências são registradas dentro do processo (aba Processos, abra o cartão).</Typography>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!items.length} emptyText="Nenhuma diligência.">
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Processo</TableCell><TableCell>Descrição</TableCell><TableCell>Prazo</TableCell><TableCell>Status</TableCell><TableCell align="right" /></TableRow></TableHead>
            <TableBody>
              {items.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell>{d.processo?.titulo || "—"}</TableCell>
                  <TableCell sx={{ maxWidth: 360 }}>{d.descricao}</TableCell>
                  <TableCell>{fmtDate(d.prazoResposta)}<br /><Typography variant="caption" color={d.diasParaPrazo < 0 ? "error" : "text.secondary"}>{d.diasParaPrazo < 0 ? `${-d.diasParaPrazo}d em atraso` : `${d.diasParaPrazo}d`}</Typography></TableCell>
                  <TableCell><StatusChip value={d.status} /></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {["ABERTA", "VENCIDA"].includes(d.status) && <Button size="small" onClick={() => { setResp(d); setTexto(""); }}>Responder</Button>}
                    {d.status === "RESPONDIDA" && <Button size="small" color="success" onClick={() => act(d, "cumprir")}>Cumprida</Button>}
                    {["ABERTA", "VENCIDA"].includes(d.status) && <Button size="small" color="error" onClick={() => act(d, "cancelar")}>Cancelar</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Status>
      <Dialog open={!!resp} onClose={() => setResp(null)} fullWidth maxWidth="sm">
        <DialogTitle>Responder diligência</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>{resp?.descricao}</Typography>
          <TextField fullWidth multiline minRows={5} label="Texto da resposta" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </DialogContent>
        <DialogActions><Button onClick={() => setResp(null)}>Cancelar</Button><Button variant="contained" disabled={!texto.trim()} onClick={responder}>Enviar resposta</Button></DialogActions>
      </Dialog>
      {node}
    </Section>
  );
}
