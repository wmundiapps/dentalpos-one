import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Paper, Switch, TextField, Typography } from "@mui/material";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import { getFinderOptions, getMyListing, getReceived, saveMyListing, type ListingState, type ReceivedRow } from "../services/FinderApi";

const empty = { active: false, displayName: "", specialty: "", city: "", state: "", about: "", services: [] as string[], email: "", whatsapp: "", sms: "", telegramChatId: "", consent: false };

// Indicador profissional: a clínica escolhe se aparece, em qual cidade e por onde recebe os pacientes.
export default function FinderListingCard() {
  const [state, setState] = useState<ListingState | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [received, setReceived] = useState<ReceivedRow[]>([]);
  const [f, setF] = useState(empty);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getMyListing().then((s) => {
      setState(s);
      const l = s.listing;
      if (l) setF({ active: l.active, displayName: l.displayName, specialty: l.specialty || "", city: l.city, state: l.state, about: l.about || "", services: l.services, email: l.channels.email || "", whatsapp: l.channels.whatsapp || "", sms: l.channels.sms || "", telegramChatId: l.channels.telegramChatId || "", consent: true });
    }).catch(() => setState(null));
    getFinderOptions().then((o) => setServices(o.services)).catch(() => undefined);
    getReceived().then(setReceived).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!state) return null;
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await saveMyListing({ active: f.active, displayName: f.displayName, specialty: f.specialty, city: f.city, state: f.state, about: f.about, services: f.services, channels: { email: f.email, whatsapp: f.whatsapp, sms: f.sms, telegramChatId: f.telegramChatId }, consent: f.consent });
      setMsg({ type: "success", text: f.active ? "Pronto: você aparece no indicador profissional." : "Salvo. Você não aparece no indicador." });
      load();
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "Não foi possível salvar." }); }
    finally { setBusy(false); }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <TravelExploreIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Indicador profissional</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Pacientes procuram dentistas por cidade e serviço. Seu contato nunca aparece: você recebe os dados do paciente por mensagem automática do sistema.</Typography>
      {msg && <Alert severity={msg.type} sx={{ mb: 2 }}>{msg.text}</Alert>}
      <FormControlLabel control={<Switch checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />} label="Aparecer no indicador profissional" />
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, mt: 1 }}>
        <TextField label="Nome que aparece para o paciente" value={f.displayName} onChange={set("displayName")} />
        <TextField label="Especialidade" value={f.specialty} onChange={set("specialty")} />
        <TextField label="Cidade" value={f.city} onChange={set("city")} />
        <TextField label="UF" value={f.state} onChange={set("state")} slotProps={{ htmlInput: { maxLength: 2 } }} />
        <TextField select label="Serviços" value={f.services} onChange={(e) => setF({ ...f, services: e.target.value as unknown as string[] })} slotProps={{ select: { multiple: true } }} sx={{ gridColumn: { md: "1 / -1" } }}>
          {services.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <TextField label="Apresentação curta (opcional)" value={f.about} onChange={set("about")} multiline minRows={2} sx={{ gridColumn: { md: "1 / -1" } }} />
        <Typography sx={{ fontWeight: 800, gridColumn: { md: "1 / -1" } }}>Onde receber os pacientes</Typography>
        <TextField label="E-mail (obrigatório)" value={f.email} onChange={set("email")} />
        <TextField label="WhatsApp (opcional)" value={f.whatsapp} onChange={set("whatsapp")} helperText={state.available.WHATSAPP ? "" : "Canal ainda não ativo na plataforma: o e-mail recebe."} />
        <TextField label="SMS (opcional)" value={f.sms} onChange={set("sms")} helperText={state.available.SMS ? "" : "Canal ainda não ativo na plataforma: o e-mail recebe."} />
        <TextField label="Telegram (ID do chat, opcional)" value={f.telegramChatId} onChange={set("telegramChatId")} helperText={state.available.TELEGRAM ? "" : "Canal ainda não ativo na plataforma: o e-mail recebe."} />
      </Box>
      {f.active && <FormControlLabel sx={{ mt: 1, alignItems: "flex-start" }} control={<Checkbox checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />} label={<Typography variant="body2">{state.consentText}</Typography>} />}
      <Button variant="contained" sx={{ mt: 2 }} disabled={busy} onClick={save}>Salvar</Button>
      {received.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography sx={{ fontWeight: 800, mb: 1 }}>Pacientes que pediram atendimento ({state.contacts})</Typography>
          <Box sx={{ display: "grid", gap: 1 }}>
            {received.map((r) => (
              <Box key={r.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                <span><b>{r.name}</b> · {r.whatsapp} · {r.city} · {r.service}</span>
                <Chip size="small" color={r.status === "ENVIADO" ? "success" : "warning"} label={new Date(r.createdAt).toLocaleDateString("pt-BR")} />
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  );
}
