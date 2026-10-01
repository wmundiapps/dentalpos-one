import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, TextField, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { loadPendingAlerts, PENDING_ALERTS_EVENT, PENDING_ALERTS_MESSAGE, unlockPendingAlerts, unlockUserScreen, type PendingAlerts } from "../services/PendingAlertsApi";

export default function PendingAlertsBar() {
  const [data, setData] = useState<PendingAlerts | null>(null);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!localStorage.getItem("dentalpos.token")) return;
    try { setData(await loadPendingAlerts()); } catch { /* o aviso nunca atrapalha o uso do sistema */ }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    window.addEventListener(PENDING_ALERTS_EVENT, load);
    return () => { window.clearInterval(timer); window.removeEventListener(PENDING_ALERTS_EVENT, load); };
  }, [load]);

  if (!data || !data.enabled) return null;
  const hasLocked = data.lockedUsers.length > 0;
  if (data.total === 0 && !hasLocked) return null;

  const unlockSelf = async () => {
    setBusy(true);
    setError("");
    try { await unlockPendingAlerts(key); setKey(""); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível destravar."); }
    finally { setBusy(false); }
  };

  const unlockOther = async (id: string) => {
    setError("");
    try { await unlockUserScreen(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível destravar."); }
  };

  return (
    <>
      {data.total > 0 && (
        <Alert severity="error" variant="filled" sx={{ borderRadius: 0, alignItems: "center" }}>
          <Typography sx={{ fontWeight: 800 }}>{PENDING_ALERTS_MESSAGE}</Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 0.5 }}>
            {data.items.map((item) => (
              <Link key={item.key} component={RouterLink} to={item.path} sx={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}>
                {item.label}
              </Link>
            ))}
          </Box>
        </Alert>
      )}

      {/* Admin e gestor: aviso de quem está com a tela travada por pendências. */}
      {hasLocked && (
        <Alert severity="warning" variant="filled" sx={{ borderRadius: 0, alignItems: "center" }}>
          <Typography sx={{ fontWeight: 800 }}>{`Tela travada por pendências: ${data.lockedUsers.length} usuário(s)`}</Typography>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 0.5, alignItems: "center" }}>
            {data.lockedUsers.map((u) => (
              <Box key={u.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{`${u.name} (${u.count} pendência(s))`}</Typography>
                <Button size="small" variant="outlined" color="inherit" onClick={() => void unlockOther(u.id)}>Destravar</Button>
              </Box>
            ))}
          </Box>
          <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>O usuário também pode se destravar digitando a chave de desbloqueio. A liberação vale até o fim do dia.</Typography>
          {error && <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>{error}</Typography>}
        </Alert>
      )}

      <Dialog open={data.blocked} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900, color: "error.main" }}>Tela travada por pendências</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>{"Existem pendências importantes que não foram resolvidas. Resolva-as ou peça ao gestor a chave de desbloqueio. O admin e o gestor foram avisados."}</Typography>
          {data.items.map((item) => <Typography key={item.key} sx={{ mb: 0.5 }}>{`• ${item.label}`}</Typography>)}
          <TextField
            fullWidth
            type="password"
            label="Chave de desbloqueio"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && key) void unlockSelf(); }}
            sx={{ mt: 2 }}
            autoComplete="off"
          />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" color="error" disabled={busy || !key} onClick={() => void unlockSelf()}>Destravar até o fim do dia</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
