import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  LinearProgress,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
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
import AffiliateSupplierForm5787 from "../components/AffiliateSupplierForm5787";
import SalesLeadDialog5787 from "../components/SalesLeadDialog5787";
import {
  Sales5787Api,
  type SalesLead5787,
  type StoreConfig5787,
} from "../services/Sales5787Api";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const STAGE_LABEL: Record<string, string> = {
  NEW: "Novo lead",
  CONTACT: "Contato",
  APPOINTED: "Agendado",
  CONSULTATION: "Consulta",
  PLANNING: "Planejamento",
  BUDGET: "Orçamento",
  NEGOTIATION: "Negociação",
  WON: "Fechado",
  CONVERTED: "Convertido",
  LOST: "Perdido",
};

const TEMPERATURE_LABEL: Record<string, string> = {
  HOT: "Quente",
  WARM: "Morno",
  COLD: "Frio",
};

export default function Sales() {
  const [tab, setTab] = useState(0);
  const [leads, setLeads] = useState<SalesLead5787[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [leadError, setLeadError] = useState("");
  const [leadDialog, setLeadDialog] = useState(false);

  const loadLeads = async () => {
    setLeadError("");
    try {
      setLeads(await Sales5787Api.leads());
    } catch (e) {
      setLeadError(e instanceof Error ? e.message : "Falha ao carregar oportunidades.");
    } finally {
      setLoadingLeads(false);
    }
  };

  useEffect(() => {
    void loadLeads();
  }, []);

  const activeLeads = useMemo(
    () => leads.filter((lead) => !["WON", "CONVERTED", "LOST"].includes(lead.stage)),
    [leads],
  );
  const pipeline = useMemo(
    () => activeLeads.reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0),
    [activeLeads],
  );
  const hot = activeLeads.filter((lead) => lead.temperature === "HOT").length;
  const won = leads.filter((lead) => ["WON", "CONVERTED"].includes(lead.stage));
  const wonValue = won.reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0);

  return (
    <Box>
      <PageHeader
        title="DentalPos Sales"
        description="Loja, estoque, fornecedores e visão comercial compartilhando o mesmo CRM do REVAH."
        actionLabel="Novo lead"
        actionIcon={<AddIcon />}
        onAction={() => setLeadDialog(true)}
      />

      {leadError && <Alert severity="error" sx={{ mb: 2 }}>{leadError}</Alert>}

      <Alert severity="info" icon={<AutoAwesomeIcon />} sx={{ mb: 3 }}>
        <strong>Sales + REVAH:</strong> o funil comercial usa os mesmos leads persistidos no backend.
        {hot > 0 ? ` ${hot} oportunidade(s) quente(s) precisam de ação.` : " Nenhuma oportunidade quente pendente."}
      </Alert>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Metric title="Pipeline aberto" value={brl.format(pipeline)} detail={`${activeLeads.length} oportunidade(s)`} />
        <Metric title="Leads cadastrados" value={String(leads.length)} detail="fonte única no CRM" />
        <Metric title="Oportunidades quentes" value={String(hot)} detail="prioridade comercial" />
        <Metric title="Valor fechado" value={brl.format(wonValue)} detail={`${won.length} conversão(ões)`} />
      </Grid>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1}
            sx={{
              alignItems: { md: "center" },
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Canais e origem do relacionamento
              </Typography>
              <Typography variant="body2" color="text.secondary">
                CRM e comunicação ficam no REVAH; Sales reutiliza os registros comerciais, sem criar funil paralelo.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Chip icon={<WhatsAppIcon />} label="WhatsApp • REVAH" color="success" variant="outlined" />
              <Chip icon={<EmailIcon />} label="E-mail • REVAH" variant="outlined" />
              <Chip icon={<ShoppingCartIcon />} label="Loja virtual • DentalPos Sales" variant="outlined" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Oportunidades" />
          <Tab label="Recuperação" />
          <Tab label="Pedidos" />
          <Tab label="Automação" />
          <Tab label="Loja virtual" />
          <Tab label="Fornecedores afiliados" />
        </Tabs>
        <Divider />
        <CardContent>
          {tab === 0 && (
            <OpportunityList
              items={leads}
              loading={loadingLeads}
              onRefresh={() => void loadLeads()}
            />
          )}
          {tab === 1 && <RecoveryPanel />}
          {tab === 2 && <OrderFlow />}
          {tab === 3 && <AutomationPanel />}
          {tab === 4 && <StorePanel />}
          {tab === 5 && <AffiliateSupplierForm5787 />}
        </CardContent>
      </Card>

      <SalesLeadDialog5787
        open={leadDialog}
        onClose={() => setLeadDialog(false)}
        onSaved={(lead) => setLeads((current) => [lead, ...current])}
      />
    </Box>
  );
}

function Metric({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
      <Card sx={{ height: "100%" }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            {title}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5 }}>
            {value}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {detail}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}

