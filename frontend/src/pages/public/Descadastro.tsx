import { Alert, Box, Button, CircularProgress, Paper, Typography } from "@mui/material";
import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

/** Descadastro em 1 clique (público, sem login). Vale para TODOS os canais (e-mail, SMS, WhatsApp, Telegram e voz). */
export default function Descadastro() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = window.location.pathname.replace(base, "").split("/").filter(Boolean)[1] || "";
  const [info, setInfo] = useState<{ instituicao: string; canal: string } | null>(null);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "feito" | "erro">("carregando");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    fetch(`${API}/public/edu/marketing/descadastro/${encodeURIComponent(token)}`).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || "Link inválido ou expirado."); setInfo(j); setEstado("pronto"); }).catch((e) => { setMsg(e.message); setEstado("erro"); });
  }, [token]);
  async function confirmar() {
    setEstado("carregando");
    try { const r = await fetch(`${API}/public/edu/marketing/descadastro/${encodeURIComponent(token)}`, { method: "POST" }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || "Não foi possível concluir."); setEstado("feito"); } catch (e: any) { setMsg(e.message); setEstado("erro"); }
  }
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2, bgcolor: "#f4f6fb" }}>
      <Paper sx={{ p: { xs: 3, sm: 4 }, maxWidth: 480, width: "100%", borderRadius: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>Cancelar recebimento de mensagens</Typography>
        {estado === "carregando" && <Box sx={{ textAlign: "center", py: 3 }}><CircularProgress /></Box>}
        {estado === "pronto" && (<>
          <Typography sx={{ mb: 2 }}>{info?.instituicao}: confirme com um clique para <b>não receber mais mensagens de divulgação</b> em nenhum canal (e-mail, SMS, WhatsApp, Telegram ou ligações).</Typography>
          <Button variant="contained" size="large" fullWidth onClick={confirmar}>Não quero mais receber</Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>Você ainda poderá receber avisos estritamente necessários de serviços que contratou. Seus dados são tratados conforme a LGPD.</Typography>
        </>)}
        {estado === "feito" && <Alert severity="success">Pronto. Você não receberá mais mensagens de divulgação, em nenhum canal.</Alert>}
        {estado === "erro" && <Alert severity="error">{msg}</Alert>}
      </Paper>
    </Box>
  );
}
