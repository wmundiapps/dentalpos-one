import { useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Divider, List, ListItemButton, ListItemText, Paper, Stack, TextField, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";

type Conversation = { id: string; contact: string; channel: string; status: string; lastMessage: string };
const initial: Conversation[] = [
  { id: "demo-1", contact: "Contato demonstração", channel: "WHATSAPP", status: "BOT", lastMessage: "Gostaria de saber mais." },
  { id: "demo-2", contact: "Lead demonstração", channel: "INSTAGRAM", status: "HUMAN", lastMessage: "Pode me enviar os horários?" },
];

export default function RevahChatbot() {
  const [selectedId, setSelectedId] = useState(initial[0].id);
  const [message, setMessage] = useState("");
  const selected = useMemo(() => initial.find((conversation) => conversation.id === selectedId) ?? initial[0], [selectedId]);
  return (
    <Box>
      <PageHeader title="REVAH Chatbot Omnichannel" description="Caixa de entrada unificada com bot, IA, transferência para humano e vínculo com CRM." />
      <Alert severity="warning" sx={{ mb: 2 }}>Modo de homologação: canais reais só enviam/recebem depois da configuração de credenciais, consentimento, opt-out, templates e validação do provedor.</Alert>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "360px 1fr" }, gap: 2 }}>
        <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 4, overflow: "hidden" }}>
          <Box sx={{ p: 2 }}><Typography variant="h6" sx={{ fontWeight: 900 }}>Conversas</Typography><Stack direction="row" sx={{ mt: 1, gap: 1, flexWrap: "wrap" }}>{["WhatsApp", "Instagram", "Facebook", "Telegram", "Voz"].map((c) => <Chip size="small" key={c} label={c} />)}</Stack></Box>
          <Divider />
          <List disablePadding>{initial.map((conversation) => <ListItemButton key={conversation.id} selected={selectedId === conversation.id} onClick={() => setSelectedId(conversation.id)}><ListItemText primary={conversation.contact} secondary={`${conversation.channel} • ${conversation.lastMessage}`} /></ListItemButton>)}</List>
        </Paper>
        <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider", borderRadius: 4 }}>
          <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}>
            <Box><Typography variant="h6" sx={{ fontWeight: 900 }}>{selected.contact}</Typography><Typography color="text.secondary">{selected.channel} • atendimento {selected.status === "BOT" ? "automático" : "humano"}</Typography></Box>
            <Stack direction="row" sx={{ gap: 1 }}><Button variant="outlined">Assumir atendimento</Button><Button variant="outlined">Criar oportunidade</Button></Stack>
          </Stack>
          <Box sx={{ my: 3, p: 2, bgcolor: "action.hover", borderRadius: 3 }}><Typography sx={{ fontWeight: 700 }}>{selected.lastMessage}</Typography><Typography variant="caption" color="text.secondary">Mensagem de demonstração — nenhuma mensagem real foi enviada.</Typography></Box>
          <TextField fullWidth multiline minRows={3} label="Resposta" value={message} onChange={(event) => setMessage(event.target.value)} />
          <Stack direction="row" sx={{ mt: 2, gap: 1 }}><Button variant="contained" disabled={!message.trim()}>Enviar</Button><Button variant="outlined">Sugerir resposta com IA</Button></Stack>
        </Paper>
      </Box>
    </Box>
  );
}
