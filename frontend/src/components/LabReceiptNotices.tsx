import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from "@mui/material";
import ScienceIcon from "@mui/icons-material/Science";
import { loadPendingLabReceipts, registerLabReceipt, type LabServiceOrder } from "../services/LabServiceOrderApi";

// Contador de ordens novas aguardando o laboratório (só quem tem a função de laboratório vê; os demais recebem 403 e o número fica em 0).
export function useLabPendingCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () => loadPendingLabReceipts().then((r) => { if (alive) setN(r.length); }).catch(() => { if (alive) setN(0); });
    tick();
    const t = setInterval(tick, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return n;
}

// Notificação de ordem de serviço nova: o laboratório abre, confere o código impresso na ordem que acompanha o trabalho e confirma o recebimento.
export default function LabReceiptNotices() {
  const [rows, setRows] = useState<LabServiceOrder[] | null>(null);
  const [target, setTarget] = useState<LabServiceOrder | null>(null);
  const [outcome, setOutcome] = useState<"RECEIVED" | "REFUSED">("RECEIVED");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = useCallback(() => loadPendingLabReceipts().then(setRows).catch(() => setRows(null)), []);
  useEffect(() => { void load(); }, [load]);
  if (!rows) return null;

  const confirm = async () => {
    if (!target) return;
    setBusy(true); setError("");
    try {
      await registerLabReceipt(target.id, outcome, name.trim(), reason.trim(), code.trim());
      setDone(`${target.protocol}: ${outcome === "RECEIVED" ? "recebimento confirmado" : "recusa registrada"}.`); setTarget(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível confirmar."); } finally { setBusy(false); }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, mb: 3, borderColor: rows.length ? "warning.main" : "divider" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <ScienceIcon color={rows.length ? "warning" : "disabled"} />
        <Typography sx={{ fontWeight: 900, fontSize: 18 }}>Ordens de serviço novas para o laboratório ({rows.length})</Typography>
      </Box>
      {done && <Alert severity="success" sx={{ mb: 1 }} onClose={() => setDone("")}>{done}</Alert>}
      {rows.length === 0 ? <Typography color="text.secondary">Nenhuma ordem aguardando confirmação de recebimento.</Typography> : rows.map((o) => (
        <Box key={o.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", py: 1.25, borderTop: "1px solid", borderColor: "divider" }}>
          <Box>
            <Typography sx={{ fontWeight: 800 }}>{o.protocol} • {o.service}</Typography>
            <Typography variant="body2" color="text.secondary">Paciente {o.patientName} • Dr(a). {o.dentistName} • entrega até {new Date(o.dueAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })}{o.shade ? ` • cor ${o.shade}` : ""}{o.elements ? ` • dentes ${o.elements}` : ""}</Typography>
          </Box>
          <Button variant="contained" color="warning" onClick={() => { setTarget(o); setOutcome("RECEIVED"); setCode(""); setName(""); setReason(""); setError(""); }}>Confirmar recebimento</Button>
        </Box>
      ))}

      <Dialog open={Boolean(target)} onClose={() => !busy && setTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 900 }}>Confirmar recebimento — {target?.protocol}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <Typography variant="body2" color="text.secondary">Digite o <b>código de recebimento</b> impresso na ordem de serviço que veio junto com o trabalho de {target?.patientName}.</Typography>
          <TextField select label="Resultado" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
            <MenuItem value="RECEIVED">Recebido</MenuItem><MenuItem value="REFUSED">Recusado</MenuItem>
          </TextField>
          <TextField label="Código de recebimento (6 números)" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} slotProps={{ htmlInput: { inputMode: "numeric", style: { fontSize: 24, letterSpacing: 6, textAlign: "center" } } }} autoFocus />
          <TextField label="Nome de quem recebeu no laboratório" value={name} onChange={(e) => setName(e.target.value)} />
          {outcome === "REFUSED" && <TextField label="Motivo da recusa" value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} />}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setTarget(null)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || code.length < 6 || !name.trim() || (outcome === "REFUSED" && !reason.trim())} onClick={() => void confirm()}>{busy ? "Confirmando..." : "Confirmar"}</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
