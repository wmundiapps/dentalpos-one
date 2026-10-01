import { useCallback, useEffect, useState } from "react";
import { Alert, Box, FormControlLabel, Paper, Radio, RadioGroup, Switch, Typography } from "@mui/material";
import NotificationImportantIcon from "@mui/icons-material/NotificationImportant";
import { loadPendingAlerts, savePendingAlertsSettings, type PendingAlerts } from "../services/PendingAlertsApi";

export default function PendingAlertsSettingsCard() {
  const [data, setData] = useState<PendingAlerts | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setData(await loadPendingAlerts()); } catch { setData(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data?.canManage) return null;

  const save = async (input: { enabled?: boolean; mode?: "ALERT" | "BLOCK" }) => {
    setError("");
    try { await savePendingAlertsSettings(input); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
  };

  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: "1px solid", borderColor: "divider", mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <NotificationImportantIcon color="error" />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Avisos de pendências</Typography>
          <Typography variant="body2" color="text.secondary">Mostra no topo da tela, em vermelho, agendamentos sem desfecho, recebimentos vencidos e trabalhos de laboratório atrasados.</Typography>
        </Box>
      </Box>
      <FormControlLabel control={<Switch checked={data.enabled} onChange={(_, v) => void save({ enabled: v })} />} label="Avisar sobre pendências" />
      {data.enabled && (
        <RadioGroup value={data.mode} onChange={(_, v) => void save({ mode: v as "ALERT" | "BLOCK" })} sx={{ mt: 1 }}>
          <FormControlLabel value="ALERT" control={<Radio />} label="Só alerta: mostra o aviso, mas não impede o uso" />
          <FormControlLabel value="BLOCK" control={<Radio />} label="Bloqueio real: trava o sistema enquanto houver pendência; só o gestor destrava (até o fim do dia)" />
        </RadioGroup>
      )}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Paper>
  );
}
