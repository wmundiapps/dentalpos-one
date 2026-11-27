import { Alert, Box, Button, FormControlLabel, Switch, Typography } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { useEffect, useState } from "react";
import { ligarSom, tocarAlerta, useResumo } from "./resumo";

/** Alerta visual e sonoro quando alguém pede para falar com uma pessoa (mesma técnica do alerta da Central de Atendimento):
 *  Web Audio sem arquivo, liga/desliga guardado no navegador e só toca depois de o usuário interagir com a página. */
export default function AlertaPedidos({ onAbrir }: { onAbrir: (canalId: string) => void }) {
  const { resumo, som, audioLiberado } = useResumo();
  const [novo, setNovo] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  useEffect(() => {
    const f = () => { setNovo(true); window.setTimeout(() => setNovo(false), 8000); };
    window.addEventListener("edu-msg-pedido-novo", f);
    return () => window.removeEventListener("edu-msg-pedido-novo", f);
  }, []);
  const itens = resumo?.pedidos.itens ?? [];
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      {itens.length > 0 ? (
        <Alert severity={novo ? "error" : "warning"} icon={<NotificationsActiveIcon />} role="alert"
          action={<Button color="inherit" size="small" onClick={() => onAbrir(itens[0].canalId)}>Atender</Button>}
          sx={novo ? { animation: "pulsoMsgBanner 1s ease-in-out 4", "@keyframes pulsoMsgBanner": { "50%": { opacity: 0.55 } } } : undefined}>
          {itens.length === 1 ? "1 pessoa aguarda atendimento" : `${itens.length} pessoas aguardam atendimento`}: {itens.slice(0, 2).map((p) => `${p.solicitante.nome} (${p.canalNome})`).join(", ")}{itens.length > 2 ? "…" : ""}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <FormControlLabel control={<Switch checked={som} onChange={(e) => { ligarSom(e.target.checked); if (e.target.checked) setBloqueado(!tocarAlerta()); }} />} label="Alerta sonoro quando alguém pedir uma pessoa" />
        <Button size="small" variant="outlined" onClick={() => setBloqueado(!tocarAlerta())}>Testar som</Button>
      </Box>
      {som && (bloqueado || !audioLiberado) ? <Typography variant="caption" color="text.secondary">O navegador só libera o som depois de um clique na página. Clique em qualquer lugar (ou em “Testar som”) para ativar.</Typography> : null}
    </Box>
  );
}
