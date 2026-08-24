import {
  Avatar,
  Box,
  Button,
  Chip,
  Paper,
  Typography,
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import PhoneIcon from "@mui/icons-material/Phone";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

import type { CRMLead, CRMStatus } from "../types/crm";

import PageHeader from "../components/PageHeader";
import { crmLeads } from "../services/CRMService";

const crmStages: CRMStatus[] = [
  "Novo Lead",
  "Contato",
  "Avaliação",
  "Orçamento",
  "Negociação",
  "Fechado",
  "Perdido",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getStageColor(status: CRMStatus) {
  switch (status) {
    case "Novo Lead":
      return "info" as const;

    case "Contato":
      return "primary" as const;

    case "Avaliação":
      return "secondary" as const;

    case "Orçamento":
      return "warning" as const;

    case "Negociação":
      return "warning" as const;

    case "Fechado":
      return "success" as const;

    case "Perdido":
      return "error" as const;

    default:
      return "default" as const;
  }
}

function getNextAction(lead: CRMLead) {
  switch (lead.status) {
    case "Novo Lead":
      return "Realizar primeiro contato em até 15 minutos.";

    case "Contato":
      return "Tentar converter o contato em avaliação.";

    case "Avaliação":
      return "Confirmar consulta e enviar orientações.";

    case "Orçamento":
      return "Apresentar opções de parcelamento.";

    case "Negociação":
      return "Realizar follow-up e tratar objeções.";

    case "Fechado":
      return "Integrar o tratamento à agenda e ao financeiro.";

    case "Perdido":
      return "Programar campanha de reativação futura.";

    default:
      return "Acompanhar oportunidade.";
  }
}

export default function CRMKanban() {
  const totalPipeline = crmLeads
    .filter((lead) => lead.status !== "Perdido")
    .reduce(
      (total, lead) => total + lead.valorEstimado,
      0,
    );

  const closedValue = crmLeads
    .filter((lead) => lead.status === "Fechado")
    .reduce(
      (total, lead) => total + lead.valorEstimado,
      0,
    );

  return (
    <Box>
      <PageHeader
        title="CRM Inteligente"
        description="Pipeline comercial, acompanhamento de leads e automações de relacionamento."
        actionLabel="Novo lead"
        actionIcon={<AddIcon />}
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(3, 1fr)",
          },
          gap: 3,
          mb: 4,
        }}
      >
        <SummaryCard
          title="Leads cadastrados"
          value={String(crmLeads.length)}
        />

        <SummaryCard
          title="Valor do pipeline"
          value={formatCurrency(totalPipeline)}
        />

        <SummaryCard
          title="Valor fechado"
          value={formatCurrency(closedValue)}
        />
      </Box>

      <Box
        sx={{
          display: "flex",
          gap: 2,
          overflowX: "auto",
          pb: 3,
        }}
      >
        {crmStages.map((stage) => {
          const stageLeads = crmLeads.filter(
            (lead) => lead.status === stage,
          );

          const stageValue = stageLeads.reduce(
            (total, lead) =>
              total + lead.valorEstimado,
            0,
          );

          return (
            <Paper
              key={stage}
              elevation={0}
              sx={{
                width: 330,
                minWidth: 330,
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
                  gap: 2,
                  mb: 1,
                }}
              >
                <Chip
                  label={stage}
                  color={getStageColor(stage)}
                  sx={{
                    fontWeight: 800,
                  }}
                />

                <Chip
                  size="small"
                  label={stageLeads.length}
                  variant="outlined"
                />
              </Box>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mb: 2,
                }}
              >
                {formatCurrency(stageValue)}
              </Typography>

              {stageLeads.length === 0 ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 3,
                    borderRadius: 2,
                    borderStyle: "dashed",
                    textAlign: "center",
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    Nenhum lead nesta etapa
                  </Typography>
                </Paper>
              ) : (
                stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                  />
                ))
              )}
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}

interface LeadCardProps {
  lead: CRMLead;
}

function LeadCard({ lead }: LeadCardProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          mb: 2,
        }}
      >
        <Avatar
          sx={{
            width: 42,
            height: 42,
            bgcolor: "primary.main",
          }}
        >
          {lead.nome.charAt(0).toUpperCase()}
        </Avatar>

        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 800,
            }}
          >
            {lead.nome}
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
          >
            {lead.procedimento}
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 1,
        }}
      >
        <AttachMoneyIcon
          fontSize="small"
          color="action"
        />

        <Typography
          sx={{
            fontWeight: 800,
          }}
        >
          {formatCurrency(lead.valorEstimado)}
        </Typography>
      </Box>

      <Typography
        variant="body2"
        color="text.secondary"
      >
        Origem: {lead.origem}
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
      >
        Responsável: {lead.responsavel}
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
      >
        Atualização: {lead.ultimaAtualizacao}
      </Typography>

      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          mt: 2,
          borderRadius: 2,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
          }}
        >
          <AutoAwesomeIcon
            color="primary"
            fontSize="small"
          />

          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
              }}
            >
              Sugestão da IA
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
            >
              {getNextAction(lead)}
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1,
          mt: 2,
        }}
      >
        <Button
          size="small"
          variant="outlined"
          startIcon={<PhoneIcon />}
        >
          Ligar
        </Button>

        <Button
          size="small"
          variant="contained"
          startIcon={<WhatsAppIcon />}
        >
          WhatsApp
        </Button>
      </Box>

      <Button
        fullWidth
        size="small"
        variant="text"
        startIcon={<CalendarMonthIcon />}
        sx={{
          mt: 1,
        }}
      >
        Agendar próxima ação
      </Button>
    </Paper>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
}

function SummaryCard({
  title,
  value,
}: SummaryCardProps) {
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
      <Typography color="text.secondary">
        {title}
      </Typography>

      <Typography
        variant="h5"
        sx={{
          mt: 1,
          fontWeight: 900,
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}