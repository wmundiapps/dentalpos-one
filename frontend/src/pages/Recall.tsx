import {
  Box,
  Button,
  Chip,
  Paper,
  Typography,
} from "@mui/material";

import AddAlertIcon from "@mui/icons-material/AddAlert";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CampaignIcon from "@mui/icons-material/Campaign";
import PhoneIcon from "@mui/icons-material/Phone";
import ScheduleSendIcon from "@mui/icons-material/ScheduleSend";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";
import {
  countAutomaticRecalls,
  countPendingRecalls,
  countScheduledRecalls,
  patientRecalls,
} from "../services/RecallService";
import type { RecallStatus } from "../types/recall";

function getStatusColor(status: RecallStatus) {
  switch (status) {
    case "Agendado":
      return "success" as const;

    case "Mensagem enviada":
      return "info" as const;

    case "Contato pendente":
    case "Programado":
      return "warning" as const;

    case "Sem resposta":
    case "Recusado":
      return "error" as const;

    default:
      return "default" as const;
  }
}

export default function Recall() {
  const pendingRecalls = countPendingRecalls();
  const scheduledRecalls = countScheduledRecalls();
  const automaticRecalls = countAutomaticRecalls();

  return (
    <Box>
      <PageHeader
        title="Recall e Reativação"
        description="Acompanhamento de pacientes após 1, 2, 3, 4, 5, 6 meses e 1 ano."
        actionLabel="Novo recall"
        actionIcon={<AddAlertIcon />}
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, 1fr)",
            xl: "repeat(4, 1fr)",
          },
          gap: 3,
          mb: 4,
        }}
      >
        <RecallSummary
          title="Pacientes em acompanhamento"
          value={String(patientRecalls.length)}
          icon={<CampaignIcon />}
        />

        <RecallSummary
          title="Contatos pendentes"
          value={String(pendingRecalls)}
          icon={<ScheduleSendIcon />}
        />

        <RecallSummary
          title="Retornos agendados"
          value={String(scheduledRecalls)}
          icon={<CalendarMonthIcon />}
        />

        <RecallSummary
          title="Mensagens automáticas"
          value={String(automaticRecalls)}
          icon={<WhatsAppIcon />}
        />
      </Box>

      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr 130px",
              xl: "1.3fr 1fr 1fr 130px 130px 160px 200px",
            },
            gap: 2,
            px: 3,
            py: 2,
            bgcolor: "primary.main",
            color: "#FFFFFF",
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>
            Paciente
          </Typography>

          <Typography sx={{ fontWeight: 700 }}>
            Status
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Tratamento
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Período
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Próximo contato
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Profissional
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Ações
          </Typography>
        </Box>

        {patientRecalls.map((recall) => (
          <Box
            key={recall.id}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr 130px",
                xl: "1.3fr 1fr 1fr 130px 130px 160px 200px",
              },
              gap: 2,
              alignItems: "center",
              px: 3,
              py: 2,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 800 }}>
                {recall.patientName}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                {recall.phone}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Código: {recall.patientCode}
              </Typography>
            </Box>

            <Chip
              size="small"
              label={recall.status}
              color={getStatusColor(recall.status)}
            />

            <Typography
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              {recall.treatment}
            </Typography>

            <Typography
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
                fontWeight: 700,
              }}
            >
              {recall.period}
            </Typography>

            <Typography
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              {recall.nextContactDate}
            </Typography>

            <Typography
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              {recall.professionalName}
            </Typography>

            <Box
              sx={{
                display: {
                  xs: "none",
                  xl: "flex",
                },
                gap: 1,
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
          </Box>
        ))}
      </Paper>
    </Box>
  );
}

interface RecallSummaryProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function RecallSummary({
  title,
  value,
  icon,
}: RecallSummaryProps) {
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
    </Paper>
  );
}