function OpportunityList({
  items,
  loading,
  onRefresh,
}: {
  items: SalesLead5787[];
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) {
    return <Typography color="text.secondary">Carregando oportunidades...</Typography>;
  }

  if (!items.length) {
    return (
      <Stack spacing={1.5}>
        <Typography color="text.secondary">
          Nenhum lead cadastrado ainda. O botão “Novo lead” cria o primeiro registro no CRM central.
        </Typography>
        <Button variant="outlined" onClick={onRefresh}>Atualizar</Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={1.5}>
      {items.map((item) => {
        const temperature = TEMPERATURE_LABEL[item.temperature] || item.temperature;
        return (
          <Box
            key={item.id}
            sx={{
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={1.5}
              sx={{ justifyContent: "space-between" }}
            >
              <Box>
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ alignItems: "center", flexWrap: "wrap" }}
                >
                  <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>
                  {item.source && <Chip size="small" label={item.source} />}
                  <Chip
                    size="small"
                    label={temperature}
                    color={
                      item.temperature === "HOT"
                        ? "error"
                        : item.temperature === "COLD"
                          ? "default"
                          : "warning"
                    }
                    variant="outlined"
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {STAGE_LABEL[item.stage] || item.stage}
                  {item.nextAction ? ` • ${item.nextAction}` : ""}
                </Typography>
                {item.company && (
                  <Typography variant="caption" color="text.secondary">
                    {item.company}
                  </Typography>
                )}
              </Box>
              <Typography sx={{ fontWeight: 800 }}>
                {brl.format(Number(item.estimatedValue || 0))}
              </Typography>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

function RecoveryPanel() {
  return (
    <Stack spacing={2}>
      <Alert severity="warning" icon={<ReplayIcon />}>
        Recuperações automáticas só podem disparar depois de regras, horários e consentimentos estarem configurados no REVAH.
      </Alert>
      <Flow
        title="Conversas interrompidas"
        detail="Lead sem resposta → regra REVAH → follow-up contextual → handoff humano quando necessário."
        progress={55}
      />
      <Flow
        title="Recall e reativação"
        detail="Pacientes e leads elegíveis → segmentação → comunicação consentida → registro de resultado."
        progress={55}
      />
      <Flow
        title="Reposição prevista"
        detail="Consumo de estoque → alerta → sugestão de recompra → loja/fornecedor."
        progress={45}
      />
    </Stack>
  );
}

function OrderFlow() {
  return (
    <Grid container spacing={2}>
      <FlowCard
        icon={<ShoppingCartIcon />}
        title="1. Pedido"
        text="Pedido deverá nascer da loja ou de uma ação comercial confirmada."
      />
      <FlowCard
        icon={<ReceiptLongIcon />}
        title="2. Fiscal"
        text="Integração fiscal permanece condicionada às regras tributárias já existentes."
      />
      <FlowCard
        icon={<LocalShippingIcon />}
        title="3. Expedição"
        text="Etiqueta, transportadora e rastreio entram após integração operacional real."
      />
    </Grid>
  );
}

function AutomationPanel() {
  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontWeight: 700 }}>Regras do vendedor digital</Typography>
      {[
        "IA se identifica como assistente virtual e não se passa por humano.",
        "Preços, descontos, parcelamento e frete obedecem limites configurados.",
        "Dúvidas clínicas/técnicas fora da base são transferidas para um especialista.",
        "Toda interação comercial relevante deve atualizar o CRM central.",
        "Pagamento confirmado poderá acionar fiscal, estoque, expedição e pós-venda somente quando cada integração estiver habilitada.",
      ].map((rule) => (
        <Alert key={rule} severity="success">{rule}</Alert>
      ))}
    </Stack>
  );
}

function Flow({
  title,
  detail,
  progress,
}: {
  title: string;
  detail: string;
  progress: number;
}) {
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between" }}>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
        <Typography variant="caption">{progress}% estruturado</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {detail}
      </Typography>
      <LinearProgress variant="determinate" value={progress} />
    </Box>
  );
}

function FlowCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Grid size={{ xs: 12, md: 4 }}>
      <Card variant="outlined" sx={{ height: "100%" }}>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box>{icon}</Box>
            <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {text}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}

function StorePanel() {
  const [config, setConfig] = useState<StoreConfig5787>({
    storefrontEnabled: false,
    directDiscountPercent: 5,
    affiliateCommissionPercent: 10,
  });
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Sales5787Api.storeConfig()
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof Error ? e.message : "Falha ao carregar configuração.");
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const saved = await Sales5787Api.updateStoreConfig(config);
      setConfig(saved);
      setMessage("Configuração da loja salva no servidor.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar configuração.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Alert severity="success">
        <strong>Loja DentalPos:</strong> parâmetros comerciais ficam persistidos por clínica e são auditáveis.
      </Alert>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <FormControlLabel
        control={
          <Switch
            checked={config.storefrontEnabled}
            disabled={busy}
            onChange={(e) =>
              setConfig({ ...config, storefrontEnabled: e.target.checked })
            }
          />
        }
        label="Loja própria habilitada"
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "280px 280px 1fr" },
          gap: 2,
        }}
      >
        <TextField
          label="Desconto da loja própria (%)"
          type="number"
          slotProps={{ htmlInput: { min: 0, max: 100, step: 0.5 } }}
          value={config.directDiscountPercent}
          disabled={busy}
          onChange={(e) =>
            setConfig({
              ...config,
              directDiscountPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
            })
          }
        />
        <TextField
          label="Comissão afiliados (%)"
          type="number"
          slotProps={{ htmlInput: { min: 0, max: 100, step: 0.5 } }}
          value={config.affiliateCommissionPercent}
          disabled={busy}
          onChange={(e) =>
            setConfig({
              ...config,
              affiliateCommissionPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
            })
          }
        />
        <Box>
          <Typography sx={{ fontWeight: 700 }}>Integração DentalPos Componentes</Typography>
          <Typography variant="body2" color="text.secondary">
            Produtos e estoque reutilizam o cadastro comercial já existente, sem criar banco paralelo no navegador.
          </Typography>
        </Box>
      </Box>

      <Box>
        <Button variant="contained" disabled={busy} onClick={() => void save()}>
          {busy ? "Salvando..." : "Salvar configuração"}
        </Button>
      </Box>
    </Stack>
  );
}
