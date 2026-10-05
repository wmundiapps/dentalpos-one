import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import { loadPendingAlerts, PENDING_ALERTS_EVENT, unlockUserScreen, type LockedUser } from "../services/PendingAlertsApi";

// Botão de destravar para gestor/administrador. Fica na barra de avisos, no Painel e nas Configurações.
export default function LockedUsersUnlock() {
  const [users, setUsers] = useState<LockedUser[]>([]);
  const [error, setError] = useState("");

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
          <Button key={u.id} size="small" variant="contained" color="warning" onClick={() => void unlock(u.id)}>
            {`Destravar ${u.name} (${u.count})`}
          </Button>
        ))}
      </Box>
      {error && <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>{error}</Typography>}
    </Alert>
  );
}
