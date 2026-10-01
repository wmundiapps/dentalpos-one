import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { loadPendingAlerts, PENDING_ALERTS_EVENT, PENDING_ALERTS_MESSAGE, unlockPendingAlerts, type PendingAlerts } from "../services/PendingAlertsApi";

export default function PendingAlertsBar() {
  const [data, setData] = useState<PendingAlerts | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!localStorage.getItem("dentalpos.token")) return;
    try { setData(await loadPendingAlerts()); } catch { /* o aviso nunca atrapalha o uso do sistema */ }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 120000);
    window.addEventListener(PENDING_ALERTS_EVENT, load);
    return () => { window.clearInterval(timer); window.removeEventListener(PENDING_ALERTS_EVENT, load); };
  }, [load]);

  if (!data || !data.enabled || data.total === 0) return null;

  const unlock = async () => {
    setError("");
    try { await unlockPendingAlerts(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível destravar."); }
  };

  return (
    <>
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
      <Dialog open={data.blocked} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900, color: "error.main" }}>Sistema travado por pendências</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>{"Existem pendências importantes que não foram resolvidas. Somente o gestor pode destravar o sistema."}</Typography>
          {data.items.map((item) => <Typography key={item.key} sx={{ mb: 0.5 }}>{`• ${item.label}`}</Typography>)}
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          {data.canManage
            ? <Button variant="contained" color="error" onClick={() => void unlock()}>Destravar até o fim do dia</Button>
            : <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>Procure o gestor da clínica.</Typography>}
        </DialogActions>
      </Dialog>
    </>
  );
}
