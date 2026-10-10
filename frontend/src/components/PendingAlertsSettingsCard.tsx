import LockedUsersUnlock from "./LockedUsersUnlock";
import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Switch, Typography } from "@mui/material";
import NotificationImportantIcon from "@mui/icons-material/NotificationImportant";
import { loadPendingAlerts, savePendingAlertsSettings, type PendingAlerts } from "../services/PendingAlertsApi";
import { errorMessage, toast } from "../utils/toast";

export default function PendingAlertsSettingsCard() {
  const [data, setData] = useState<PendingAlerts | null>(null);
  const [visibility, setVisibility] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await loadPendingAlerts();
      setData(d);
      setVisibility(d.settings?.visibility || {});
    } catch { setData(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data?.canManage) return null;

  const save = async (input: Parameters<typeof savePendingAlertsSettings>[0], message?: string) => {
    setError(""); setNotice("");
    try {
      await savePendingAlertsSettings(input);
      await load();
      if (message) setNotice(message);
      toast.success(message || "Configuração salva.");
    } catch (e) {
      const text = errorMessage(e, "Não foi possível salvar.");
      setError(text);
      toast.error(text);
    }
  };


  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: "1px solid", borderColor: "divider", mb: 3 }}>
      <LockedUsersUnlock />
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <NotificationImportantIcon color="error" />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Avisos de pendências</Typography>
          <Typography variant="body2" color="text.secondary">Mostra no topo da tela, em vermelho, agendamentos sem desfecho, recebimentos vencidos e trabalhos de laboratório atrasados.</Typography>
        </Box>
      </Box>
      <FormControlLabel control={<Switch checked={data.enabled} onChange={(_, v) => void save({ enabled: v })} />} label="Avisar sobre pendências" />
      {data.enabled && (
        <>
          <Box sx={{ mt: 1.5, p: 2, border: "1px solid", borderColor: "warning.main", borderRadius: 2 }}>
            <Typography sx={{ fontWeight: 800 }}>Alerta "Você está em risco"</Typography>
            <Typography variant="body2" color="text.secondary">
              A tela não trava mais. Quem tem pendência vê um triângulo amarelo com a mensagem "VOCÊ ESTÁ EM RISCO". Ao clicar, aparece o prazo de 24 horas, a escala de advertências e a base legal. A aplicação de qualquer penalidade é decisão do gestor.
            </Typography>
          </Box>

          <Box sx={{ mt: 2, p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
            <Typography sx={{ fontWeight: 800 }}>Quem vê cada pendência</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              O administrador vê tudo. Cada departamento vê só as pendências marcadas para ele (ex.: o laboratório não precisa ver paciente devendo).
            </Typography>
            {(data.settings?.categories || []).map((cat) => (
              <Box key={cat.key} sx={{ mb: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{cat.label}</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2 }}>
                  {(data.settings?.profiles || []).map((p) => (
                    <FormControlLabel
                      key={p.code}
                      control={<Checkbox size="small" checked={(visibility[cat.key] || []).includes(p.code)} onChange={() => setVisibility((cur) => {
                        const list = cur[cat.key] || [];
                        return { ...cur, [cat.key]: list.includes(p.code) ? list.filter((x) => x !== p.code) : [...list, p.code] };
                      })} />}
                      label={p.name || p.code}
                    />
                  ))}
                </Box>
              </Box>
            ))}
            <Button variant="contained" onClick={() => void save({ visibility }, "Quem vê cada pendência foi salvo.")}>Salvar quem vê cada pendência</Button>
          </Box>
        </>
      )}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}
    </Paper>
  );
}
