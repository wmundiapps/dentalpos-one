import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import PageHeader from "../components/PageHeader";
import SalesLeadDialog5787 from "../components/SalesLeadDialog5787";
import {
  Sales5787Api,
  type SalesLead5787,
} from "../services/Sales5787Api";

const stages = [
  { code: "NEW", label: "Lead" },
  { code: "CONTACT", label: "Contato" },
  { code: "APPOINTED", label: "Agendado" },
  { code: "CONSULTATION", label: "Consulta" },
  { code: "PLANNING", label: "Planejamento" },
  { code: "BUDGET", label: "Orçamento" },
  { code: "NEGOTIATION", label: "Negociação" },
  { code: "WON", label: "Aprovado" },
  { code: "LOST", label: "Perdido" },
] as const;

const temperatureLabel: Record<string, string> = {
  HOT: "Quente",
  WARM: "Morno",
  COLD: "Frio",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export default function CRM() {
  const [leads, setLeads] = useState<SalesLead5787[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setError("");
    try {
      setLeads(await Sales5787Api.leads());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar CRM.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const active = useMemo(
    () => leads.filter((lead) => lead.stage !== "LOST"),
    [leads],
  );
  const totalPipeline = active.reduce(
    (sum, lead) => sum + Number(lead.estimatedValue || 0),
    0,
  );
  const approvedValue = leads
    .filter((lead) => ["WON", "CONVERTED"].includes(lead.stage))
    .reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0);

  const changeStage = async (lead: SalesLead5787, stage: string) => {
    setSavingId(lead.id);
    setError("");
    try {
      const updated = await Sales5787Api.updateLead(lead.id, { stage });
      setLeads((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar etapa.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Box>
      <PageHeader
        title="CRM — REVAH"
        description="Funil comercial central do REVAH. DentalPos Sales reutiliza estes mesmos leads; não existe CRM paralelo."
        actionLabel="Novo lead"
        actionIcon={<AddIcon />}
        onAction={() => setDialogOpen(true)}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
          gap: 3,
          mb: 3,
        }}
      >
        <SummaryCard title="Leads cadastrados" value={String(leads.length)} />
        <SummaryCard title="Valor do funil" value={formatCurrency(totalPipeline)} />
        <SummaryCard title="Valor aprovado" value={formatCurrency(approvedValue)} />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}>
        <Button
          size="small"
          startIcon={<RefreshIcon />}
          onClick={() => void load()}
          disabled={loading}
        >
          Atualizar
        </Button>
      </Box>

      {loading ? (
        <Paper variant="outlined" sx={{ p: 4 }}>
          <Typography color="text.secondary">Carregando CRM...</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 2 }}>
          {stages.map((stage) => {
            const stageLeads = leads.filter((lead) => lead.stage === stage.code);
            const stageValue = stageLeads.reduce(
              (sum, lead) => sum + Number(lead.estimatedValue || 0),
              0,
            );

            return (
              <Paper
                key={stage.code}
                elevation={0}
                sx={{
                  width: 310,
                  minWidth: 310,
                  p: 2,
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "background.default",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 1,
                    mb: 1,
                  }}
                >
                  <Typography sx={{ fontWeight: 800 }}>{stage.label}</Typography>
                  <Chip size="small" label={stageLeads.length} color="primary" />
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {formatCurrency(stageValue)}
                </Typography>

                {stageLeads.length === 0 ? (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2.5,
                      borderRadius: 2,
                      textAlign: "center",
                      borderStyle: "dashed",
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Nenhum lead
                    </Typography>
                  </Paper>
                ) : (
                  stageLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      saving={savingId === lead.id}
                      onStage={(next) => void changeStage(lead, next)}
                    />
                  ))
                )}
              </Paper>
            );
          })}
        </Box>
      )}

      <SalesLeadDialog5787
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={(lead) => setLeads((current) => [lead, ...current])}
      />
    </Box>
  );
}

function LeadCard({
  lead,
  saving,
  onStage,
}: {
  lead: SalesLead5787;
  saving: boolean;
  onStage: (stage: string) => void;
}) {
  const temperature = temperatureLabel[lead.temperature] || lead.temperature;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mb: 1.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
        <Avatar sx={{ width: 40, height: 40, bgcolor: "primary.main" }}>
          {lead.name.charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800 }}>{lead.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {lead.company || lead.source || "Origem não informada"}
          </Typography>
        </Box>
      </Box>

      <Typography sx={{ fontWeight: 800 }}>
        {formatCurrency(Number(lead.estimatedValue || 0))}
      </Typography>

      <Box sx={{ display: "flex", gap: 0.7, flexWrap: "wrap", my: 1 }}>
        {lead.source && <Chip size="small" label={lead.source} variant="outlined" />}
        <Chip
          size="small"
          label={temperature}
          color={lead.temperature === "HOT" ? "error" : lead.temperature === "WARM" ? "warning" : "default"}
          variant="outlined"
        />
      </Box>

      {lead.nextAction && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Próxima ação: {lead.nextAction}
        </Typography>
      )}

      <TextField
        select
        fullWidth
        size="small"
        label="Etapa"
        value={lead.stage}
        disabled={saving}
        onChange={(e) => onStage(e.target.value)}
      >
        {stages.map((stage) => (
          <MenuItem key={stage.code} value={stage.code}>
            {stage.label}
          </MenuItem>
        ))}
      </TextField>
    </Paper>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 900, mt: 0.7 }}>
        {value}
      </Typography>
    </Paper>
  );
}
