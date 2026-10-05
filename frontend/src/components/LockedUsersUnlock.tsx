import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import UnlockDeadlineDialog from "./UnlockDeadlineDialog";
import { loadPendingAlerts, PENDING_ALERTS_EVENT, type LockedUser } from "../services/PendingAlertsApi";

// Botão de destravar para gestor/administrador. Fica na barra de avisos, no Painel e nas Configurações.
export default function LockedUsersUnlock() {
  const [users, setUsers] = useState<LockedUser[]>([]);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!localStorage.getItem("dentalpos.token")) return;
    try { const d = await loadPendingAlerts(); setUsers(d.enabled && d.canManage ? d.lockedUsers : []); } catch { /* nunca atrapalha */ }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(PENDING_ALERTS_EVENT, load);
    return () => window.removeEventListener(PENDING_ALERTS_EVENT, load);
  }, [load]);

  if (!users.length) return null;
  return () => window.removeEventListener(PENDING_ALERTS_EVENT, load);
  }, [load]);

  if (!users.length) return null;
  const unlock = async (id: string) => {
    setError("");
    try { await unlockUserScreen(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível destravar."); }
  };

  return (
    <Alert severity="warning" sx={{ mb: 2, alignItems: "center" }}>
      <Typography sx={{ fontWeight: 800 }}>{`Tela travada por pendências: ${users.length} usuário(s)`}</Typography>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 0.5 }}>
        {users.map((u) => (
          <Button key={u.id} size="small" variant="contained" color="warning" onClick={() => setTarget({ id: u.id, name: u.name })}>
            {`Destravar ${u.name} (${u.count})`}
          </Button>
        ))}
      </Box>
      <UnlockDeadlineDialog user={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); void load(); }} />
    </Alert>
  );
}
