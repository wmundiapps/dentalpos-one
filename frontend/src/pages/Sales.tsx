import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import EmailIcon from "@mui/icons-material/Email";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ReplayIcon from "@mui/icons-material/Replay";
import PageHeader from "../components/PageHeader";

type Opportunity = {
  id: number;
  customer: string;
  channel: "WhatsApp" | "E-mail" | "Loja";
  stage: string;
  value: number;
  nextAction: string;
  temperature: "Quente" | "Morno" | "Frio";
};

const opportunities: Opportunity[] = [
  { id: 1, customer: "Clínica Sorriso", channel: "WhatsApp", stage: "Proposta enviada", value: 2840, nextAction: "Retomar em 2 h", temperature: "Quente" },
  { id: 2, customer: "Dr. Marcos", channel: "Loja", stage: "Carrinho abandonado", value: 1260, nextAction: "Recuperar carrinho", temperature: "Quente" },
  { id: 3, customer: "Odonto Prime", channel: "E-mail", stage: "Qualificação", value: 4380, nextAction: "Confirmar plataforma", temperature: "Morno" },
  { id: 4, customer: "Dra. Ana", channel: "WhatsApp", stage: "Aguardando resposta", value: 890, nextAction: "Follow-up amanhã", temperature: "Morno" },
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function Sales() {
  const [tab, setTab] = useState(0);
  const pipeline = useMemo(() => opportunities.reduce((sum, item) => sum + item.value, 0), []);

  return (
    <Box>
      <PageHeader
        title="DentalPos Sales"
        description="Central comercial omnichannel com IA, recuperação de oportunidades, pedidos, fiscal e logística."
        actionLabel="Novo lead"
        actionIcon={<AddIcon />}
        onAction={() => alert("Cadastro de lead será conectado ao CRM na próxima etapa.")}
      />

      <Alert severity="info" icon={<AutoAwesomeIcon />} sx={{ mb: 3 }}>
        <strong>Sales AI:</strong> 2 oportunidades quentes precisam de ação. Potencial aberto de {brl.format(pipeline)}.
      </Alert>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Metric title="Pipeline aberto" value={brl.format(pipeline)} detail="4 oportunidades" />
        <Metric title="Conversas" value="18" detail="5 aguardando retorno" />
        <Metric title="Recuperação" value="2" detail="carrinhos/leads prioritários" />
        <Metric title="Pedidos hoje" value="3" detail="fiscal e envio em sequência" />
      </Grid>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Canais 24 horas</Typography>
              <Typography variant="body2" color="text.secondary">Uma única ficha do cliente, independentemente de onde a conversa começou.</Typography>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Chip icon={<WhatsAppIcon />} label="WhatsApp • preparado" color="success" variant="outlined" />
              <Chip icon={<EmailIcon />} label="E-mail • preparado" variant="outlined" />
              <Chip icon={<ShoppingCartIcon />} label="Loja virtual • preparada" variant="outlined" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto">
          <Tab label="Oportunidades" />
          <Tab label="Recuperação" />
          <Tab label="Pedidos" />
          <Tab label="Automação" />
        </Tabs>
        <Divider />
        <CardContent>
          {tab === 0 && <OpportunityList items={opportunities} />}
          {tab === 1 && <RecoveryPanel />}
          {tab === 2 && <OrderFlow />}
          {tab === 3 && <AutomationPanel />}
        </CardContent>
      </Card>
    </Box>
  );
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
      <Card sx={{ height: "100%" }}><CardContent>
        <Typography variant="body2" color="text.secondary">{title}</Typography>
        <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5 }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{detail}</Typography>
      </CardContent></Card>
    </Grid>
  );
}

function OpportunityList({ items }: { items: Opportunity[] }) {
  return <Stack spacing={1.5}>{items.map((item) => (
    <Box key={item.id} sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between" }}>
        <Box>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Typography sx={{ fontWeight: 700 }}>{item.customer}</Typography>
            <Chip size="small" label={item.channel} />
            <Chip size="small" label={item.temperature} color={item.temperature === "Quente" ? "error" : "warning"} variant="outlined" />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.stage} • {item.nextAction}</Typography>
        </Box>
        <Typography sx={{ fontWeight: 800 }}>{brl.format(item.value)}</Typography>
      </Stack>
    </Box>
  ))}</Stack>;
}

function RecoveryPanel() {
  return <Stack spacing={2}>
    <Alert severity="warning" icon={<ReplayIcon />}>A recuperação automática só será disparada após configuração das regras, horários e consentimentos de comunicação.</Alert>
    <Flow title="Carrinhos abandonados" detail="Detectar abandono → aguardar → mensagem contextual → encaminhar para humano se necessário" progress={70} />
    <Flow title="Conversas interrompidas" detail="Identificar lead sem resposta → classificar objeção → follow-up inteligente" progress={55} />
    <Flow title="Reposição prevista" detail="Aprender ciclo de compra → estimar consumo → sugerir recompra no momento adequado" progress={35} />
  </Stack>;
}

function OrderFlow() {
  return <Grid container spacing={2}>
    <FlowCard icon={<ShoppingCartIcon />} title="1. Pedido" text="Carrinho ou pedido aprovado pelo cliente." />
    <FlowCard icon={<ReceiptLongIcon />} title="2. Fiscal" text="Emissão fiscal após integração e regras tributárias." />
    <FlowCard icon={<LocalShippingIcon />} title="3. Expedição" text="Etiqueta, transportadora, rastreio e aviso ao cliente." />
  </Grid>;
}

function AutomationPanel() {
  return <Stack spacing={1.5}>
    <Typography sx={{ fontWeight: 700 }}>Regras do vendedor digital</Typography>
    {[
      "IA atende 24h, mas se identifica como assistente virtual.",
      "Preços, descontos, parcelamento e frete obedecem limites configurados.",
      "Dúvidas clínicas/técnicas fora da base são transferidas para um especialista.",
      "Toda conversa gera histórico e próxima ação no CRM.",
      "Pagamento confirmado poderá acionar fiscal, estoque, expedição e pós-venda.",
    ].map((rule) => <Alert key={rule} severity="success">{rule}</Alert>)}
  </Stack>;
}

function Flow({ title, detail, progress }: { title: string; detail: string; progress: number }) {
  return <Box><Stack direction="row" sx={{ justifyContent: "space-between" }}><Typography sx={{ fontWeight: 700 }}>{title}</Typography><Typography variant="caption">{progress}% estruturado</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{detail}</Typography><LinearProgress variant="determinate" value={progress} /></Box>;
}

function FlowCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <Grid size={{ xs: 12, md: 4 }}><Card variant="outlined" sx={{ height: "100%" }}><CardContent><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Box>{icon}</Box><Typography sx={{ fontWeight: 700 }}>{title}</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{text}</Typography><Button size="small" sx={{ mt: 1 }}>Configurar integração</Button></CardContent></Card></Grid>;
}
