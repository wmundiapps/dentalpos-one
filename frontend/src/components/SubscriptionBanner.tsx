import { useEffect, useState } from "react";
import { Alert, Box, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { brl, getMySubscription, type SubscriptionView } from "../services/SubscriptionApi";

// Aviso fixo no sistema: mensalidade em atraso ou conta somente leitura depois do cancelamento. Some sozinho quando regulariza.
export default function SubscriptionBanner() {
  const [sub, setSub] = useState<SubscriptionView | null>(null);
  const navigate = useNavigate();
  useEffect(() => { getMySubscription().then(setSub).catch(() => setSub(null)); }, []);

  if (!sub?.exists) return null;

  if (sub.pastDue) {
    return (
      <Alert severity="error" sx={{ borderRadius: 0, px: { xs: 2, md: 4 }, py: 1, "& .MuiAlert-message": { width: "100%" } }}>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <span><b>Mensalidade em atraso{sub.overdue ? ` (${brl(sub.overdue.total)})` : ""}.</b> Regularize para não perder o acesso à assinatura. Seus dados continuam seguros.</span>
          <Box sx={{ display: "flex", gap: 1 }}>
            {sub.overdue?.invoiceUrl && <Button size="small" variant="contained" color="error" href={sub.overdue.invoiceUrl} target="_blank" rel="noreferrer">Pagar agora</Button>}
            <Button size="small" variant="outlined" color="inherit" onClick={() => navigate("/configuracoes")}>Minha assinatura</Button>
          </Box>
        </Box>
      </Alert>
    );
  }

  // Teste sem cartão: contador de gratuidade fixo + convite para cadastrar o cartão (mais forte nos últimos 3 dias).
  if (sub.noCardTrial && !sub.trialExpired) {
    const left = sub.trialDaysLeft ?? 0;
    return (
      <Alert severity={left <= 3 ? "warning" : "info"} sx={{ borderRadius: 0, px: { xs: 2, md: 4 }, py: 1, "& .MuiAlert-message": { width: "100%" } }}>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <span><b>Teste grátis: {left === 0 ? "último dia" : `faltam ${left} dia(s)`}.</b> {left <= 3 ? "Cadastre o cartão agora para não perder o acesso." : "Cadastre o cartão quando quiser para continuar depois do teste; nada é cobrado antes."}</span>
          <Button size="small" variant="contained" onClick={() => navigate("/configuracoes")}>Cadastrar cartão</Button>
        </Box>
      </Alert>
    );
  }

  if (sub.readOnly && sub.trialExpired) {
    return (
      <Alert severity="error" sx={{ borderRadius: 0, px: { xs: 2, md: 4 }, py: 1, "& .MuiAlert-message": { width: "100%" } }}>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <span><b>Seu teste grátis terminou: a conta está somente para leitura.</b> Seus dados estão guardados. Cadastre o cartão para voltar a usar tudo.</span>
          <Button size="small" variant="contained" color="error" onClick={() => navigate("/configuracoes")}>Cadastrar cartão</Button>
        </Box>
      </Alert>
    );
  }

  if (sub.readOnly) {
    return (
      <Alert severity="warning" sx={{ borderRadius: 0, px: { xs: 2, md: 4 }, py: 1, "& .MuiAlert-message": { width: "100%" } }}>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <span><b>Assinatura cancelada: a conta está somente leitura.</b> Seus dados estão preservados. Reative quando quiser.</span>
          <Button size="small" variant="contained" onClick={() => navigate("/configuracoes")}>Reativar assinatura</Button>
        </Box>
      </Alert>
    );
  }

  return null;
}
