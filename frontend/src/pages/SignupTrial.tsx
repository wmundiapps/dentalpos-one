import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { appRootUrl } from "../services/DemoAccess";
import { brDate, brl, getOffer, signupTrial, type Offer, type SignupResult } from "../services/SubscriptionApi";

function useCountdown(untilIso?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!untilIso) return null;
  const left = new Date(untilIso).getTime() - now;
  if (!(left > 0)) return null;
  const s = Math.floor(left / 1000);
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

// Cadastro com teste grátis de 30 dias, sem cartão: o cartão é cadastrado depois, dentro do sistema (a gente avisa durante o teste).
export default function SignupTrial() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SignupResult | null>(null);
  const [plan, setPlan] = useState("BASIC");
  const [form, setForm] = useState({ clinicName: "", firstName: "", lastName: "", phone: "", email: "", password: "", cro: "", specialty: "", cpfCnpj: "", postalCode: "", addressNumber: "", birthDate: "", street: "", city: "", state: "", acceptTerms: false });

  useEffect(() => {
    getOffer().then(setOffer).catch((e) => setError(e instanceof Error ? e.message : "Não foi possível abrir o cadastro.")).finally(() => setLoading(false));
    try { const p = new URLSearchParams(window.location.search).get("plano"); if (p) setPlan(p.toUpperCase()); } catch { /* sem parâmetro */ }
  }, []);

  const countdown = useCountdown(offer?.promoActive ? offer.promoUntil : undefined);
  const chosen = useMemo(() => offer?.plans.find((p) => p.key === plan) || offer?.plans[0], [offer, plan]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const terms = offer && chosen
    ? `Entendi que o teste é grátis por ${offer.trialDays} dias, sem cartão. Para continuar depois do teste, preciso cadastrar o cartão no sistema (plano ${chosen.name}: ${brl(chosen.promoPrice)} por mês${offer.promoActive ? `, com ${offer.promoPercent}% de desconto nos primeiros ${offer.promoCycles} meses, depois ${brl(chosen.price)}` : ""}). Sem o cartão, ao fim do teste a conta fica somente para leitura e meus dados continuam guardados. Não há fidelidade e nada é cobrado sem eu cadastrar o cartão.`
    : "";

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const r = await signupTrial({ ...form, plan, specialty: form.specialty || "Clínica geral" });
      setResult(r);
      localStorage.setItem("dentalpos.clinicId", r.clinicId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir o cadastro.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><CircularProgress /></Box>;

  if (result) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}>
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 4, width: "min(620px,100%)" }}>
          <Alert severity="success" sx={{ mb: 2 }}>Seu teste grátis de 30 dias começou.</Alert>
          <Typography variant="h5" sx={{ fontWeight: 900 }}>Tudo pronto, {form.firstName}!</Typography>
          <Typography sx={{ mt: 1 }}>Você não precisa de cartão agora. Seu teste grátis vai até <b>{brDate(result.trialEndsAt)}</b>. Durante o teste vamos avisar, dentro do sistema e por e-mail, para você cadastrar o cartão em Configurações &gt; Minha assinatura e continuar sem interrupção ({brl(result.firstChargeAmount)} por mês no plano escolhido). Sem fidelidade.</Typography>
          <Button fullWidth variant="contained" sx={{ mt: 3 }} onClick={() => { window.location.href = appRootUrl(); }}>Entrar no DentalPos</Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2, bgcolor: "background.default" }}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, width: "min(760px,100%)" }}>
        <Typography variant="h4" sx={{ fontWeight: 950 }}>Teste o DentalPos por {offer?.trialDays ?? 30} dias grátis</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          {offer?.promoActive ? `Depois, ${offer.promoPercent}% de desconto nos ${offer.promoCycles} meses seguintes. ` : ""}Sem cartão para começar. Sem fidelidade, cancele quando quiser.
        </Typography>
        {countdown && offer && (
          <Box role="timer" aria-label="Tempo restante da promoção" sx={{ mb: 3, p: 2, borderRadius: 3, bgcolor: "primary.main", color: "primary.contrastText", textAlign: "center" }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{offer.promoPercent}% de desconto por {offer.promoCycles} meses. A promoção termina em {brDate(offer.promoUntil)}:</Typography>
            <Box sx={{ display: "flex", justifyContent: "center", gap: 2, mt: 1 }}>
              {([["dias", countdown.days], ["horas", countdown.hours], ["min", countdown.minutes], ["seg", countdown.seconds]] as const).map(([label, value]) => (
                <Box key={label} sx={{ minWidth: 56 }}>
                  <Typography variant="h4" sx={{ fontWeight: 950, lineHeight: 1 }}>{String(value).padStart(2, "0")}</Typography>
                  <Typography variant="caption">{label}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          <TextField select label="Plano" value={plan} onChange={(e) => setPlan(e.target.value)} sx={{ gridColumn: { md: "1 / -1" } }}>
            {(offer?.plans || []).map((p) => <MenuItem key={p.key} value={p.key}>{p.name} · {offer?.promoActive ? `${brl(p.promoPrice)} (de ${brl(p.price)})` : brl(p.price)} por mês</MenuItem>)}
          </TextField>
          <TextField label="Nome da clínica" value={form.clinicName} onChange={set("clinicName")} sx={{ gridColumn: { md: "1 / -1" } }} />
          <TextField label="Nome" value={form.firstName} onChange={set("firstName")} autoComplete="given-name" />
          <TextField label="Sobrenome" value={form.lastName} onChange={set("lastName")} autoComplete="family-name" />
          <TextField label="WhatsApp" value={form.phone} onChange={set("phone")} autoComplete="tel" />
          <TextField label="E-mail" type="email" value={form.email} onChange={set("email")} autoComplete="email" />
          <TextField label="CRO" value={form.cro} onChange={set("cro")} />
          <TextField label="Data de nascimento" type="date" value={form.birthDate} onChange={set("birthDate")} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="Senha (mínimo 10 caracteres)" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" />
          <TextField label="CPF ou CNPJ do titular" value={form.cpfCnpj} onChange={set("cpfCnpj")} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
          <TextField label="CEP" value={form.postalCode} onChange={set("postalCode")} autoComplete="postal-code" slotProps={{ htmlInput: { inputMode: "numeric" } }} />
          <TextField label="Número" value={form.addressNumber} onChange={set("addressNumber")} />
          <TextField label="Rua / logradouro" value={form.street} onChange={set("street")} autoComplete="street-address" sx={{ gridColumn: { md: "1 / -1" } }} />
          <TextField label="Cidade" value={form.city} onChange={set("city")} />
          <TextField label="Estado (UF)" value={form.state} onChange={set("state")} slotProps={{ htmlInput: { maxLength: 2 } }} />
        </Box>
        <FormControlLabel sx={{ mt: 2, alignItems: "flex-start" }} control={<Checkbox checked={form.acceptTerms} onChange={(e) => setForm((f) => ({ ...f, acceptTerms: e.target.checked }))} />} label={<Typography variant="body2">{terms}</Typography>} />
        <Button fullWidth size="large" variant="contained" sx={{ mt: 2 }} disabled={busy || !form.acceptTerms} onClick={submit}>
          {busy ? "Criando sua conta..." : `Começar meus ${offer?.trialDays ?? 30} dias grátis`}
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>Veja nossa <a href="/privacidade" target="_blank" rel="noreferrer">política de privacidade</a>.</Typography>
      </Paper>
    </Box>
  );
}
