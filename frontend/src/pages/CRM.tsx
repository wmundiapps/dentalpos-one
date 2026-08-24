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
import PhoneIcon from "@mui/icons-material/Phone";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

import type { FunnelStage } from "../types/funnel";

import PageHeader from "../components/PageHeader";

interface Opportunity {
  id: number;
  patientName: string;
  treatment: string;
  value: number;
  stage: FunnelStage;
  responsible: string;
  lastContact: string;
}

const visibleStages: FunnelStage[] = [
  "Lead",
  "Contato",
  "Agendado",
  "Consulta",
  "Planejamento",
  "Orçamento",
  "Negociação",
  "Aprovado",
];

const opportunities: Opportunity[] = [
  {
    id: 1,
    patientName: "Mariana Oliveira",
    treatment: "Implantodontia",
    value: 18500,
    stage: "Lead",
    responsible: "Juliana",
    lastContact: "Hoje, 08:20",
  },
  {
    id: 2,
    patientName: "Carlos Pereira",
    treatment: "Prótese protocolo",
    value: 32000,
    stage: "Contato",
    responsible: "Roberta",
    lastContact: "Hoje, 09:10",
  },
  {
    id: 3,
    patientName: "Fernanda Lima",
    treatment: "Ortodontia",
    value: 7800,
    stage: "Agendado",
    responsible: "Juliana",
    lastContact: "Ontem, 16:40",
  },
  {
    id: 4,
    patientName: "Paulo Martins",
    treatment: "Harmonização Orofacial",
    value: 4600,
    stage: "Consulta",
    responsible: "Roberta",
    lastContact: "Hoje, 10:15",
  },
  {
    id: 5,
    patientName: "Ana Souza",
    treatment: "Facetas em cerâmica",
    value: 24000,
    stage: "Planejamento",
    responsible: "Juliana",
    lastContact: "Ontem, 15:30",
  },
  {
    id: 6,
    patientName: "João Ribeiro",
    treatment: "Implantes unitários",
    value: 12800,
    stage: "Orçamento",
    responsible: "Roberta",
    lastContact: "Hoje, 11:00",
  },
  {
    id: 7,
    patientName: "Luciana Costa",
    treatment: "Protocolo magnético",
    value: 28500,
    stage: "Negociação",
    responsible: "Juliana",
    lastContact: "Hoje, 11:35",
  },
  {
    id: 8,
    patientName: "Ricardo Alves",
    treatment: "Reabilitação oral",
    value: 42000,
    stage: "Aprovado",
    responsible: "Roberta",
    lastContact: "Ontem, 18:10",
  },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function CRM() {
  const totalPipeline = opportunities.reduce(
    (total, opportunity) => total + opportunity.value,
    0,
  );

  const approvedValue = opportunities
    .filter((opportunity) => opportunity.stage === "Aprovado")
    .reduce(
      (total, opportunity) => total + opportunity.value,
      0,
    );

  return (
    <Box>
      <PageHeader
        title="CRM e Funil Comercial"
        description="Acompanhe leads, propostas, negociações e tratamentos aprovados."
        actionLabel="Nova oportunidade"
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
          title="Oportunidades abertas"
          value={String(opportunities.length)}
        />

        <SummaryCard
          title="Valor do funil"
          value={formatCurrency(totalPipeline)}
        />

        <SummaryCard
          title="Valor aprovado"
          value={formatCurrency(approvedValue)}
        />
      </Box>

      <Box
        sx={{
          display: "flex",
          gap: 2,
          overflowX: "auto",
          pb: 2,
        }}
      >
        {visibleStages.map((stage) => {
          const stageOpportunities = opportunities.filter(
            (opportunity) => opportunity.stage === stage,
          );

          const stageValue = stageOpportunities.reduce(
            (total, opportunity) =>
              total + opportunity.value,
            0,
          );

          return (
            <Paper
              key={stage}
              elevation={0}
              sx={{
                width: 300,
                minWidth: 300,
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
                <Typography
                  sx={{
                    fontWeight: 800,
                  }}
                >
                  {stage}
                </Typography>

                <Chip
                  size="small"
                  label={stageOpportunities.length}
                  color="primary"
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

              {stageOpportunities.length === 0 ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 3,
                    borderRadius: 2,
                    textAlign: "center",
                    borderStyle: "dashed",
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    Nenhuma oportunidade
                  </Typography>
                </Paper>
              ) : (
                stageOpportunities.map((opportunity) => (
                  <Paper
                    key={opportunity.id}
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
                          width: 40,
                          height: 40,
                          bgcolor: "primary.main",
                        }}
                      >
                        {opportunity.patientName
                          .charAt(0)
                          .toUpperCase()}
                      </Avatar>

                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontWeight: 700,
                          }}
                        >
                          {opportunity.patientName}
                        </Typography>

                        <Typography
                          variant="body2"
                          color="text.secondary"
                        >
                          {opportunity.treatment}
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
                          fontWeight: 700,
                        }}
                      >
                        {formatCurrency(opportunity.value)}
                      </Typography>
                    </Box>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                    >
                      Responsável: {opportunity.responsible}
                    </Typography>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                    >
                      Último contato: {opportunity.lastContact}
                    </Typography>

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
                  </Paper>
                ))
              )}
            </Paper>
          );
        })}
      </Box>
    </Box>
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
          fontWeight: 800,
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}