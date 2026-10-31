import { useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, TextField, Typography } from "@mui/material";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const CONSENT = "Autorizo o DentalPos a falar comigo pelo WhatsApp (inclusive com atendimento automático por inteligência artificial) sobre o teste do sistema. Posso responder SAIR a qualquer momento para não receber mais mensagens.";

// Captura o lead antes de abrir o WhatsApp (destino dos anúncios da Meta).
export default function TalkToUs() {
  const [form, setForm] = useState({ name: "", whatsapp: "", clinicName: "", city: "", consent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const q = new URLSearchParams(window.location.search);
      const utm = { source: q.get("utm_source") || "", medium: q.get("utm_medium") || "", campaign: q.get("utm_campaign") || "", content: q.get("utm_content") || "" };
      const r = await fetch(`${API}/marketing/lead`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, utm }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Não foi possível continuar.");
      setUrl(d.whatsappUrl);
      window.setTimeout(() => { window.location.href = d.whatsappUrl; }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2, bgcolor: "background.default" }}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, width: "min(520px,100%)" }}>
        <Typography variant="h4" sx={{ fontWeight: 950 }}>Fale com o DentalPos no WhatsApp</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Teste grátis por 30 dias. Cobrança só depois do teste, sem fidelidade. Deixe seus dados e abrimos a conversa.</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {url ? (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>Pronto! Abrindo o WhatsApp...</Alert>
            <Button fullWidth variant="contained" startIcon={<WhatsAppIcon />} href={url}>Abrir WhatsApp</Button>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gap: 2 }}>
            <TextField label="Seu nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            <TextField label="Seu WhatsApp (com DDD)" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} autoComplete="tel" slotProps={{ htmlInput: { inputMode: "tel" } }} />
            <TextField label="Nome da clínica (opcional)" value={form.clinicName} onChange={(e) => setForm({ ...form, clinicName: e.target.value })} />
            <TextField label="Cidade (opcional)" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <FormControlLabel sx={{ alignItems: "flex-start" }} control={<Checkbox checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />} label={<Typography variant="body2">{CONSENT}</Typography>} />
            <Button size="large" variant="contained" startIcon={<WhatsAppIcon />} disabled={busy || !form.consent} onClick={submit}>{busy ? "Aguarde..." : "Conversar no WhatsApp"}</Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
