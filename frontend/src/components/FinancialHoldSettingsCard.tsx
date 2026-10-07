import { useCallback, useEffect, useState } from "react";
import { Box, FormControlLabel, Paper, Switch, TextField, Typography } from "@mui/material";
import { loadPendingAlerts } from "../services/PendingAlertsApi";
import { loadHoldSettings, saveHoldSettings } from "../services/FinancialHoldApi";
import { errorMessage, toast } from "../utils/toast";

// Regra da clínica (só gestor/administrador): paciente com cobrança vencida marca 1 horário; o seguinte só depois de regularizar.
export default function FinancialHoldSettingsCard() {
  const [allowed, setAllowed] = useState(false);
  const [s, setS] = useState<{ enabled: boolean; graceDays: number } | null>(null);
  const load = useCallback(async () => {
    try {
      const a = await loadPendingAlerts();
      if (!a.canManage) return;
      setAllowed(true);
      setS(await loadHoldSettings());
    } catch { /* sem acesso: o cartão não aparece */ }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!allowed || !s) return null;
  const save = async (input: { enabled?: boolean; graceDays?: number }) => {
    try { setS(await saveHoldSettings(input)); toast.success("Regra salva."); } catch (e) { toast.error(errorMessage(e, "Não foi possível salvar.")); }
  };
  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: "1px solid", borderColor: "divider", mb: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>Agenda e pendência financeira</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Paciente com cobrança vencida pode marcar apenas 1 horário. Enquanto não regularizar (boleto, Pix ou cartão), novos agendamentos são recusados. O paciente recebe o aviso junto com o lembrete da consulta.
      </Typography>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <FormControlLabel control={<Switch checked={s.enabled} onChange={(_, v) => void save({ enabled: v })} />} label={s.enabled ? "Bloqueio de novos agendamentos: LIGADO" : "Bloqueio de novos agendamentos: DESLIGADO"} />
        <TextField size="small" type="number" label="Carência (dias após o vencimento)" value={s.graceDays} onChange={(e) => setS({ ...s, graceDays: Number(e.target.value) })} onBlur={() => void save({ graceDays: s.graceDays })} slotProps={{ htmlInput: { min: 0, max: 60 } }} sx={{ width: 260 }} />
      </Box>
    </Paper>
  );
}
