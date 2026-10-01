import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Radio, RadioGroup, Switch, TextField, Typography } from "@mui/material";
import NotificationImportantIcon from "@mui/icons-material/NotificationImportant";
import { loadPendingAlerts, savePendingAlertsSettings, type PendingAlerts } from "../services/PendingAlertsApi";
import { AccessApi, type AccessUser } from "../services/AccessApi";

export default function PendingAlertsSettingsCard() {
  const [data, setData] = useState<PendingAlerts | null>(null);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [locked, setLocked] = useState<string[]>([]);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await loadPendingAlerts();
      setData(d);
      setLocked(d.settings?.lockedUserIds || []);
      if (d.canManage) setUsers(await AccessApi.users().catch(() => []));
    } catch { setData(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data?.canManage) return null;

  const save = async (input: Parameters<typeof savePendingAlertsSettings>[0], message?: string) => {
    setError(""); setNotice("");
    try { await savePendingAlertsSettings(input); await load(); if (message) setNotice(message); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
  };

  const hasKey = Boolean(data.settings?.hasKey);
  const eligible = users.filter((u) => u.role !== "ADMIN");
  const toggleUser = (id: string) => setLocked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

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
        <>
          <RadioGroup value={data.mode} onChange={(_, v) => void save({ mode: v as "ALERT" | "BLOCK" })} sx={{ mt: 1 }}>
            <FormControlLabel value="ALERT" control={<Radio />} label="Só alerta: mostra o aviso, mas não impede o uso" />
            <FormControlLabel value="BLOCK" control={<Radio />} label="Bloqueio: trava a tela dos usuários escolhidos enquanto houver pendência" />
          </RadioGroup>

          <Box sx={{ mt: 2, p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
            <Typography sx={{ fontWeight: 800 }}>Chave de desbloqueio</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {hasKey ? "Já existe uma chave definida. Digite uma nova para trocá-la." : "Defina uma chave (4 a 64 caracteres). Ela é necessária para ativar o bloqueio."} Quem estiver com a tela travada digita a chave para destravar até o fim do dia; o admin e o gestor também podem destravar pela faixa de aviso.
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <TextField size="small" type="password" label={hasKey ? "Nova chave" : "Chave"} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="new-password" />
              <Button variant="outlined" disabled={key.trim().length < 4} onClick={() => { void save({ unlockKey: key }, "Chave de desbloqueio salva."); setKey(""); }}>{hasKey ? "Trocar chave" : "Definir chave"}</Button>
            </Box>
          </Box>

          <Box sx={{ mt: 2 }}>
            <Typography sx={{ fontWeight: 800 }}>Quem fica sujeito ao bloqueio</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Marque os usuários cuja tela deve travar. Administrador e gestor nunca são travados.</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              {eligible.map((u) => (
                <FormControlLabel key={u.id} control={<Checkbox size="small" checked={locked.includes(u.id)} onChange={() => toggleUser(u.id)} />} label={`${u.firstName} ${u.lastName}`.trim() || u.email} />
              ))}
              {eligible.length === 0 && <Typography variant="body2" color="text.secondary">Nenhum usuário disponível.</Typography>}
            </Box>
            <Button sx={{ mt: 1 }} variant="contained" onClick={() => void save({ lockedUserIds: locked }, "Usuários do bloqueio salvos.")}>Salvar usuários do bloqueio</Button>
          </Box>
        </>
      )}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}
    </Paper>
  );
}
