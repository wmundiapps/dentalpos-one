import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, FormControlLabel, Paper, Switch, TextField, Typography } from "@mui/material";
import { loadFollowUpSettings, saveFollowUpSettings, sendFollowUpNow, type FollowUpSettings } from "../services/FollowUpApi";

// Resumos e avisos automáticos por e-mail (pacientes sem agendar e pacientes devendo). Só o gestor/administrador mexe.
export default function FollowUpSettingsCard() {
  const [data, setData] = useState<FollowUpSettings | null>(null);
  const [emails, setEmails] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const s = await loadFollowUpSettings(); setData(s); setEmails(s.emails.join(", ")); } catch { setData(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!data) return null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); setNotice(ok); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  };
  const toggle = (k: "weeklyList" | "dailyDebtors" | "debtorNotice" | "skipImported") => (_: unknown, v: boolean) => void run(() => saveFollowUpSettings({ [k]: v }), "Salvo.");

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, mb: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>Resumos e avisos automáticos por e-mail</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Recebem os resumos: <b>{data.effectiveEmails.join(", ") || "ninguém (cadastre um e-mail abaixo)"}</b>.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}
      <Box sx={{ display: "grid", gap: 0.5, mb: 2 }}>
        <FormControlLabel control={<Switch checked={data.weeklyList} onChange={toggle("weeklyList")} disabled={busy} />} label="Toda segunda-feira: lista de pacientes que ficaram sem agendar" />
        <FormControlLabel control={<Switch checked={data.dailyDebtors} onChange={toggle("dailyDebtors")} disabled={busy} />} label={`Todo dia: lista de pacientes devendo (hoje: ${data.debtorCount})`} />
        <FormControlLabel control={<Switch checked={data.debtorNotice} onChange={toggle("debtorNotice")} disabled={busy} />} label="Todo dia: e-mail ao paciente devedor pedindo que entre em contato com a clínica (sem citar valor)" />
        <FormControlLabel control={<Switch checked={data.skipImported} onChange={toggle("skipImported")} disabled={busy} />} label="Não cobrar parcelas importadas de outro sistema (Clinicorp) enquanto a baixa não for feita — o boleto delas foi emitido lá e o pagamento não chega aqui sozinho" />
      </Box>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" label="E-mails dos resumos (separe por vírgula)" value={emails} onChange={(e) => setEmails(e.target.value)} sx={{ minWidth: 340, flex: 1 }} helperText="Deixe vazio para usar os administradores da clínica." />
        <Button variant="outlined" disabled={busy} onClick={() => void run(() => saveFollowUpSettings({ emails: emails.split(/[\s,;]+/).filter(Boolean) }), "E-mails salvos.")}>Salvar e-mails</Button>
        <Button variant="contained" disabled={busy} onClick={() => void run(async () => { const r = await sendFollowUpNow(); if (!r.weekly.sent && !r.daily.sent) throw new Error(r.weekly.reason || "Nenhum e-mail saiu. Confira o e-mail de destino e a chave de envio do sistema."); }, "Resumos enviados agora para o responsável (nenhum paciente foi avisado).")}>Enviar os resumos agora (teste)</Button>
      </Box>
    </Paper>
  );
}
