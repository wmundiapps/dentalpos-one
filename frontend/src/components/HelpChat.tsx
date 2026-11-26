import { useEffect, useRef, useState } from "react";
import { Alert, Box, CircularProgress, IconButton, Paper, TextField, Tooltip, Typography } from "@mui/material";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import { useLocation } from "react-router-dom";
import { askHelp, type HelpMessage } from "../services/HelpChatApi";

const HELLO: HelpMessage = { role: "assistant", content: "Oi! Sou o assistente do CompletoDonto. Me conte sua dúvida ou o problema que apareceu e eu explico o passo a passo." };
const IDEAS = ["Como marcar uma consulta?", "Como cobrar um paciente em atraso?", "Onde vejo o caixa do dia?"];

// Ícone ao lado do botão de avaliação: vira um chat com IA que tira dúvidas sobre o sistema.
export default function HelpChat({ onOpen }: { onOpen?: () => void }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<HelpMessage[]>([HELLO]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, open]);

  const send = async (raw?: string) => {
    const q = (raw ?? text).trim();
    if (!q || busy) return;
    setError(""); setText("");
    const history = messages.filter((m) => m !== HELLO);
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const answer = await askHelp(q, history, `${location.pathname}${location.search}`);
      setMessages((m) => [...m, { role: "assistant", content: answer || "Não consegui responder agora. Tente de novo." }]);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível falar com a ajuda."); }
    finally { setBusy(false); }
  };

  return (
    <>
      {open && (
        <Paper elevation={8} role="dialog" aria-label="Chat de ajuda" sx={{ position: "absolute", right: 0, bottom: 56, width: { xs: "calc(100vw - 32px)", sm: 360 }, height: 460, maxHeight: "70vh", display: "flex", flexDirection: "column", borderRadius: 3, overflow: "hidden" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.2, bgcolor: "primary.main", color: "#fff" }}>
            <SmartToyOutlinedIcon fontSize="small" />
            <Typography sx={{ fontWeight: 800, flex: 1 }}>Ajuda com IA</Typography>
            <IconButton size="small" aria-label="Fechar o chat" onClick={() => setOpen(false)} sx={{ color: "#fff" }}><CloseIcon fontSize="small" /></IconButton>
          </Box>
          <Box sx={{ flex: 1, overflowY: "auto", p: 1.5, display: "grid", gap: 1, alignContent: "start" }}>
            {messages.map((m, i) => (
              <Box key={i} sx={{ justifySelf: m.role === "user" ? "end" : "start", maxWidth: "88%", px: 1.5, py: 1, borderRadius: 2, bgcolor: m.role === "user" ? "primary.main" : "action.hover", color: m.role === "user" ? "#fff" : "text.primary", whiteSpace: "pre-wrap", fontSize: 14 }}>{m.content}</Box>
            ))}
            {messages.length === 1 && IDEAS.map((q) => (
              <Box key={q} role="button" tabIndex={0} onClick={() => void send(q)} onKeyDown={(e) => { if (e.key === "Enter") void send(q); }} sx={{ justifySelf: "start", px: 1.5, py: 0.8, border: "1px solid", borderColor: "primary.main", color: "primary.main", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>{q}</Box>
            ))}
            {busy && <Box sx={{ justifySelf: "start" }}><CircularProgress size={18} /></Box>}
            <div ref={endRef} />
          </Box>
          {error && <Alert severity="error" sx={{ mx: 1.5, mb: 1, py: 0 }} onClose={() => setError("")}>{error}</Alert>}
          <Box sx={{ display: "flex", gap: 1, p: 1.2, borderTop: "1px solid", borderColor: "divider" }}>
            <TextField size="small" fullWidth placeholder="Digite sua dúvida" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} slotProps={{ htmlInput: { maxLength: 800, "aria-label": "Sua dúvida" } }} />
            <IconButton color="primary" aria-label="Enviar" disabled={busy || !text.trim()} onClick={() => void send()}><SendIcon /></IconButton>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, pb: 1 }}>Não digite senhas nem dados de pacientes. A IA pode errar: confira em caso de dúvida.</Typography>
        </Paper>
      )}
      <Tooltip title={open ? "Fechar a ajuda" : "Ajuda com IA"}>
        <IconButton aria-label="Ajuda com IA" onClick={() => { setOpen((v) => !v); if (!open) onOpen?.(); }} sx={{ bgcolor: "primary.main", color: "#fff", boxShadow: 6, width: 44, height: 44, "&:hover": { bgcolor: "primary.dark" } }}>
          {open ? <CloseIcon /> : <SmartToyOutlinedIcon />}
        </IconButton>
      </Tooltip>
    </>
  );
}
