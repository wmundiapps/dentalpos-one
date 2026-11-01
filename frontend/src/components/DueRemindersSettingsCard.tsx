import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, MenuItem, Paper, Switch, FormControlLabel, TextField, Typography } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { archiveDueReminder, createDueReminder, doneDueReminder, loadDueSettings, saveDueSettings, type CustomReminder, type DueSettings } from "../services/DueRemindersApi";

const REC: Record<string, string> = { NONE: "Não repete", WEEKLY: "Toda semana", MONTHLY: "Todo mês", QUARTERLY: "A cada 3 meses", SEMIANNUAL: "A cada 6 meses", YEARLY: "Todo ano" };
const PRESETS = [
  { kind: "ALVARA", title: "Alvará de funcionamento", recurrence: "YEARLY" },
  { kind: "ALVARA", title: "Alvará sanitário (Vigilância Sanitária)", recurrence: "YEARLY" },
  { kind: "AUTOCLAVE", title: "Teste biológico da autoclave", recurrence: "WEEKLY" },
  { kind: "RECIBOS_RECEITA", title: "Lançar recibos no Receita Saúde", recurrence: "MONTHLY" },
  { kind: "IMPOSTO", title: "Imposto (DAS, DARF, ISS...)", recurrence: "MONTHLY" },
];

// Vencimentos que a clínica cadastra (alvará, autoclave, impostos, recibos) e e-mails que recebem os avisos.
export default function DueRemindersSettingsCard() {
  const [settings, setSettings] = useState<DueSettings | null>(null);
  const [kinds, setKinds] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<CustomReminder[]>([]);
  const [form, setForm] = useState({ kind: "ALVARA", title: "", dueDate: "", recurrence: "YEARLY" });
  const [emails, setEmails] = useState("");
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    loadDueSettings().then((d) => { setSettings(d.settings); setKinds(d.kinds); setCustom(d.custom); setEmails(d.settings.emails.join(", ")); }).catch(() => setSettings(null));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!settings) return null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ type: "success", text: ok }); load(); } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "Não foi possível concluir." }); } finally { setBusy(false); }
  };
  const saveCfg = () => run(() => saveDueSettings({ ...settings, emails: emails.split(/[,;\s]+/).filter(Boolean) }), "Configuração salva.");

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <NotificationsActiveIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Lembretes de vencimento</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Contas a pagar, impostos, recibos pendentes da Receita Saúde, validade de produtos e documentos já entram sozinhos. Aqui você cadastra o que o sistema não sabe: alvará, teste da autoclave e outros. Cada vencimento avisa por e-mail às 9h, 10 dias, 7 dias, 1 dia antes e no dia (itens semanais: 1 dia antes e no dia).</Typography>
      {msg && <Alert severity={msg.type} sx={{ mb: 2 }}>{msg.text}</Alert>}

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        {PRESETS.map((p) => <Chip key={p.title} label={p.title} onClick={() => setForm({ ...form, kind: p.kind, title: p.title, recurrence: p.recurrence })} />)}
      </Box>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr 1fr" }, mb: 1 }}>
        <TextField select size="small" label="Tipo" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(kinds).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
        <TextField size="small" label="Nome" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <TextField size="small" type="date" label="Próximo vencimento" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField select size="small" label="Repete" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>{Object.entries(REC).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
      </Box>
      <Button variant="contained" disabled={busy} onClick={() => run(async () => { await createDueReminder(form); setForm({ ...form, title: "", dueDate: "" }); }, "Lembrete cadastrado.")}>Adicionar lembrete</Button>

      <Box sx={{ display: "grid", gap: 1, mt: 2 }}>
        {custom.map((c) => (
          <Box key={c.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", p: 1.2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
            <Typography variant="body2"><b>{kinds[c.kind] || c.kind}:</b> {c.title} · {c.dueDate.split("-").reverse().join("/")} · {REC[c.recurrence]}</Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button size="small" disabled={busy} onClick={() => run(async () => { const r = await doneDueReminder(c.id); return r; }, "Marcado como feito.")}>Feito</Button>
              <Button size="small" color="inherit" disabled={busy} onClick={() => run(() => archiveDueReminder(c.id), "Lembrete arquivado.")}>Arquivar</Button>
            </Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ mt: 3, display: "grid", gap: 1.5, maxWidth: 560 }}>
        <Typography sx={{ fontWeight: 800 }}>E-mails e prazo da Receita Saúde</Typography>
        <FormControlLabel control={<Switch checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />} label="Enviar lembretes por e-mail" />
        <TextField size="small" label="Outros e-mails que recebem os avisos (separe por vírgula)" value={emails} onChange={(e) => setEmails(e.target.value)} helperText="Já recebem: e-mail da clínica, administradores e contador (em impostos e recibos)." />
        <TextField size="small" type="number" label="Dia do mês seguinte para lançar os recibos na Receita Saúde" value={settings.receitaSaudeDay} onChange={(e) => setSettings({ ...settings, receitaSaudeDay: Number(e.target.value) })} slotProps={{ htmlInput: { min: 1, max: 28 } }} helperText="Confirme o prazo certo com o seu contador. O padrão (dia 5) é de propósito antecipado." />
        <Box><Button variant="outlined" disabled={busy} onClick={saveCfg}>Salvar configuração</Button></Box>
      </Box>
    </Paper>
  );
}
