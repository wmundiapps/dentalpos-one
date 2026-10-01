import { useEffect, useState } from "react";
import { Alert, Box, FormControlLabel, MenuItem, Switch, TextField, Typography } from "@mui/material";
import { LAB_CHANNEL_LABELS, type LabChannel, type LabNotifyChoice } from "../services/LabNotifyApi";
import { loadTeamMembers, type TeamMember } from "../services/TeamApi";

export default function LabNotifyFields({ value, onChange }: { value: LabNotifyChoice; onChange: (next: LabNotifyChoice) => void }) {
  const [labs, setLabs] = useState<TeamMember[]>([]);
  useEffect(() => {
    loadTeamMembers().then((rows) => setLabs(rows.filter((m) => m.role === "LAB_PROTESE"))).catch(() => setLabs([]));
  }, []);

  const lab = labs.find((l) => l.id === value.labMemberId);
  const toggle = (channel: LabChannel, on: boolean) =>
    onChange({ ...value, channels: on ? [...new Set([...value.channels, channel])] : value.channels.filter((c) => c !== channel) });

  return (
    <Box sx={{ gridColumn: { md: "1/-1" }, border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
      <Typography sx={{ fontWeight: 800 }}>Avisar o laboratório de prótese</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Envia os dados do trabalho ao salvar e depois um aviso por dia, às 8h, até a entrega. O nível de risco muda conforme a data se aproxima (no prazo, atenção, risco alto, entrega hoje, atrasado). Cadastre o laboratório em Equipe → Laboratório de prótese.
      </Typography>
      {labs.length === 0 ? (
        <Alert severity="info">Nenhum laboratório de prótese cadastrado na Equipe.</Alert>
      ) : (
        <>
          <TextField select fullWidth label="Laboratório" value={value.labMemberId} onChange={(e) => onChange({ ...value, labMemberId: e.target.value })}>
            <MenuItem value="">Não avisar</MenuItem>
            {labs.map((l) => <MenuItem key={l.id} value={l.id}>{l.companyName ? `${l.companyName} — ${l.fullName}` : l.fullName}</MenuItem>)}
          </TextField>
          {value.labMemberId && (
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 1 }}>
              {(Object.keys(LAB_CHANNEL_LABELS) as LabChannel[]).map((channel) => (
                <FormControlLabel key={channel} control={<Switch checked={value.channels.includes(channel)} onChange={(_, on) => toggle(channel, on)} />} label={LAB_CHANNEL_LABELS[channel]} />
              ))}
            </Box>
          )}
          {lab && value.channels.some((c) => c !== "TELEGRAM") && !lab.phone && <Alert severity="warning" sx={{ mt: 1 }}>Este laboratório não tem telefone cadastrado.</Alert>}
          {lab && value.channels.includes("TELEGRAM") && !lab.telegramChatId && <Alert severity="warning" sx={{ mt: 1 }}>Este laboratório não tem o chat ID do Telegram cadastrado.</Alert>}
        </>
      )}
    </Box>
  );
}
