import { useState } from "react";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import { useLocation } from "react-router-dom";
import { createPlatformFeedback } from "../services/PlatformFeedbackApi";

// Caixa de sugestões e relato de erros, fixa e bem visível no fim de cada página.
export default function SuggestionBox() {
  const location = useLocation();
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState("");
  const enviar = async () => {
    if (texto.trim().length < 3) { setErro("Escreva sua sugestão ou o erro encontrado."); return; }
    setBusy(true); setErro("");
    try {
      await createPlatformFeedback({ type: "Sugestão", priority: "Média", title: "", description: texto.trim(), pagePath: `${location.pathname}${location.search}` } as any);
      setOk(true); setTexto("");
    } catch (e: any) { setErro(e?.message || "Não foi possível enviar agora. Tente novamente."); }
    finally { setBusy(false); }
  };
  return (
    <Paper variant="outlined" className="no-print" sx={{ mt: 4, p: { xs: 2, md: 3 }, borderRadius: 3, border: "2px solid", borderColor: "warning.main", bgcolor: "rgba(255,193,7,.10)" }}>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <LightbulbIcon color="warning" sx={{ fontSize: 34, mt: 0.3 }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 900, fontSize: { xs: 16, md: 19 }, lineHeight: 1.25 }}>QUAL MELHORIA VOCÊ GOSTARIA DE IMPLEMENTAR, NOS CONTE AQUI NA CAIXINHA DE SUGESTÕES</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: 14, md: 16 }, mt: 0.5 }}>CASO QUEIRA RELATAR ALGUM ERRO, PODE USAR ESTA MESMA CAIXA</Typography>
        </Box>
      </Box>
      {ok ? <Alert severity="success" sx={{ mt: 2 }} onClose={() => setOk(false)}>Obrigado! Recebemos sua mensagem e vamos analisar.</Alert> : (
        <Box sx={{ mt: 2, display: "flex", gap: 1.5, flexDirection: { xs: "column", md: "row" }, alignItems: { md: "flex-start" } }}>
          <TextField fullWidth multiline minRows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva aqui sua sugestão de melhoria ou o erro que encontrou…" error={!!erro} helperText={erro || " "} slotProps={{ htmlInput: { maxLength: 2000 } }} sx={{ bgcolor: "background.paper" }} />
          <Button variant="contained" color="warning" size="large" disabled={busy} onClick={enviar} sx={{ fontWeight: 800, minWidth: 160 }}>{busy ? "Enviando…" : "Enviar"}</Button>
        </Box>
      )}
    </Paper>
  );
}
