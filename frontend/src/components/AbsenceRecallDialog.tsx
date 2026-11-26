import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Switch, TextField, Typography } from "@mui/material";
import { loadAbsenceOverview, periodLabel, runAbsenceRecall, saveAbsenceSettings, type AbsenceOverview } from "../services/AbsenceRecallApi";
import { errorMessage, toast } from "../utils/toast";

// Botão da Agenda: escolhe há quanto tempo o paciente não comparece e envia o contato de acompanhamento com o link da agenda online.
export default function AbsenceRecallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<AbsenceOverview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try { setData(await loadAbsenceOverview()); } catch (e) { setError(errorMessage(e, "Não foi possível carregar.")); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const change = async (input: Parameters<typeof saveAbsenceSettings>[0]) => {
    setError("");
    try { await saveAbsenceSettings(input); await load(); } catch (e) { const m = errorMessage(e); setError(m); toast.error(m); }
  };

  const send = async () => {
    if (!data) return;
    if (!window.confirm(`Enviar agora o contato de acompanhamento para os pacientes ausentes há ${periodLabel(data.settings.periodDays)} ou mais? Quem já recebeu dentro deste período não recebe de novo.`)) return;
    setBusy(true); setError("");
    try {
      const r = await runAbsenceRecall(false);
      const extra = r.failures.length ? ` Avisos: ${r.failures.join("; ")}` : "";
      if (r.sent > 0) toast.success(`Contato enviado para ${r.sent} paciente(s).${extra}`);
      else toast.info(`Nenhum envio novo.${extra || " Todos os pacientes deste período já foram contatados ou não têm e-mail/WhatsApp."}`);
      await load();
    } catch (e) { const m = errorMessage(e, "Não foi possível enviar."); setError(m); toast.error(m); }
    finally { setBusy(false); }
  };

  const s = data?.settings;
  const hasChannel = (c: "EMAIL" | "WHATSAPP") => Boolean(s?.channels.includes(c));
  const toggleChannel = (c: "EMAIL" | "WHATSAPP") => {
    if (!s) return;
    const next = hasChannel(c) ? s.channels.filter((x) => x !== c) : [...s.channels, c];
    if (!next.length) return;
    void change({ channels: next });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 900 }}>Pacientes ausentes: convite para retorno</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Escolha há quanto tempo o paciente não comparece. Ele recebe uma mensagem de acompanhamento com o link da agenda online para marcar o retorno. Pacientes que já têm consulta marcada não recebem.
        </Typography>
        {!s ? <Typography>Carregando...</Typography> : (
          <Box sx={{ display: "grid", gap: 2 }}>
            <TextField select label="Não comparece há" value={s.periodDays} onChange={(e) => void change({ periodDays: Number(e.target.value) })}>
              {data!.periods.map((d) => <MenuItem key={d} value={d}>{periodLabel(d)} ou mais</MenuItem>)}
            </TextField>
            <Alert severity={data!.candidatesCount ? "info" : "success"}>
              {data!.candidatesCount ? `${data!.candidatesCount} paciente(s) neste período.` : "Nenhum paciente ausente neste período."}
              {data!.sample.length > 0 && ` Ex.: ${data!.sample.slice(0, 5).map((p) => `${p.name} (${p.daysAway} dias)`).join(", ")}.`}
            </Alert>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>Enviar por</Typography>
              <FormControlLabel control={<Checkbox checked={hasChannel("EMAIL")} onChange={() => toggleChannel("EMAIL")} />} label="E-mail" />
              <FormControlLabel control={<Checkbox checked={hasChannel("WHATSAPP")} onChange={() => toggleChannel("WHATSAPP")} />} label="WhatsApp (precisa do canal WhatsApp ativo em Canais de envio)" />
            </Box>
            <TextField type="number" label="Limite de contatos por dia" value={s.dailyLimit} onChange={(e) => setData({ ...data!, settings: { ...s, dailyLimit: Number(e.target.value) } })} onBlur={() => void change({ dailyLimit: s.dailyLimit })} slotProps={{ htmlInput: { min: 1, max: 200 } }} helperText="Evita disparos em massa de uma só vez." />
            <FormControlLabel control={<Switch checked={s.enabled} onChange={(_, v) => void change({ enabled: v })} />} label="Enviar automaticamente todos os dias úteis (a partir das 9h)" />
            <Typography variant="caption" color="text.secondary">Hoje: {data!.today.emails} e-mail(s) e {data!.today.whatsapps} WhatsApp(s) enviados.</Typography>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fechar</Button>
        <Button variant="contained" disabled={busy || !s || !data?.candidatesCount} onClick={() => void send()}>{busy ? "Enviando..." : "Enviar agora"}</Button>
      </DialogActions>
    </Dialog>
  );
}
