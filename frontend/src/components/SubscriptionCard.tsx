import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, TextField, Typography } from "@mui/material";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import { brDate, brl, cancelMySubscription, getMySubscription, reactivateMySubscription, type SubscriptionView } from "../services/SubscriptionApi";

// Minha assinatura: mostra o teste, a próxima cobrança e deixa cancelar a qualquer momento (sem fidelidade).
export default function SubscriptionCard() {
  const [sub, setSub] = useState<SubscriptionView | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reactivate, setReactivate] = useState(false);
  const [newCard, setNewCard] = useState(false);
  const [extra, setExtra] = useState({ postalCode: "", addressNumber: "" });
  const [card, setCard] = useState({ holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "" });

  const load = useCallback(() => { getMySubscription().then(setSub).catch(() => setSub({ exists: false })); }, []);
  useEffect(() => { load(); }, [load]);

  if (!sub?.exists) return null;

  const trial = sub.status === "TESTE";
  const cancel = async () => {
    setBusy(true); setError("");
    try { setSub(await cancelMySubscription()); setConfirm(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível cancelar."); }
    finally { setBusy(false); }
  };

  const doReactivate = async () => {
    setBusy(true); setError("");
    try {
      const useNew = newCard || !sub.hasSavedCard;
      setSub(await reactivateMySubscription(useNew ? { useNewCard: true, ...extra, card } : { useNewCard: false }));
      setCard({ holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "" });
      setReactivate(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível reativar."); }
    finally { setBusy(false); }
  };
  const field = (k: keyof typeof card, label: string, ac: string) => <TextField size="small" label={label} value={card[k]} autoComplete={ac} onChange={(e) => setCard((c) => ({ ...c, [k]: e.target.value }))} />;

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <CreditCardIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Minha assinatura</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Plano {sub.planName}. Sem fidelidade: você pode cancelar a qualquer momento.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {sub.canceled ? (
        <>
          <Alert severity="info">Assinatura cancelada. Nenhuma nova cobrança será feita. Acesso completo até {brDate(sub.accessUntil)}; depois a conta fica somente leitura e seus dados continuam preservados.</Alert>
          <Button variant="contained" sx={{ mt: 2 }} onClick={() => { setError(""); setReactivate(true); }}>Reativar assinatura</Button>
        </>
      ) : (
        <>
          {sub.pastDue && (
            <Alert severity="error" sx={{ mb: 2 }} action={sub.overdue?.invoiceUrl ? <Button color="inherit" size="small" href={sub.overdue.invoiceUrl} target="_blank" rel="noreferrer">Pagar agora</Button> : undefined}>
              Mensalidade em atraso{sub.overdue ? ` (${brl(sub.overdue.total)})` : ""}. Não conseguimos cobrar no cartão final {sub.cardLast4}. Regularize para manter a assinatura em dia.
            </Alert>
          )}
          {trial && <Alert severity="success" sx={{ mb: 2 }}>Teste grátis: faltam {sub.trialDaysLeft} dia(s). Nada é cobrado até {brDate(sub.trialEndsAt)}. Se cancelar antes, não paga nada.</Alert>}
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            {trial ? "Primeira cobrança" : "Próxima cobrança"}: <b>{brl(sub.nextChargeAmount || 0)}</b>
            {trial ? ` em ${brDate(sub.trialEndsAt)}` : ""} no cartão {sub.cardBrand || ""} final {sub.cardLast4 || "----"}.
          </Typography>
          {!!sub.promoCyclesLeft && <Typography variant="body2" color="text.secondary">Desconto de 50% por mais {sub.promoCyclesLeft} mensalidade(s); depois {brl(sub.fullPrice || 0)} por mês.</Typography>}
          <Button color="error" variant="outlined" sx={{ mt: 2 }} onClick={() => setConfirm(true)}>Cancelar assinatura</Button>
        </>
      )}
      <Dialog open={reactivate} onClose={() => setReactivate(false)} fullWidth maxWidth="sm">
        <DialogTitle>Reativar assinatura</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>A reativação cobra agora a mensalidade ({brl(sub.nextChargeAmount || 0)}) e depois todo mês, sem novo teste e sem fidelidade. {!!sub.debtAtCancel && sub.debtAtCancel > 0 ? `Antes, cobramos o valor em atraso de ${brl(sub.debtAtCancel)}. ` : "Se houver valor em atraso, ele é cobrado primeiro, para a conta ficar em dia. "}</Typography>
          {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
          {sub.hasSavedCard && <Typography variant="body2" sx={{ mb: 1 }}>Cartão salvo: {sub.cardBrand || ""} final {sub.cardLast4}.</Typography>}
          {sub.hasSavedCard && <FormControlLabel control={<Checkbox checked={newCard} onChange={(e) => setNewCard(e.target.checked)} />} label="Usar outro cartão" />}
          {(newCard || !sub.hasSavedCard) && (
            <Box sx={{ display: "grid", gap: 1.5, mt: 1, gridTemplateColumns: "1fr 1fr" }}>
              <Box sx={{ gridColumn: "1 / -1", display: "grid" }}>{field("holderName", "Nome impresso no cartão", "cc-name")}</Box>
              <Box sx={{ gridColumn: "1 / -1", display: "grid" }}>{field("number", "Número do cartão", "cc-number")}</Box>
              {field("expiryMonth", "Mês (MM)", "cc-exp-month")}{field("expiryYear", "Ano (AAAA)", "cc-exp-year")}{field("ccv", "CVV", "cc-csc")}
              <TextField size="small" label="CEP de cobrança" value={extra.postalCode} onChange={(e) => setExtra((x) => ({ ...x, postalCode: e.target.value }))} />
              <TextField size="small" label="Número do endereço" value={extra.addressNumber} onChange={(e) => setExtra((x) => ({ ...x, addressNumber: e.target.value }))} />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReactivate(false)}>Voltar</Button>
          <Button variant="contained" disabled={busy} onClick={doReactivate}>{busy ? "Cobrando..." : "Reativar e cobrar agora"}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={confirm} onClose={() => setConfirm(false)}>
        <DialogTitle>Cancelar a assinatura?</DialogTitle>
        <DialogContent>
          <Typography>Nenhuma nova cobrança será feita. Você mantém o acesso completo até {brDate(sub.accessUntil)}. Depois disso a conta fica somente leitura e seus dados continuam preservados.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Manter assinatura</Button>
          <Button color="error" variant="contained" disabled={busy} onClick={cancel}>Cancelar assinatura</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
