import {
  Box,
  Button,
  Chip,
  Paper,
  TextField,
  Typography,
} from "@mui/material";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import PaymentsIcon from "@mui/icons-material/Payments";
import PsychologyIcon from "@mui/icons-material/Psychology";
import SendIcon from "@mui/icons-material/Send";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";
import {
  executiveAlerts,
  executiveSummary,
} from "../services/ExecutiveAssistantService";
import type {
  ExecutiveAlertPriority,
} from "../types/executiveAssistant";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getPriorityColor(
  priority: ExecutiveAlertPriority,
) {
  switch (priority) {
    case "Crítica":
      return "error" as const;

    case "Alta":
      return "warning" as const;

    case "Média":
      return "info" as const;

    default:
      return "success" as const;
  }
}

export default function ExecutiveAssistant() {
  return (
    <Box>
      <PageHeader
        title="CEO IA"
        description="Assistente executivo para análise, decisões e acompanhamento da operação."
      />

      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 4,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "primary.main",
          color: "#FFFFFF",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 2,
          }}
        >
          <PsychologyIcon
            sx={{
              fontSize: 46,
            }}
          />

          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 900,
              }}
            >
              {executiveSummary.greeting}
            </Typography>

            <Typography
              sx={{
                mt: 1,
                opacity: 0.9,
              }}
            >
              {executiveSummary.clinicStatus}
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, 1fr)",
            xl: "repeat(3, 1fr)",
          },
          gap: 3,
          mb: 4,
        }}
      >
        <ExecutiveCard
          title="Pacientes confirmados"
          value={String(
            executiveSummary.confirmedPatients,
          )}
          icon={<AutoAwesomeIcon />}
        />

        <ExecutiveCard
          title="Orçamentos pendentes"
          value={String(
            executiveSummary.pendingBudgets,
          )}
          description={formatCurrency(
            executiveSummary.pendingBudgetValue,
          )}
          icon={<PaymentsIcon />}
        />

        <ExecutiveCard
          title="Estoque crítico"
          value={String(
            executiveSummary.criticalStockItems,
          )}
          icon={<Inventory2Icon />}
        />

        <ExecutiveCard
          title="Laboratório atrasado"
          value={String(
            executiveSummary.overdueLaboratoryWorks,
          )}
          icon={<LocalShippingIcon />}
        />

        <ExecutiveCard
          title="Recebimentos vencidos"
          value={formatCurrency(
            executiveSummary.overdueReceivables,
          )}
          icon={<WarningAmberIcon />}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            xl: "1.4fr 1fr",
          },
          gap: 3,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="h6"
            sx={{
              fontWeight: 900,
              mb: 3,
            }}
          >
            Prioridades executivas
          </Typography>

          {executiveAlerts.map((alert) => (
            <Paper
              key={alert.id}
              variant="outlined"
              sx={{
                p: 2.5,
                mb: 2,
                borderRadius: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                  mb: 1.5,
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 900,
                    }}
                  >
                    {alert.title}
                  </Typography>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                  >
                    Módulo: {alert.module}
                  </Typography>
                </Box>

                <Chip
                  size="small"
                  label={alert.priority}
                  color={getPriorityColor(
                    alert.priority,
                  )}
                />
              </Box>

              <Typography color="text.secondary">
                {alert.description}
              </Typography>

              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  borderRadius: 2,
                  bgcolor: "background.default",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 900,
                  }}
                >
                  Recomendação
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  {alert.recommendation}
                </Typography>
              </Box>
            </Paper>
          ))}
        </Paper>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 3,
            }}
          >
            <PsychologyIcon color="primary" />

            <Typography
              variant="h6"
              sx={{
                fontWeight: 900,
              }}
            >
              Converse com o CEO IA
            </Typography>
          </Box>

          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 3,
              borderRadius: 2,
              bgcolor: "background.default",
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
            >
              Pergunte sobre faturamento, agenda,
              estoque, laboratório, campanhas,
              pacientes ou crescimento da clínica.
            </Typography>
          </Paper>

          <TextField
            fullWidth
            multiline
            minRows={5}
            label="Digite sua pergunta"
            placeholder="Exemplo: quais são os principais riscos financeiros desta semana?"
          />

          <Button
            fullWidth
            variant="contained"
            startIcon={<SendIcon />}
            sx={{
              mt: 2,
            }}
          >
            Perguntar ao CEO IA
          </Button>
        </Paper>
      </Box>
    </Box>
  );
}

interface ExecutiveCardProps {
  title: string;
  value: string;
  description?: string;
  icon: ReactNode;
}

function ExecutiveCard({
  title,
  value,
  description,
  icon,
}: ExecutiveCardProps) {
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
      <Box
        sx={{
          width: 46,
          height: 46,
          borderRadius: 2,
          bgcolor: "primary.main",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 2,
        }}
      >
        {icon}
      </Box>

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

      {description && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 0.5,
          }}
        >
          {description}
        </Typography>
      )}
    </Paper>
  );
}