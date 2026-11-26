import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import { HrApi, STATUS_LABEL, fmtDate, type AbsenceRequest } from "../../services/HrApi";

const TYPE_LABEL: Record<string, string> = { FALTA: "Falta", ATRASO: "Atraso", ATESTADO: "Atestado", OUTRO: "Outro" };
const COLOR: Record<string, "default" | "success" | "warning" | "error" | "info"> = { PENDENTE: "warning", ABONADA: "success", NAO_ABONADA: "error", SANCIONADA: "error" };

export default function RequestsTab({ canDecide }: { canDecide: boolean }) {
  const [rows, setRows] = useState<AbsenceRequest[]>([]);
  const [filter, setFilter] = useState("PENDENTE");
  const [open, setOpen] = useState<AbsenceRequest | null>(null);
  const [decision, setDecision] = useState("ABONAR");
  const [note, setNote] = useState("");
  const [sanctionType, setSanctionType] = useState("Advertência verbal");
  const [days, setDays] = useState("1");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await HrApi.requests(filter || undefined)); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar."); }
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  const openRow = async (r: AbsenceRequest) => {
    try { setOpen(await HrApi.request(r.id)); setDecision("ABONAR"); setNote(""); } catch (e) { setError(e instanceof Error ? e.message : "Erro."); }
  };
  const submit = async () => {
    if (!open) return;
    setBusy(true); setError("");
    try {
      await HrApi.decide(open.id, { decision, note, sanctionType, daysSuspended: Number(days) || 1 });
      setNotice("Decisão registrada."); setOpen(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível registrar."); }
    finally { setBusy(false); }
  };

  return (
    <Box sx={{ p: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}
      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
        <TextField select size="small" label="Situação" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="PENDENTE">Em análise</MenuItem><MenuItem value="ABONADA">Abonadas</MenuItem><MenuItem value="NAO_ABONADA">Não abonadas</MenuItem><MenuItem value="SANCIONADA">Com sanção</MenuItem><MenuItem value="">Todas</MenuItem>
        </TextField>
      </Box>
      {rows.length === 0 && <Typography color="text.secondary">Nenhuma justificativa nesta situação.</Typography>}
      {rows.map((r) => (
        <Box key={r.id} onClick={() => void openRow(r)} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 100px 120px 3fr 80px" }, gap: 1.5, py: 1.3, borderTop: "1px solid", borderColor: "divider", cursor: "pointer", alignItems: "center", "&:hover": { bgcolor: "action.hover" } }}>
          <Typography sx={{ fontWeight: 700 }}>{r.employeeName}</Typography>
          <Typography variant="body2">{fmtDate(r.absenceDate)}</Typography>
          <Box><Chip size="small" label={TYPE_LABEL[r.type] || r.type} /> </Box>
          <Typography variant="body2" color="text.secondary" noWrap>{r.reason}</Typography>
          <Chip size="small" color={COLOR[r.status] || "default"} label={STATUS_LABEL[r.status] || r.status} />
        </Box>
      ))}
      <Dialog open={Boolean(open)} onClose={() => !busy && setOpen(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>{open?.employeeName} — {open && fmtDate(open.absenceDate)}</DialogTitle>
        <DialogContent>
          {open && (<>
            <Typography sx={{ mb: 1 }}><b>{TYPE_LABEL[open.type] || open.type}.</b> {open.reason}</Typography>
            {(open.attachments || []).map((a, i) => (
              <Box key={i} sx={{ my: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{a.name}</Typography>
                {a.mime.startsWith("image/") ? <Box component="img" src={a.dataUrl} alt={a.name} sx={{ display: "block", maxWidth: "100%", maxHeight: 360, border: "1px solid", borderColor: "divider", borderRadius: 1 }} />
                  : <Box><Button size="small" component="a" href={a.dataUrl} download={a.name}>Baixar PDF</Button></Box>}
              </Box>
            ))}
            {open.status !== "PENDENTE" && <Alert severity="info" sx={{ mt: 1 }}>{STATUS_LABEL[open.status]}{open.decisionNote ? `: ${open.decisionNote}` : ""}</Alert>}
            {canDecide && open.status === "PENDENTE" && (
              <Box sx={{ display: "grid", gap: 1.5, mt: 2 }}>
                <TextField select label="Decisão" value={decision} onChange={(e) => setDecision(e.target.value)}>
                  <MenuItem value="ABONAR">Abonar a falta</MenuItem><MenuItem value="NAO_ABONAR">Não abonar</MenuItem><MenuItem value="SANCIONAR">Não abonar e aplicar sanção</MenuItem>
                </TextField>
                {decision === "SANCIONAR" && (
                  <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 1.5 }}>
                    <TextField select label="Sanção" value={sanctionType} onChange={(e) => setSanctionType(e.target.value)}>{["Orientação", "Advertência verbal", "Advertência escrita", "Suspensão"].map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
                    {sanctionType === "Suspensão" && <TextField label="Dias" type="number" value={days} onChange={(e) => setDays(e.target.value)} />}
                  </Box>
                )}
                <TextField multiline minRows={2} label={decision === "ABONAR" ? "Observação (opcional)" : "Motivo da decisão (obrigatório)"} value={note} onChange={(e) => setNote(e.target.value)} />
                <Typography variant="caption" color="text.secondary">Abonar lança o dia como justificado no ponto. A sanção fica registrada em Ocorrências. Aplique sanções com gradação e proporcionalidade, conforme o regulamento da clínica.</Typography>
              </Box>
            )}
          </>)}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setOpen(null)}>Fechar</Button>
          {canDecide && open?.status === "PENDENTE" && <Button variant="contained" disabled={busy} onClick={() => void submit()}>Registrar decisão</Button>}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
