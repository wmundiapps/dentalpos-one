import { Alert, Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { Section } from "./kit";

const NOME = "Omnichannel EduMaster";
const SCRIPT = '<script src="/wmundi-omnichannel.js" data-product="edumaster" defer></script>';
const CANAIS = ["WhatsApp", "Instagram", "Messenger", "E-mail", "Formulário de lead"];

// Mostra o canal omnichannel do EduMaster e abre o widget em modo demonstração (nada é enviado).
function abrirDemo() {
  try {
    document.getElementById("wmundi-omni")?.remove();
    (window as any).WMundiOmni = undefined;
    const s = document.createElement("script");
    s.src = "/wmundi-omnichannel.js";
    s.dataset.product = "edumaster";
    s.dataset.demo = "true";
    s.onload = () => (window as any).WMundiOmni?.open();
    document.body.appendChild(s);
  } catch { /* demonstração indisponível */ }
}

export default function OmnichannelTab() {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try { await navigator.clipboard.writeText(SCRIPT); setCopiado(true); window.setTimeout(() => setCopiado(false), 2500); } catch { /* sem permissão */ }
  }
  return (
    <Section title={NOME}>
      <Alert severity="info" sx={{ mb: 2 }}>Canal único de atendimento e captação do EduMaster. Está instalado na página pública de apresentação e grava cada lead (com autorização) no atendimento de vendas da WMundi.</Alert>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Typography sx={{ fontWeight: 800, mb: 1 }}>Canais ativos</Typography>
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>{CANAIS.map((c) => <Chip key={c} label={c} color="primary" variant="outlined" />)}</Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Telegram e telefone aparecem quando os números forem cadastrados.</Typography>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Typography sx={{ fontWeight: 800, mb: 1 }}>Instalar em outra página</Typography>
        <Box component="code" sx={{ display: "block", p: 1.5, bgcolor: "action.hover", borderRadius: 2, fontSize: 13, wordBreak: "break-all" }}>{SCRIPT}</Box>
        <Button size="small" sx={{ mt: 1 }} variant="outlined" onClick={() => void copiar()}>{copiado ? "Copiado" : "Copiar código"}</Button>
      </Paper>
      <Button variant="contained" onClick={abrirDemo}>Ver demonstração</Button>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Modo demonstração: nenhum lead nem mensagem é enviado de verdade.</Typography>
    </Section>
  );
}
