import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from "@mui/material";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Empty, Feedback, Progress, Status, fmtDate, fmtDateTime, fmtNum, useLoad } from "../secretaria/util";
import { sid, useToast } from "./comum";

const COR: Record<string, "success" | "error" | "warning" | "default"> = { PRESENTE: "success", FALTA: "error", FALTA_JUSTIFICADA: "warning", SEM_REGISTRO: "default" };
const ROT: Record<string, string> = { PRESENTE: "Presente", FALTA: "Falta", FALTA_JUSTIFICADA: "Falta justificada", SEM_REGISTRO: "Sem registro" };

/** Lista de chamadas por disciplina, justificativa de faltas e presença por QR Code. */
export default function PortalFrequencia({ studentId, podeAgir }: { studentId?: string | null; podeAgir: boolean }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/aluno/frequencia${sid(studentId)}`);
  const [aberta, setAberta] = useState<string | null>(null);
  const [just, setJust] = useState<any>(null);
  const [qr, setQr] = useState(false);
  const t = useToast();
  const ds: any[] = data?.disciplinas || [];
  const sel = ds.find((d) => d.classSectionId === aberta) ?? ds[0];

  async function enviar() {
    try {
      await eduApi.post("/portal2/aluno/justificativas", { classSectionId: just.classSectionId || undefined, dataInicio: just.dataInicio, dataFim: just.dataFim, motivo: just.motivo, anexoUrl: just.anexoUrl || undefined, anexoNome: just.anexoNome || undefined });
      setJust(null); t.ok("Justificativa enviada. Você será avisado da decisão."); reload();
    } catch (e: any) { t.err(e.message); }
  }
  async function cancelar(id: string) { try { await eduApi.post(`/portal2/aluno/justificativas/${id}/cancelar`); t.ok("Justificativa cancelada."); reload(); } catch (e: any) { t.err(e.message); } }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {podeAgir && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button variant="contained" startIcon={<QrCodeScannerIcon />} onClick={() => setQr(true)}>Registrar presença (QR da aula)</Button>
          <Button variant="outlined" onClick={() => { const h = new Date().toISOString().slice(0, 10); setJust({ classSectionId: sel?.classSectionId || "", dataInicio: h, dataFim: h, motivo: "" }); }}>Justificar faltas</Button>
        </Box>
      )}
      {!loading && !ds.length && <Empty>Sem disciplinas com chamada neste período.</Empty>}
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" } }}>
        {ds.map((d) => (
          <Paper key={d.classSectionId} variant="outlined" onClick={() => setAberta(d.classSectionId)} sx={{ p: 1.5, borderRadius: 3, cursor: "pointer", borderColor: sel?.classSectionId === d.classSectionId ? "primary.main" : "divider", borderWidth: sel?.classSectionId === d.classSectionId ? 2 : 1 }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Typography sx={{ fontWeight: 800, flex: 1 }} noWrap>{d.disciplina}</Typography>
              <Chip size="small" color={d.emRisco ? "error" : "success"} label={d.frequenciaPct != null ? `${fmtNum(d.frequenciaPct, 0)}%` : "—"} />
            </Box>
            <Progress value={d.frequenciaPct ?? 0} color={d.emRisco ? "error" : "success"} />
            <Typography variant="caption" color="text.secondary">{d.aulas} aula(s) · {d.presencas} presença(s) · {d.faltas} falta(s) · {d.justificadas} justificada(s) · mínimo {d.frequenciaMinima}%{d.margemFaltas != null ? ` · pode faltar mais ${d.margemFaltas}` : ""}</Typography>
          </Paper>
        ))}
      </Box>
      {sel && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Lista de chamadas — {sel.disciplina}</Typography>
          {!sel.linhas.length && <Empty>Nenhuma aula realizada ainda.</Empty>}
          <Box sx={{ display: "grid", gap: 0.75 }}>
            {[...sel.linhas].reverse().map((l: any) => (
              <Box key={l.sessionId} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.5, borderBottom: "1px dashed", borderColor: "divider", flexWrap: "wrap" }}>
                <Typography variant="body2" sx={{ minWidth: 120 }}>{fmtDateTime(l.data)}</Typography>
                <Typography variant="body2" sx={{ flex: 1, minWidth: 140 }}>{l.titulo}</Typography>
                <Chip size="small" color={COR[l.situacao]} label={ROT[l.situacao]} />
              </Box>
            ))}
          </Box>
        </Paper>
      )}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Minhas justificativas</Typography>
        {!(data?.justificativas || []).length && <Empty>Você não enviou justificativas.</Empty>}
        {(data?.justificativas || []).map((j: any) => (
          <Box key={j.id} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.75, borderBottom: "1px dashed", borderColor: "divider", flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtDate(j.dataInicio)} a {fmtDate(j.dataFim)}</Typography>
              <Typography variant="caption" color="text.secondary">{j.motivo}{j.parecer ? ` — Resposta: ${j.parecer}` : j.prazoEm ? ` — prazo de resposta ${fmtDate(j.prazoEm)}` : ""}{j.faltasAbonadas ? ` (${j.faltasAbonadas} falta(s) abonada(s))` : ""}</Typography>
            </Box>
            <Status value={j.status} />
            {podeAgir && j.status === "PENDENTE" && <Button size="small" onClick={() => cancelar(j.id)}>Cancelar</Button>}
          </Box>
        ))}
      </Paper>

      <Dialog open={!!just} onClose={() => setJust(null)} fullWidth maxWidth="sm">
        <DialogTitle>Justificar faltas</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <Alert severity="info">Você tem até 30 dias após a falta para justificar. Se deferida, as faltas do período deixam de contar na frequência (conforme a regra da disciplina).</Alert>
          <TextField select size="small" label="Disciplina" value={just?.classSectionId || ""} onChange={(e) => setJust({ ...just, classSectionId: e.target.value })}>
            <MenuItem value="">Todas as disciplinas</MenuItem>
            {ds.map((d) => <MenuItem key={d.classSectionId} value={d.classSectionId}>{d.disciplina}</MenuItem>)}
          </TextField>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
            <TextField size="small" type="date" label="De" slotProps={{ inputLabel: { shrink: true } }} value={just?.dataInicio || ""} onChange={(e) => setJust({ ...just, dataInicio: e.target.value })} />
            <TextField size="small" type="date" label="Até" slotProps={{ inputLabel: { shrink: true } }} value={just?.dataFim || ""} onChange={(e) => setJust({ ...just, dataFim: e.target.value })} />
          </Box>
          <TextField multiline minRows={3} label="Motivo (mín. 10 caracteres)" value={just?.motivo || ""} onChange={(e) => setJust({ ...just, motivo: e.target.value })} />
          <TextField size="small" label="Link do atestado/comprovante (opcional)" placeholder="https://" value={just?.anexoUrl || ""} onChange={(e) => setJust({ ...just, anexoUrl: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setJust(null)}>Cancelar</Button><Button variant="contained" disabled={(just?.motivo || "").trim().length < 10} onClick={enviar}>Enviar</Button></DialogActions>
      </Dialog>
      <QrDialog open={qr} onClose={() => setQr(false)} onDone={() => { setQr(false); t.ok("Presença registrada!"); reload(); }} onErr={t.err} />
      {t.node}
    </Box>
  );
}

function QrDialog({ open, onClose, onDone, onErr }: { open: boolean; onClose: () => void; onDone: () => void; onErr: (m: string) => void }) {
  const [token, setToken] = useState("");
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Presença por QR Code</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        <Typography variant="body2">Aponte a câmera do celular para o QR Code mostrado pelo professor e cole aqui o código que aparecer, ou digite o código exibido na tela da aula.</Typography>
        <TextField autoFocus label="Código da aula" value={token} onChange={(e) => setToken(e.target.value.trim())} slotProps={{ htmlInput: { autoCapitalize: "off", autoCorrect: "off" } }} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button><Button variant="contained" disabled={token.length < 8} onClick={async () => { try { await eduApi.post("/portal2/aluno/chamada-qr", { token }); setToken(""); onDone(); } catch (e: any) { onErr(e.message); } }}>Registrar presença</Button></DialogActions>
    </Dialog>
  );
}
