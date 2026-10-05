import LockedUsersUnlock from "./LockedUsersUnlock";
import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Switch, TextField, Typography } from "@mui/material";
import NotificationImportantIcon from "@mui/icons-material/NotificationImportant";
import { loadPendingAlerts, savePendingAlertsSettings, type PendingAlerts } from "../services/PendingAlertsApi";
import { errorMessage, toast } from "../utils/toast";
import { AccessApi, type AccessUser } from "../services/AccessApi";

export default function PendingAlertsSettingsCard() {
  const [data, setData] = useState<PendingAlerts | null>(null);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [locked, setLocked] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Record<string, string[]>>({});
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await loadPendingAlerts();
      setData(d);
      setLocked(d.settings?.lockedUserIds || []);
      setVisibility(d.settings?.visibility || {});
      if (d.canManage) setUsers(await AccessApi.users().catch(() => []));
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

  const hasKey = Boolean(data.settings?.hasKey);
  const eligible = users.filter((u) => u.role !== "ADMIN");
  const toggleUser = (id: string) => setLocked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

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
          <Box sx={{ mt: 1.5, p: 2, border: "2px solid", borderColor: data.mode === "BLOCK" ? "error.main" : "divider", borderRadius: 2 }}>
            <FormControlLabel
              control={<Switch color="error" checked={data.mode === "BLOCK"} disabled={data.mode !== "BLOCK" && !hasKey} onChange={(_, v) => void save({ mode: v ? "BLOCK" : "ALERT" }, v ? "Travamento de tela LIGADO." : "Travamento de tela DESLIGADO. Os avisos e as filas continuam.")} />}
              label={<Typography sx={{ fontWeight: 800 }}>{data.mode === "BLOCK" ? "Travamento de tela: LIGADO" : "Travamento de tela: DESLIGADO"}</Typography>}
            />
            <Typography variant="body2" color="text.secondary">
              A decisão é sua (administrador/gestor). Desligado, as filas, tarefas e avisos continuam aparecendo normalmente, só que sem travar a tela. Ligado, a tela dos usuários marcados abaixo trava quando há pendência vencida.
              {!hasKey && data.mode !== "BLOCK" ? " Para ligar, defina antes a chave de desbloqueio." : ""}
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
