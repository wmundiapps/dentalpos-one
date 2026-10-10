import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Divider, MenuItem, Paper, Switch, TextField, Typography } from "@mui/material";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import PixIcon from "@mui/icons-material/Pix";
import SyncIcon from "@mui/icons-material/Sync";
import PageHeader from "../components/PageHeader";
import { providerLabel } from "../utils/providerLabels";
import { DEMO_DATA_ON } from "../utils/demoMode";
import { readDemoAccess } from "../services/DemoAccess";
import { loadFinancialEntries, loadPaymentProviders, savePaymentProvider } from "../services/FinancialApi";
import { listFinanceEntries, listProviderConfigs, saveProviderConfigs, type PaymentMethod, type PaymentProviderConfig } from "../services/FinanceHubService";

const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const describe = (id: string) => id === "asaas" ? "PIX, cartão e boleto no Brasil" : id === "stripe" ? "Cartões e pagamentos internacionais" : "PIX, transferências e conciliação bancária";
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

interface Row { type: "Receita" | "Despesa"; status: string; value: number }

export default function PaymentCenter() {
  // Modo demonstração (ou dados de exemplo ligados): mantém tudo local; caso contrário usa o backend.
  const useLocal = DEMO_DATA_ON || Boolean(readDemoAccess()?.isDemo);
  const [providers, setProviders] = useState<PaymentProviderConfig[]>(() => listProviderConfigs());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [amount, setAmount] = useState(""); const [method, setMethod] = useState<PaymentMethod>("PIX"); const [provider, setProvider] = useState("asaas"); const [last, setLast] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const local = () => listFinanceEntries().map((x): Row => ({ type: x.type, status: x.status, value: x.value }));
    if (useLocal) { setRows(local()); setProviders(listProviderConfigs()); setLoading(false); return; }
    try {
      const [entries, remote] = await Promise.all([loadFinancialEntries(), loadPaymentProviders()]);
      setRows(entries.map((x): Row => ({ type: x.type === "INCOME" ? "Receita" : "Despesa", status: x.status === "PAID" ? "Pago" : x.status === "CANCELLED" ? "Cancelado" : "Pendente", value: Number(x.amount) || 0 })));
      setProviders(listProviderConfigs().map(p => {
        const r = remote.find(x => x.provider.toLowerCase() === p.id);
        return r ? { ...p, active: r.isActive, environment: r.environment === "PRODUCTION" ? "Produção" : "Teste", credentialsConfigured: r.credentialsConfigured, webhookConfigured: r.webhookConfigured } : { ...p, active: false, credentialsConfigured: false, webhookConfigured: false };
      }));
    } catch (e) {
      setRows([]); setError(errMsg(e, "Não foi possível carregar os recebimentos."));
    } finally { setLoading(false); }
  }, [useLocal]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!useLocal) return;
    const h = () => void load();
    window.addEventListener("dentalpos:finance-changed", h);
    return () => window.removeEventListener("dentalpos:finance-changed", h);
  }, [useLocal, load]);

  const totals = useMemo(() => ({
    open: rows.filter(x => x.type === "Receita" && x.status !== "Pago" && x.status !== "Cancelado").reduce((a, x) => a + x.value, 0),
    paid: rows.filter(x => x.type === "Receita" && x.status === "Pago").reduce((a, x) => a + x.value, 0),
  }), [rows]);

  const update = async (p: PaymentProviderConfig, patch: Partial<PaymentProviderConfig>) => {
    const next = { ...p, ...patch };
    if (useLocal) {
      const all = providers.map(x => x.id === p.id ? next : x);
      setProviders(all); saveProviderConfigs(all); return;
    }
    setBusyId(p.id); setError("");
    try {
      await savePaymentProvider(p.id, { environment: next.environment === "Produção" ? "PRODUCTION" : "TEST", isActive: next.active, credentialsConfigured: next.credentialsConfigured, webhookConfigured: next.webhookConfigured });
      setProviders(prev => prev.map(x => x.id === p.id ? next : x));
    } catch (e) {
      setError(errMsg(e, "Não foi possível salvar a configuração."));
    } finally { setBusyId(""); }
  };

  const simulate = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setLast(""); setError("Informe um valor maior que zero para simular."); return; }
    setError("");
    const selected = providers.find(p => p.id === provider);
    setLast(`Cobrança de teste preparada: ${money(value)} via ${method} • ${providerLabel(selected?.id || provider)}. Nenhum valor real foi movimentado.`);
  };

  return <Box>
    <PageHeader title="Pagamentos e Recebimentos" description="PIX, cartão, boleto e bancos em um só lugar." />
    <Alert severity="warning" sx={{ mb: 3 }}>Os meios de pagamento são ativados pela equipe DentalPos One. Enquanto não estiverem ativos, as cobranças desta tela são apenas simuladas.</Alert>
    {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>{error}</Alert>}
    {loading ? <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress aria-label="Carregando" /></Box> : <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}>
        <Paper sx={{ p: 2.5, borderRadius: 3 }}><Typography color="text.secondary">Recebimentos em aberto</Typography><Typography variant="h5" sx={{ fontWeight: 900 }}>{money(totals.open)}</Typography></Paper>
        <Paper sx={{ p: 2.5, borderRadius: 3 }}><Typography color="text.secondary">Recebido / baixado</Typography><Typography variant="h5" sx={{ fontWeight: 900 }}>{money(totals.paid)}</Typography></Paper>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3,1fr)" }, gap: 2 }}>
        {providers.map(p => <Paper key={p.id} variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
            <Box><Typography variant="h6" sx={{ fontWeight: 900 }}>{providerLabel(p.id)}</Typography><Typography variant="body2" color="text.secondary">{describe(p.id)}</Typography></Box>
            <Switch checked={p.active} disabled={busyId === p.id} onChange={(_, v) => void update(p, { active: v })} slotProps={{ input: { "aria-label": `Ativar ${providerLabel(p.id)}` } }} />
          </Box>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", my: 2 }}>{p.supports.map(x => <Chip size="small" key={x} label={x} />)}</Box>
          <TextField select fullWidth size="small" label="Ambiente" value={p.environment} disabled={busyId === p.id} onChange={e => void update(p, { environment: e.target.value as PaymentProviderConfig["environment"] })}><MenuItem value="Teste">Teste</MenuItem><MenuItem value="Produção">Produção</MenuItem></TextField>
          <Box sx={{ mt: 2, display: "grid", gap: .5 }}>
            <Typography variant="caption" color={p.credentialsConfigured ? "success.main" : "text.secondary"}>Credenciais: {p.credentialsConfigured ? "configuradas" : "pendentes"}</Typography>
            <Typography variant="caption" color={p.webhookConfigured ? "success.main" : "text.secondary"}>Webhook: {p.webhookConfigured ? "configurado" : "pendente"}</Typography>
            {p.active && !p.credentialsConfigured && <Typography variant="caption" color="warning.main">Ativo, mas sem credenciais: cobranças reais seguem desabilitadas.</Typography>}
          </Box>
        </Paper>)}
      </Box>
    </>}
    <Paper variant="outlined" sx={{ mt: 3, p: 3, borderRadius: 4 }}>
      <Typography variant="h6" sx={{ fontWeight: 900 }}>Simulador de cobrança</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Valida o fluxo de seleção antes de conectarmos as cobranças reais.</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr auto" }, gap: 2, alignItems: "center" }}>
        <TextField label="Valor" type="number" value={amount} onChange={e => setAmount(e.target.value)} slotProps={{ htmlInput: { min: 0, step: "0.01" } }} />
        <TextField select label="Forma" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>{["PIX", "Cartão", "Boleto", "Transferência"].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
        <TextField select label="Meio de recebimento" value={provider} onChange={e => setProvider(e.target.value)}>{providers.map(p => <MenuItem key={p.id} value={p.id}>{providerLabel(p.id)}</MenuItem>)}</TextField>
        <Button variant="contained" startIcon={method === "PIX" ? <PixIcon /> : <CreditCardIcon />} onClick={simulate}>Simular</Button>
      </Box>
      {last && <><Divider sx={{ my: 2 }} /><Alert icon={<SyncIcon />} severity="success">{last}</Alert></>}
    </Paper>
  </Box>;
}
