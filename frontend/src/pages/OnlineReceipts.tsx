import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, FormControlLabel, MenuItem, Paper, Switch, TextField, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import ExportMenu from "../components/ExportMenu";
import { CopyField } from "../components/ChargeDialog";
import { ReceiptsApi, type AsaasStatus, type PayoutAccount, type PayoutRow, type PayoutTotal } from "../services/ReceiptsApi";

const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const brDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");
const STATUS_LABEL: Record<string, string> = { PENDENTE: "Aguardando pagamento", CONFIRMADO: "Confirmado", ESTORNADO: "Estornado", CANCELADO: "Cancelado" };

export default function OnlineReceipts() {
  const [status, setStatus] = useState<AsaasStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [environment, setEnvironment] = useState<"SANDBOX" | "PRODUCTION">("SANDBOX");
  const [active, setActive] = useState(true);
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [wallets, setWallets] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [totals, setTotals] = useState<PayoutTotal[]>([]);
  const [doctorFilter, setDoctorFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAccounts = useCallback(async () => {
    try {
      const list = await ReceiptsApi.accounts();
      setAccounts(list);
      setWallets(Object.fromEntries(list.map((a) => [a.doctorId, a.walletId])));
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar os dentistas."); }
  }, []);

  const loadStatement = useCallback(async () => {
    try {
      const r = await ReceiptsApi.payouts({ doctorId: doctorFilter, from, to });
      setRows(r.rows); setTotals(r.totals);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar o extrato."); }
  }, [doctorFilter, from, to]);

  useEffect(() => {
    ReceiptsApi.asaasStatus().then((s) => { setStatus(s); setEnvironment(s.environment); setActive(s.active || !s.connected); }).catch((e) => setError(e instanceof Error ? e.message : "Sem permissão para ver a conta de recebimento."));
    void loadAccounts();
  }, [loadAccounts]);
  useEffect(() => { void loadStatement(); }, [loadStatement]);

  const connect = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const s = await ReceiptsApi.connect({ ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), environment, isActive: active });
      setStatus(s); setApiKey("");
      setNotice(s.webhookConfigured ? "Conta Asaas conectada. O aviso automático de pagamentos (webhook) foi cadastrado." : "Conta Asaas conectada. Cadastre o webhook manualmente no Asaas com os dados abaixo.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível conectar."); }
    finally { setBusy(false); }
  };

  const saveWallet = async (doctorId: string) => {
    setError(""); setNotice("");
    try { await ReceiptsApi.saveAccount(doctorId, (wallets[doctorId] || "").trim()); await loadAccounts(); setNotice("Carteira do dentista salva."); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
  };

  const table = () => ({
    title: "Extrato de repasses aos dentistas",
    fileBase: "repasses",
    headers: ["Dentista", "Cliente", "Descrição", "Vencimento", "Valor da cobrança", "Regra", "Repasse (R$)", "Situação"],
    rows: rows.map((r) => [r.doctorName, r.customer, r.description, brDate(r.dueDate), money(r.chargeValue), r.mode === "PERCENT" ? `${r.percent ?? ""}% do líquido` : "valor fixo", r.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 }), STATUS_LABEL[r.status] || r.status]),
  });

  return (
    <Box>
      <PageHeader title="Recebimentos online" description="Conecte a conta Asaas da clínica, cadastre a carteira dos dentistas para a divisão automática do pagamento e acompanhe os repasses." />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>1. Conta Asaas da clínica</Typography>
          {status && <Chip size="small" color={status.connected && status.active ? "success" : "default"} label={status.connected ? (status.active ? "Conectada" : "Conectada (desativada)") : "Não conectada"} />}
          {status?.connected && <Chip size="small" variant="outlined" label={status.environment === "PRODUCTION" ? "Produção (dinheiro real)" : "Teste (sandbox)"} />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Cada clínica recebe na própria conta Asaas: o dinheiro cai direto nela. Crie a conta em https://www.asaas.com (ou, para testar sem dinheiro real, em https://sandbox.asaas.com), gere a chave de API em Integrações e cole abaixo.
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 2 }}>
          <TextField type="password" label={status?.connected ? "Nova chave de API (deixe vazio para manter a atual)" : "Chave de API do Asaas"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
          <TextField select label="Ambiente" value={environment} onChange={(e) => setEnvironment(e.target.value as typeof environment)}>
            <MenuItem value="SANDBOX">Teste (sandbox) — sem dinheiro real</MenuItem>
            <MenuItem value="PRODUCTION">Produção — dinheiro real</MenuItem>
          </TextField>
        </Box>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", mt: 1.5, flexWrap: "wrap" }}>
          <FormControlLabel control={<Switch checked={active} onChange={(_, v) => setActive(v)} />} label="Cobranças online ativas" />
          <Button variant="contained" disabled={busy || (!status?.connected && apiKey.trim().length < 20)} onClick={() => void connect()}>{busy ? "Conectando..." : status?.connected ? "Salvar" : "Conectar"}</Button>
        </Box>
        {status?.connected && (
          <Box sx={{ mt: 2.5, display: "grid", gap: 1.5 }}>
            <Alert severity={status.webhookConfigured ? "success" : "warning"}>
              {status.webhookConfigured
                ? "O aviso de pagamentos (webhook) está cadastrado no Asaas: quando o paciente pagar, o lançamento é baixado sozinho."
                : "Não foi possível cadastrar o webhook automaticamente. No Asaas, vá em Integrações → Webhooks → Novo webhook, informe a URL e o token abaixo e marque os eventos de cobrança."}
            </Alert>
            {!status.webhookConfigured && status.webhookToken && (
              <>
                <CopyField label="URL do webhook" value={status.webhookUrl} />
                <CopyField label="Token de autenticação do webhook" value={status.webhookToken} />
              </>
            )}
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>2. Carteira dos dentistas (divisão automática)</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Para o Asaas dividir o pagamento, cada dentista precisa ter conta no Asaas. Cole aqui o Wallet ID dele (o dentista encontra no painel do Asaas, em Integrações). A regra de repasse vem do cadastro do dentista no Corpo Clínico.
        </Typography>
        {accounts.length === 0 && <Typography color="text.secondary">Nenhum dentista cadastrado.</Typography>}
        {accounts.map((a) => (
          <Box key={a.doctorId} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.2fr 1.3fr 1.6fr auto" }, gap: 1.5, alignItems: "center", py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
            <Box>
              <Typography sx={{ fontWeight: 800 }}>{a.name}</Typography>
              <Chip size="small" color={a.ready ? "success" : "default"} label={a.ready ? "Pronto para dividir" : "Sem carteira"} sx={{ mt: 0.5 }} />
            </Box>
            <Typography variant="body2" color={a.rule.ok ? "text.primary" : "text.secondary"}>{a.rule.ok ? a.rule.label : a.rule.reason}</Typography>
            <TextField size="small" label="Wallet ID do Asaas" value={wallets[a.doctorId] || ""} onChange={(e) => setWallets({ ...wallets, [a.doctorId]: e.target.value })} />
            <Button variant="outlined" onClick={() => void saveWallet(a.doctorId)}>Salvar carteira</Button>
          </Box>
        ))}
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>3. Extrato de repasses</Typography>
          <ExportMenu build={table} disabled={rows.length === 0} />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.5fr 1fr 1fr" }, gap: 2, mb: 2 }}>
          <TextField select size="small" label="Dentista" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>
            {accounts.map((a) => <MenuItem key={a.doctorId} value={a.doctorId}>{a.name}</MenuItem>)}
          </TextField>
          <TextField size="small" type="date" label="Vencimento de" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="até" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        {totals.length > 0 && (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 1.5, mb: 2 }}>
            {totals.map((t) => (
              <Paper key={t.doctorId} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Typography sx={{ fontWeight: 800 }}>{t.doctorName}</Typography>
                <Typography variant="body2">{`Confirmado: ${money(t.confirmed)}`}</Typography>
                <Typography variant="body2" color="text.secondary">{`A receber: ${money(t.pending)}`}</Typography>
                {t.refunded > 0 && <Typography variant="body2" color="error">{`Estornado: ${money(t.refunded)}`}</Typography>}
              </Paper>
            ))}
          </Box>
        )}
        {rows.length === 0 && <Typography color="text.secondary">Nenhum repasse ainda. Eles aparecem quando uma cobrança com divisão automática é gerada em Financeiro → Contas a receber.</Typography>}
        {rows.map((r) => (
          <Box key={r.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.2fr 1.6fr 1fr 1fr auto" }, gap: 1, py: 1, borderTop: "1px solid", borderColor: "divider", alignItems: "center" }}>
            <Typography sx={{ fontWeight: 700 }}>{r.doctorName}</Typography>
            <Typography variant="body2" color="text.secondary">{`${r.customer} • ${r.description}`}</Typography>
            <Typography variant="body2">{`Vence ${brDate(r.dueDate)}`}</Typography>
            <Typography sx={{ fontWeight: 800 }}>{money(r.amount)}</Typography>
            <Chip size="small" color={r.status === "CONFIRMADO" ? "success" : r.status === "ESTORNADO" ? "error" : "warning"} label={STATUS_LABEL[r.status] || r.status} />
          </Box>
        ))}
      </Paper>
    </Box>
  );
}
