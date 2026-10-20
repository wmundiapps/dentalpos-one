import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, Typography } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import { justifyPending, loadPendingAlerts, PENDING_ALERTS_EVENT, unlockPendingAlerts, type PendingAlerts } from "../services/PendingAlertsApi";

// Travamento diário do departamento: enquanto a pendência não for resolvida, só as telas onde ela se resolve ficam abertas.
// Para liberar: resolver (a tela abre sozinha), justificar por escrito ou usar a chave do gestor. O gestor recebe e-mail de cada caso.
export default function PendingLockGate({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PendingAlerts | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const location = useLocation();

  const load = useCallback(async () => {
    if (!localStorage.getItem("dentalpos.token")) return;
    try { setData(await loadPendingAlerts()); } catch { /* o aviso nunca atrapalha o uso */ }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    window.addEventListener(PENDING_ALERTS_EVENT, load);
    return () => { window.clearInterval(timer); window.removeEventListener(PENDING_ALERTS_EVENT, load); };
  }, [load]);

  if (!data?.blocked) return <>{children}</>;
  const resolvable = data.items.some((i) => location.pathname === i.path || location.pathname.startsWith(`${i.path}/`));

  const submit = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await fn(); setOpen(false); setText(""); setKey(""); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  };

  const bar = (
    <Alert severity="error" icon={<LockIcon />} sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => setOpen(true)}>Justificar ou destravar</Button>}>
      Sistema travado para o seu departamento: pendências não resolvidas. Resolva ou justifique para liberar.
    </Alert>
  );

  return (
    <>
      {resolvable ? <>{bar}{children}</> : (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, maxWidth: 720, mx: "auto", mt: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}><LockIcon color="error" /><Typography variant="h5" sx={{ fontWeight: 800 }}>Sistema travado hoje</Typography></Box>
          <Typography sx={{ mb: 2 }}>O seu departamento não resolveu as pendências abaixo. Resolva-as para liberar o sistema, ou justifique por escrito. Se não forem resolvidas, seu gestor será notificado por e-mail.</Typography>
          <Box sx={{ display: "grid", gap: 1, mb: 3 }}>
            {data.items.map((i) => (
              <Box key={i.key} sx={{ display: "flex", gap: 2, alignItems: "center", justifyContent: "space-between" }}>
                <Typography variant="body2">{i.label}</Typography>
                <Button component={RouterLink} to={i.path} variant="contained" size="small" sx={{ whiteSpace: "nowrap" }}>Ir resolver</Button>
              </Box>
            ))}
          </Box>
          <Button variant="outlined" onClick={() => setOpen(true)}>Justificar ou destravar</Button>
        </Paper>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Justificar ou destravar</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
          <TextField multiline minRows={3} label="Justificativa (por que não foi resolvido?)" value={text} onChange={(e) => setText(e.target.value)} helperText="O sistema abre até o fim do dia e o gestor recebe a sua justificativa por e-mail." />
          <Button variant="contained" disabled={busy || text.trim().length < 20} onClick={() => void submit(() => justifyPending(text.trim()))}>Enviar justificativa e liberar hoje</Button>
          <Typography variant="body2" color="text.secondary">Ou digite a chave de desbloqueio fornecida pelo gestor:</Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField size="small" type="password" label="Chave" value={key} onChange={(e) => setKey(e.target.value)} fullWidth />
            <Button disabled={busy || !key} onClick={() => void submit(() => unlockPendingAlerts(key))}>Destravar</Button>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Fechar</Button></DialogActions>
      </Dialog>
    </>
  );
}
