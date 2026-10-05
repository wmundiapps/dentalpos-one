import { useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { unlockUserScreen } from "../services/PendingAlertsApi";

const ymd = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);

// Ao destravar, o gestor define o novo prazo para o usuário resolver a pendência.
export default function UnlockDeadlineDialog({ user, onClose, onDone }: { user: { id: string; name: string } | null; onClose: () => void; onDone: () => void }) {
  const [deadline, setDeadline] = useState(() => ymd(new Date(Date.now() + 86400000)));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!user) return;
    setBusy(true);
    setError("");
    try { await unlockUserScreen(user.id, deadline, reason); setReason(""); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível destravar."); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={Boolean(user)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 900 }}>{`Destravar ${user?.name || ""}`}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>Defina o novo prazo para resolver a pendência. Se ela continuar aberta depois dessa data, a tela trava de novo.</Typography>
        <TextField fullWidth type="date" label="Novo prazo" value={deadline} onChange={(e) => setDeadline(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ min: ymd(new Date()), max: ymd(new Date(Date.now() + 30 * 86400000)) }} sx={{ mb: 2 }} />
        <TextField fullWidth label="Motivo / combinado (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={busy || !deadline} onClick={() => void confirm()}>Destravar com este prazo</Button>
      </DialogActions>
    </Dialog>
  );
}
