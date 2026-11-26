import { useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { contactProfessional, getFinderOptions, openCity, startFinder, type FinderLeadResult, type FinderOptions, type FinderProfessional } from "../services/FinderApi";

// Indicador profissional (público): o paciente se identifica, escolhe a cidade e só ali vê os nomes.
// O contato do profissional nunca aparece; o pedido vai por mensagem automática do sistema.
export default function ProfessionalFinder() {
  const [options, setOptions] = useState<FinderOptions | null>(null);
  const [lead, setLead] = useState<FinderLeadResult | null>(null);
  const [city, setCity] = useState<{ city: string; state: string } | null>(null);
  const [pros, setPros] = useState<FinderProfessional[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const [form, setForm] = useState({ name: "", whatsapp: "", city: "", state: "", service: "", consent: false });

  useEffect(() => { getFinderOptions().then(setOptions).catch((e) => setError(e instanceof Error ? e.message : "Não foi possível abrir a busca.")); }, []);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(""); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Algo deu errado."); } finally { setBusy(false); } };

  const start = () => run(async () => { setLead(await startFinder(form)); setCity(null); setPros([]); });
  const open = (c: { citySlug: string; city: string; state: string }) => run(async () => { if (!lead) return; const r = await openCity(lead.token, c.citySlug); setCity({ city: c.city, state: c.state }); setPros(r.professionals); });
  const choose = (p: FinderProfessional) => run(async () => { if (!lead) return; await contactProfessional(lead.token, p.listingId); setSent((s) => [...s, p.listingId]); });

  if (!options && !error) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><CircularProgress /></Box>;

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2, bgcolor: "background.default" }}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, width: "min(720px,100%)" }}>
        <Typography variant="h4" sx={{ fontWeight: 950 }}>Encontre um dentista de confiança</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Informe seus dados, escolha a cidade e veja os profissionais de lá. O contato é feito pelo DentalPos.</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!lead && options && (
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
            <TextField label="Seu nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            <TextField label="Seu WhatsApp (com DDD)" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} autoComplete="tel" slotProps={{ htmlInput: { inputMode: "tel" } }} />
            <TextField label="Sua cidade" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <TextField label="UF" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} slotProps={{ htmlInput: { maxLength: 2 } }} />
            <TextField select label="O que você procura?" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} sx={{ gridColumn: { md: "1 / -1" } }}>
              {options.services.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <FormControlLabel sx={{ gridColumn: { md: "1 / -1" }, alignItems: "flex-start" }} control={<Checkbox checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />} label={<Typography variant="body2">{options.consentText}</Typography>} />
            <Button variant="contained" size="large" disabled={busy || !form.consent} onClick={start} sx={{ gridColumn: { md: "1 / -1" } }}>{busy ? "Buscando..." : "Ver cidades com profissionais"}</Button>
          </Box>
        )}

        {lead && !city && (
          <Box>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>Cidades com profissionais de “{lead.service}”</Typography>
            {lead.cities.length === 0 && <Alert severity="info">Ainda não há profissionais para esse serviço. Volte em breve.</Alert>}
            <Box sx={{ display: "grid", gap: 1 }}>
              {lead.cities.map((c) => (
                <Button key={c.citySlug} variant="outlined" disabled={busy} onClick={() => open(c)} sx={{ justifyContent: "space-between", textTransform: "none" }}>
                  <span>{c.city}/{c.state}</span><Chip size="small" label={`${c.count} ${c.count === 1 ? "profissional" : "profissionais"}`} />
                </Button>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>Os nomes só aparecem na cidade que você abrir (até 3 cidades por busca).</Typography>
          </Box>
        )}

        {lead && city && (
          <Box>
            <Button size="small" onClick={() => setCity(null)} sx={{ mb: 1 }}>← Voltar às cidades</Button>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>Profissionais em {city.city}/{city.state}</Typography>
            <Box sx={{ display: "grid", gap: 1.5 }}>
              {pros.map((p) => {
                const done = p.contacted || sent.includes(p.listingId);
                return (
                  <Paper key={p.listingId} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                    <Typography sx={{ fontWeight: 800 }}>{p.displayName}</Typography>
                    {p.specialty && <Typography variant="body2" color="text.secondary">{p.specialty}</Typography>}
                    {p.about && <Typography variant="body2" sx={{ mt: 0.5 }}>{p.about}</Typography>}
                    <Button sx={{ mt: 1.5 }} variant="contained" disabled={busy || done} onClick={() => choose(p)}>{done ? "Pedido enviado" : "Quero ser atendido"}</Button>
                    {done && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>O profissional recebeu seu pedido e vai falar com você pelo WhatsApp informado.</Typography>}
                  </Paper>
                );
              })}
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
