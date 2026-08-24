import { useMemo, useState } from "react";
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import CampaignIcon from "@mui/icons-material/Campaign";
import EmailIcon from "@mui/icons-material/Email";
import SmsIcon from "@mui/icons-material/Sms";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import TelegramIcon from "@mui/icons-material/Telegram";
import PhoneInTalkIcon from "@mui/icons-material/PhoneInTalk";
import PageHeader from "../components/PageHeader";
import { listRevahQueue, setRevahQueueStatus } from "../services/RevahQueueService";

type Campaign = {
  id: string;
  name: string;
  channel: string;
  audience: string;
  message: string;
  status: string;
  createdAt: string;
};

const channels = [
  { name: "WhatsApp", provider: "Z-API", icon: <WhatsAppIcon /> },
  { name: "SMS", provider: "Comtele", icon: <SmsIcon /> },
  { name: "E-mail", provider: "Resend", icon: <EmailIcon /> },
  { name: "Telegram", provider: "Telegram Bot API", icon: <TelegramIcon /> },
  { name: "Ligação", provider: "Twilio / a validar", icon: <PhoneInTalkIcon /> },
];

const KEY = "dentalpos_revah_campaigns_v1";

export default function Revah() {
  const [channel, setChannel] = useState("WhatsApp");
  const [name, setName] = useState("Lembrete de consulta");
  const [audience, setAudience] = useState("Pacientes com consulta amanhã");
  const [message, setMessage] = useState(
    "Olá {{nome}}, lembramos sua consulta na {{clinica}} em {{data}} às {{hora}}.",
  );
  const [items, setItems] = useState<Campaign[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]") as Campaign[];
    } catch {
      return [];
    }
  });

  const selected = useMemo(() => channels.find((item) => item.name === channel), [channel]);
  const [queueVersion,setQueueVersion]=useState(0);
  const queue=useMemo(()=>listRevahQueue(),[queueVersion,items]);

  function save() {
    const campaign: Campaign = {
      id: crypto.randomUUID(),
      name,
      channel,
      audience,
      message,
      status: "SIMULAÇÃO ALPHA",
      createdAt: new Date().toISOString(),
    };
    const next = [campaign, ...items];
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  return (
    <Box>
      <PageHeader
        title="REVAH"
        description="Relacionamento, automações e campanhas omnichannel do DentalPos One."
      />

      <Alert severity="info" sx={{ mb: 3 }}>
        Arquitetura reaproveitada do MundiBusiness sem alterar o original. O envio real fica bloqueado até
        configurar credenciais, consentimento/opt-out e validar o provedor. O Alpha registra campanhas com
        rastreabilidade.
      </Alert>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(5,1fr)" },
          gap: 2,
          mb: 3,
        }}
      >
        {channels.map((item) => (
          <Paper
            key={item.name}
            variant="outlined"
            onClick={() => setChannel(item.name)}
            sx={{
              p: 2,
              borderRadius: 4,
              cursor: "pointer",
              borderColor: item.name === channel ? "primary.main" : "divider",
            }}
          >
            <Box sx={{ color: "primary.main" }}>{item.icon}</Box>
            <Typography sx={{ fontWeight: 900 }}>{item.name}</Typography>
            <Typography variant="caption">{item.provider}</Typography>
            <br />
            <Chip size="small" label="Preparado no backend" sx={{ mt: 1 }} />
          </Paper>
        ))}
      </Box>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 900 }}>
          Nova automação / campanha
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 2fr" },
            gap: 2,
            my: 2,
          }}
        >
          <TextField label="Nome" value={name} onChange={(event) => setName(event.target.value)} />
          <TextField
            select
            label="Canal"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
          >
            {channels.map((item) => (
              <MenuItem key={item.name} value={item.name}>
                {item.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Público / gatilho"
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
          />
        </Box>

        <TextField
          fullWidth
          multiline
          minRows={5}
          label="Mensagem / template"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />

        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{
            justifyContent: "space-between",
            alignItems: { sm: "center" },
            gap: 2,
            mt: 2,
          }}
        >
          <Typography color="text.secondary">
            {selected?.name} • {selected?.provider} • variáveis: {"{{nome}} {{clinica}} {{data}} {{hora}}"}
          </Typography>
          <Button variant="contained" startIcon={<CampaignIcon />} onClick={save}>
            Salvar campanha Alpha
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 900 }}>Fila automática (Agenda + Cobrança)</Typography>
        {queue.length===0?<Typography color="text.secondary" sx={{mt:1}}>Nenhum envio automático na fila.</Typography>:queue.slice(0,30).map(q=><Box key={q.id} sx={{py:1.5,borderBottom:"1px solid",borderColor:"divider",display:"flex",justifyContent:"space-between",gap:2,alignItems:"center"}}><Box><Typography sx={{fontWeight:800}}>{q.kind} • {q.patientName}</Typography><Typography variant="body2" color="text.secondary">{q.channel} • {new Date(q.scheduledAtISO).toLocaleString("pt-BR")}</Typography><Typography variant="body2">{q.message}</Typography></Box><Box sx={{display:"flex",gap:1}}><Chip size="small" label={q.status}/>{q.status==="Pendente"&&<Button size="small" onClick={()=>{setRevahQueueStatus(q.id,"Enviado");setQueueVersion(v=>v+1)}}>Marcar enviado</Button>}</Box></Box>)}
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 900 }}>
          Campanhas salvas
        </Typography>

        {items.length === 0 ? (
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Nenhuma campanha criada.
          </Typography>
        ) : (
          items.map((item) => (
            <Box key={item.id} sx={{ py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                sx={{ justifyContent: "space-between" }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 800 }}>{item.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.channel} • {item.audience}
                  </Typography>
                </Box>
                <Chip label={item.status} size="small" />
              </Stack>
            </Box>
          ))
        )}
      </Paper>
    </Box>
  );
}
