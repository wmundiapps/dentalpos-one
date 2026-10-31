import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Typography } from "@mui/material";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import { brDate, brl, cancelMySubscription, getMySubscription, type SubscriptionView } from "../services/SubscriptionApi";

// Minha assinatura: mostra o teste, a próxima cobrança e deixa cancelar a qualquer momento (sem fidelidade).
export default function SubscriptionCard() {
  const [sub, setSub] = useState<SubscriptionView | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
        <Alert severity="info">Assinatura cancelada. Nenhuma nova cobrança será feita. Acesso completo até {brDate(sub.accessUntil)}; depois a conta fica somente leitura e seus dados continuam preservados.</Alert>
      ) : (
        <>
          {sub.pastDue && <Alert severity="warning" sx={{ mb: 2 }}>Não conseguimos cobrar a última mensalidade no cartão final {sub.cardLast4}. Confira seu e-mail: enviamos o link para regularizar.</Alert>}
          {trial && <Alert severity="success" sx={{ mb: 2 }}>Teste grátis: faltam {sub.trialDaysLeft} dia(s). Nada é cobrado até {brDate(sub.trialEndsAt)}. Se cancelar antes, não paga nada.</Alert>}
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            {trial ? "Primeira cobrança" : "Próxima cobrança"}: <b>{brl(sub.nextChargeAmount || 0)}</b>
            {trial ? ` em ${brDate(sub.trialEndsAt)}` : ""} no cartão {sub.cardBrand || ""} final {sub.cardLast4 || "----"}.
          </Typography>
          {!!sub.promoCyclesLeft && <Typography variant="body2" color="text.secondary">Desconto de 50% por mais {sub.promoCyclesLeft} mensalidade(s); depois {brl(sub.fullPrice || 0)} por mês.</Typography>}
          <Button color="error" variant="outlined" sx={{ mt: 2 }} onClick={() => setConfirm(true)}>Cancelar assinatura</Button>
        </>
      )}
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
