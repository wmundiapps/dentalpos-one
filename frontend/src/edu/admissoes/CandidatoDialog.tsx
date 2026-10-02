import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, TextField, Typography,
} from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { StatusChip } from "../EduResourcePage";
import { BASE, StateBox, fmtDateTime, useLoad, type Toast } from "./common";

const TIPOS_INTERACAO = ["NOTA", "LIGACAO", "WHATSAPP", "EMAIL", "VISITA"];

/** Ficha do candidato: dados, histórico de interações, follow-up e ações financeiras. */
export default function CandidatoDialog({ id, onClose, toast, onChanged }: { id: string | null; onClose: () => void; toast: (t: Toast) => void; onChanged: () => void }) {
  const c = useLoad<any>(id ? `${BASE}/candidatos/${id}` : null);
  const [tipo, setTipo] = useState("NOTA");
  const [desc, setDesc] = useState("");
  const [quando, setQuando] = useState("");

  async function act(fn: () => Promise<any>, ok: string) {
    try { await fn(); toast({ type: "success", text: ok }); c.reload(); onChanged(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  const d = c.data;

  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{d ? d.nome : "Candidato"} {d ? <StatusChip value={d.status} /> : null}</DialogTitle>
      <DialogContent dividers>
        <StateBox loading={c.loading} error={c.error} onRetry={c.reload}>
          {d ? (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 0.5 }}>
                <Typography variant="body2"><b>Protocolo:</b> {d.protocolo}</Typography>
                <Typography variant="body2"><b>Processo:</b> {d.processo?.nome || "— (lead)"}</Typography>
                <Typography variant="body2"><b>E-mail:</b> {d.email || "—"}</Typography>
                <Typography variant="body2"><b>Telefone:</b> {d.telefone || "—"}</Typography>
                <Typography variant="body2"><b>CPF:</b> {d.cpf || "—"}</Typography>
                <Typography variant="body2"><b>Origem:</b> {d.origem || "—"}</Typography>
                <Typography variant="body2"><b>Nota final:</b> {d.notaFinal != null ? Number(d.notaFinal).toFixed(1) : "—"}</Typography>
                <Typography variant="body2"><b>Próximo contato:</b> {d.proximoContatoEm ? fmtDateTime(d.proximoContatoEm) : "—"}</Typography>
                <Typography variant="body2"><b>Taxa de inscrição:</b> {d.taxaPaga ? "paga / isenta" : d.taxaReceivableId ? "cobrança gerada" : "sem cobrança"}</Typography>
                <Typography variant="body2"><b>Matrícula:</b> {d.matricula ? String(d.matricula.status).replace(/_/g, " ") : "—"}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {d.processoId && !d.taxaPaga ? <Button size="small" variant="outlined" onClick={() => act(() => eduApi.post(`${BASE}/candidatos/${d.id}/gerar-cobranca`), "Cobrança da inscrição gerada.")}>Gerar cobrança da taxa</Button> : null}
                {d.processoId && !d.taxaPaga ? (
                  <Button size="small" variant="outlined" color="warning" onClick={() => {
                    const motivo = window.prompt("Motivo da isenção da taxa:");
                    if (motivo && motivo.length >= 3) act(() => eduApi.post(`${BASE}/candidatos/${d.id}/isentar-taxa`, { motivo }), "Taxa isentada.");
                  }}>Isentar taxa</Button>
                ) : null}
              </Box>
              <Divider />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Registrar interação</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 130 }}>
                  {TIPOS_INTERACAO.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </TextField>
                <TextField size="small" label="Descrição" value={desc} onChange={(e) => setDesc(e.target.value)} sx={{ flex: 1, minWidth: 220 }} />
                <Button variant="contained" size="small" disabled={desc.trim().length < 2}
                  onClick={() => act(async () => { await eduApi.post(`${BASE}/candidatos/${d.id}/interacoes`, { tipo, descricao: desc.trim() }); setDesc(""); }, "Interação registrada.")}>Registrar</Button>
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                <TextField size="small" type="datetime-local" label="Agendar follow-up" value={quando} onChange={(e) => setQuando(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                <Button size="small" variant="outlined" disabled={!quando}
                  onClick={() => act(async () => { await eduApi.post(`${BASE}/candidatos/${d.id}/follow-up`, { quando: new Date(quando).toISOString() }); setQuando(""); }, "Follow-up agendado.")}>Agendar</Button>
              </Box>
              <Divider />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Histórico</Typography>
              {(d.interacoes || []).length === 0 ? <Typography color="text.secondary" variant="body2">Sem interações registradas.</Typography> : (
                <Box sx={{ display: "grid", gap: 1, maxHeight: 240, overflowY: "auto" }}>
                  {d.interacoes.map((i: any) => (
                    <Box key={i.id} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                      <Chip size="small" label={i.tipo} />
                      <Typography variant="body2" sx={{ flex: 1 }}>{i.descricao}</Typography>
                      <Typography variant="caption" color="text.secondary">{fmtDateTime(i.createdAt)}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          ) : null}
        </StateBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}
