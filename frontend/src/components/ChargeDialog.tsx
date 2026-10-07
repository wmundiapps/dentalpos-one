import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, MenuItem, Radio, RadioGroup, TextField, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useNavigate } from "react-router-dom";
import { ReceiptsApi, type PayoutAccount, type ReceivableCharge } from "../services/ReceiptsApi";

const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export interface ChargeEntry { id: string; description: string; personName: string; amount: number; dueDate: string; phone?: string | null }

export function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <TextField
      size="small" fullWidth label={label} value={value} slotProps={{ input: { readOnly: true, endAdornment: (
        <InputAdornment position="end">
          <Tooltip title={done ? "Copiado!" : "Copiar"}>
            <IconButton size="small" onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}><ContentCopyIcon fontSize="small" /></IconButton>
          </Tooltip>
        </InputAdornment>
      ) } }}
    />
  );
}

export default function ChargeDialog({ entry, existing, onClose, onChanged, initialBillingType }: { entry: ChargeEntry | null; existing?: ReceivableCharge | null; onClose: () => void; onChanged: () => void; initialBillingType?: "ESCOLHER" | "PIX" | "BOLETO" | "CARTAO" }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [billingType, setBillingType] = useState<"ESCOLHER" | "PIX" | "BOLETO" | "CARTAO">("ESCOLHER");
  const [installments, setInstallments] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [mode, setMode] = useState<"RULE" | "PERCENT" | "FIXED">("RULE");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [charge, setCharge] = useState<ReceivableCharge | null>(null);
  const [needData, setNeedData] = useState(false);
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [emailState, setEmailState] = useState<{ sent: boolean; to: string | null; reason?: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setError(""); setNeedData(false); setCpfCnpj(""); setCustEmail(""); setCustPhone(entry.phone || ""); setEmailState(null); setCharge(existing || null); setBillingType(initialBillingType || "ESCOLHER"); setInstallments("1"); setDoctorId(""); setMode("RULE"); setValue("");
    setDueDate(new Date(entry.dueDate).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }));
    ReceiptsApi.readiness().then((r) => setReady(r.ready)).catch(() => setReady(false));
    ReceiptsApi.accounts().then(setAccounts).catch(() => setAccounts([]));
    // Só reinicia ao trocar de lançamento (a lista do Financeiro recarrega e recria os objetos enquanto o diálogo está aberto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const doctor = accounts.find((a) => a.doctorId === doctorId);
  const preview = useMemo(() => {
    if (!entry || !doctor) return null;
    let repasse = 0;
    let texto = "";
    if (mode === "RULE" && doctor.rule.ok) { repasse = (entry.amount * doctor.rule.percent) / 100; texto = doctor.rule.label; }
    else if (mode === "PERCENT") { const p = Number(value.replace(",", ".")); repasse = (entry.amount * p) / 100; texto = `${p || 0}% do valor líquido`; }
    else if (mode === "FIXED") { repasse = Number(value.replace(",", ".")) || 0; texto = "valor fixo"; }
    return { repasse, texto };
  }, [entry, doctor, mode, value]);

  if (!entry) return null;

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const num = Number(value.replace(",", "."));
      const customer = {
        ...(cpfCnpj.replace(/\D/g, "") ? { cpfCnpj: cpfCnpj.replace(/\D/g, "") } : {}),
        ...(custEmail.trim() ? { email: custEmail.trim() } : {}),
        ...(custPhone.trim() ? { phone: custPhone.trim() } : {}),
      };
      const result = await ReceiptsApi.createCharge(entry.id, {
        billingType, installments: billingType === "CARTAO" ? Number(installments) : 1, dueDate,
        ...(Object.keys(customer).length ? { customer } : {}),
        ...(doctorId ? { split: { doctorId, mode, ...(mode !== "RULE" ? { value: num } : {}) } } : {}),
      });
      setCharge(result);
      setNeedData(false);
      if (result.email) setEmailState(result.email);
      onChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível gerar a cobrança.";
      setError(msg);
      // Falta dado do cliente: abre os campos para preencher/corrigir e tentar de novo, até a cobrança ser gerada.
      if (/cpf|cnpj|e-?mail|telefone|documento/i.test(msg)) setNeedData(true);
    } finally { setBusy(false); }
  };

  const sendEmail = async () => {
    if (!charge) return;
    setEmailBusy(true);
    try { setEmailState(await ReceiptsApi.sendChargeEmail(charge.id, custEmail.trim() || undefined)); }
    catch (e) { setEmailState({ sent: false, to: null, reason: e instanceof Error ? e.message : "Não foi possível enviar o e-mail." }); }
    finally { setEmailBusy(false); }
  };

  const cancel = async () => {
    if (!charge || !window.confirm("Cancelar esta cobrança no Asaas? O paciente não poderá mais pagá-la por este link.")) return;
    setBusy(true); setError("");
    try { await ReceiptsApi.cancelCharge(charge.id); setCharge(null); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível cancelar."); }
    finally { setBusy(false); }
  };

  const whats = charge?.invoiceUrl && entry.phone
    ? `https://wa.me/55${String(entry.phone).replace(/\D/g, "").replace(/^55/, "")}?text=${encodeURIComponent(`Olá, ${entry.personName}! Segue o link para pagamento (${money(entry.amount)}): ${charge.invoiceUrl}`)}`
    : null;

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>Cobrar online</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
          <Typography sx={{ fontWeight: 800 }}>{entry.description}</Typography>
          <Typography variant="body2" color="text.secondary">{`${entry.personName} • ${money(entry.amount)}`}</Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}

        {charge ? (
          <>
            <Alert severity={charge.status === "PAGO" ? "success" : charge.status === "VENCIDO" ? "warning" : "info"}>
              {charge.reused ? "Já existe uma cobrança para este lançamento. " : ""}Situação: <b>{{ PENDENTE: "aguardando pagamento", PAGO: "paga", VENCIDO: "vencida", ESTORNADO: "estornada", CANCELADO: "cancelada" }[charge.status]}</b>. O lançamento é baixado automaticamente quando o Asaas confirmar o pagamento.
            </Alert>
            {emailState?.sent && <Alert severity="success">Cobrança enviada por e-mail para {emailState.to}.</Alert>}
            {emailState && !emailState.sent && (
              <Box sx={{ display: "grid", gap: 1, p: 1.5, border: "2px solid", borderColor: "warning.main", borderRadius: 2 }}>
                <Typography sx={{ fontWeight: 800 }}>A cobrança ainda não foi enviada por e-mail</Typography>
                <Typography variant="body2" color="text.secondary">{emailState.reason || "Não foi possível enviar."}</Typography>
                <TextField size="small" label="E-mail do paciente" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} placeholder={emailState.to || "nome@exemplo.com"} />
                <Box><Button variant="contained" disabled={emailBusy} onClick={() => void sendEmail()}>{emailBusy ? "Enviando..." : "Salvar e enviar por e-mail agora"}</Button></Box>
              </Box>
            )}
            {charge.invoiceUrl && <CopyField label="Link de pagamento (o paciente escolhe PIX, boleto ou cartão)" value={charge.invoiceUrl} />}
            {charge.pixCopyPaste && <CopyField label="PIX copia e cola" value={charge.pixCopyPaste} />}
            {charge.digitableLine && <CopyField label="Linha digitável do boleto" value={charge.digitableLine} />}
            {charge.splits.length > 0 && (
              <Alert severity="info">
                {charge.splits.map((s) => `Repasse automático ao dentista: ${money(s.finalAmount ?? s.plannedAmount)}${s.finalAmount === null ? " (previsto)" : ""} — ${s.status === "CONFIRMADO" ? "confirmado" : s.status === "ESTORNADO" ? "estornado" : "aguardando o pagamento"}`).join("; ")}
              </Alert>
            )}
          </>
        ) : ready === false ? (
          <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => { onClose(); navigate("/recebimentos-online"); }}>Conectar</Button>}>
            A conta Asaas da clínica ainda não está conectada.
          </Alert>
        ) : (
          <>
            {needData && (
              <Box sx={{ display: "grid", gap: 1.5, p: 1.5, border: "2px solid", borderColor: "warning.main", borderRadius: 2 }}>
                <Typography sx={{ fontWeight: 800 }}>Complete os dados do paciente para gerar a cobrança</Typography>
                <TextField label="CPF ou CNPJ do paciente" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} placeholder="Somente números" slotProps={{ htmlInput: { inputMode: "numeric" } }} autoFocus />
                <TextField label="E-mail do paciente (a cobrança é enviada por e-mail)" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} />
                <TextField label="Telefone / WhatsApp" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
                <Typography variant="caption" color="text.secondary">Os dados ficam salvos no cadastro do paciente. Preencha e clique em “Salvar e gerar cobrança”.</Typography>
              </Box>
            )}
            <TextField select label="Forma de cobrança" value={billingType} onChange={(e) => setBillingType(e.target.value as typeof billingType)}>
              <MenuItem value="ESCOLHER">O paciente escolhe (PIX, boleto ou cartão)</MenuItem>
              <MenuItem value="PIX">PIX</MenuItem>
              <MenuItem value="BOLETO">Boleto</MenuItem>
              <MenuItem value="CARTAO">Cartão de crédito</MenuItem>
            </TextField>
            {billingType === "CARTAO" && (
              <TextField select label="Parcelas" value={installments} onChange={(e) => setInstallments(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((n) => <MenuItem key={n} value={n}>{`${n}x`}</MenuItem>)}
              </TextField>
            )}
            <TextField type="date" label="Vencimento" value={dueDate} onChange={(e) => setDueDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} helperText="Se a data já passou, o vencimento é ajustado para hoje." />

            <TextField select label="Repassar parte a um dentista (divisão automática)" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <MenuItem value="">Sem repasse (tudo fica com a clínica)</MenuItem>
              {accounts.map((a) => <MenuItem key={a.doctorId} value={a.doctorId}>{`${a.name}${a.ready ? "" : " — sem carteira Asaas"}`}</MenuItem>)}
            </TextField>
            {doctor && !doctor.ready && (
              <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => { onClose(); navigate("/recebimentos-online"); }}>Cadastrar</Button>}>
                Cadastre a carteira (Wallet ID) do Asaas deste dentista para dividir o pagamento.
              </Alert>
            )}
            {doctor?.ready && (
              <>
                <RadioGroup value={mode} onChange={(_, v) => setMode(v as typeof mode)}>
                  <FormControlLabel value="RULE" disabled={!doctor.rule.ok} control={<Radio />} label={doctor.rule.ok ? `Regra do cadastro: ${doctor.rule.label}` : `Regra do cadastro indisponível: ${doctor.rule.reason}`} />
                  <FormControlLabel value="PERCENT" control={<Radio />} label="Percentual do valor líquido (após taxas do Asaas)" />
                  <FormControlLabel value="FIXED" control={<Radio />} label="Valor fixo em reais" />
                </RadioGroup>
                {mode !== "RULE" && (
                  <TextField label={mode === "PERCENT" ? "Percentual (%)" : "Valor do repasse (R$)"} value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
                )}
                {preview && preview.repasse > 0 && (
                  <Alert severity="info">{`O dentista recebe cerca de ${money(preview.repasse)} (${preview.texto}) e a clínica fica com o restante, descontadas as taxas do Asaas. O repasse é feito pelo Asaas, direto na carteira do dentista.`}</Alert>
                )}
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {charge && charge.status !== "PAGO" && charge.status !== "CANCELADO" && <Button color="error" disabled={busy} onClick={() => void cancel()}>Cancelar cobrança</Button>}
        {whats && <Button component="a" href={whats} target="_blank" rel="noreferrer">Enviar por WhatsApp</Button>}
        {charge?.invoiceUrl && <Button component="a" href={charge.invoiceUrl} target="_blank" rel="noreferrer">Abrir fatura</Button>}
        <Button onClick={onClose} disabled={busy}>{charge ? "Fechar" : "Cancelar"}</Button>
        {!charge && ready !== false && (
          <Button variant="contained" disabled={busy || ready === null || (Boolean(doctorId) && (!doctor?.ready || (mode !== "RULE" && !(Number(value.replace(",", ".")) > 0))))} onClick={() => void submit()}>
            {busy ? "Gerando..." : needData ? "Salvar e gerar cobrança" : "Gerar cobrança"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
