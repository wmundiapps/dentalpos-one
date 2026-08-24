import {
  Box,
  Button,
  Chip,
  Paper,
  Typography,
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import CampaignIcon from "@mui/icons-material/Campaign";
import ChatIcon from "@mui/icons-material/Chat";
import EmailIcon from "@mui/icons-material/Email";
import ScheduleSendIcon from "@mui/icons-material/ScheduleSend";
import SendIcon from "@mui/icons-material/Send";
import SmsIcon from "@mui/icons-material/Sms";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";
import {
  communicationMessages,
  countMessagesByChannel,
} from "../services/CommunicationService";
import type {
  CommunicationChannel,
  CommunicationStatus,
} from "../types/communication";

function getStatusColor(status: CommunicationStatus) {
  switch (status) {
    case "Entregue":
    case "Lida":
      return "success" as const;

    case "Agendada":
      return "warning" as const;

    case "Enviada":
      return "info" as const;

    case "Falhou":
      return "error" as const;

    default:
      return "default" as const;
  }
}

function getChannelIcon(
  channel: CommunicationChannel,
): ReactNode {
  switch (channel) {
    case "E-mail":
      return <EmailIcon />;

    case "SMS":
      return <SmsIcon />;

    default:
      return <ChatIcon />;
  }
}

export default function Communications() {
  const scheduledMessages = communicationMessages.filter(
    (message) => message.status === "Agendada",
  ).length;

  const deliveredMessages = communicationMessages.filter(
    (message) =>
      message.status === "Entregue" ||
      message.status === "Lida",
  ).length;

  const campaigns = communicationMessages.filter(
    (message) => Boolean(message.campaignName),
  ).length;

  return (
    <Box>
      <PageHeader
        title="Central de Comunicação"
        description="WhatsApp, SMS, e-mail, Telegram e relacionamento multicanal."
        actionLabel="Nova mensagem"
        actionIcon={<AddIcon />}
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
        <CommunicationSummary
          title="Mensagens cadastradas"
          value={String(communicationMessages.length)}
          icon={<ChatIcon />}
        />

        <CommunicationSummary
          title="Mensagens agendadas"
          value={String(scheduledMessages)}
          icon={<ScheduleSendIcon />}
        />

        <CommunicationSummary
          title="Entregues ou lidas"
          value={String(deliveredMessages)}
          icon={<SendIcon />}
        />

        <CommunicationSummary
          title="Campanhas"
          value={String(campaigns)}
          icon={<CampaignIcon />}
        />
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 4,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontWeight: 800,
            mb: 3,
          }}
        >
          Canais conectados
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "repeat(2, 1fr)",
              md: "repeat(3, 1fr)",
              xl: "repeat(6, 1fr)",
            },
            gap: 2,
          }}
        >
          {(
            [
              "WhatsApp",
              "SMS",
              "E-mail",
              "Telegram",
              "Instagram",
              "Facebook",
            ] as CommunicationChannel[]
          ).map((channel) => (
            <Paper
              key={channel}
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                textAlign: "center",
              }}
            >
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  mx: "auto",
                  mb: 1,
                  borderRadius: 2,
                  bgcolor: "primary.main",
                  color: "#FFFFFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {getChannelIcon(channel)}
              </Box>

              <Typography sx={{ fontWeight: 800 }}>
                {channel}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                {countMessagesByChannel(channel)} registro(s)
              </Typography>
            </Paper>
          ))}
        </Box>
      </Paper>

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
              xs: "1fr 120px",
              xl: "1.3fr 130px 1.2fr 1fr 130px 150px",
            },
            gap: 2,
            px: 3,
            py: 2,
            bgcolor: "primary.main",
            color: "#FFFFFF",
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>
            Destinatário
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
            Assunto
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
            Canal
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
            Campanha
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
            Envio
          </Typography>
        </Box>

        {communicationMessages.map((message) => (
          <Box
            key={message.id}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr 120px",
                xl: "1.3fr 130px 1.2fr 1fr 130px 150px",
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
                {message.recipientName}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                {message.recipientContact}
              </Typography>
            </Box>

            <Chip
              size="small"
              label={message.status}
              color={getStatusColor(message.status)}
            />

            <Box
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              <Typography sx={{ fontWeight: 700 }}>
                {message.subject}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {message.message}
              </Typography>
            </Box>

            <Box
              sx={{
                display: {
                  xs: "none",
                  xl: "flex",
                },
                alignItems: "center",
                gap: 1,
              }}
            >
              {getChannelIcon(message.channel)}

              <Typography>{message.channel}</Typography>
            </Box>

            <Typography
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              {message.campaignName ?? "Individual"}
            </Typography>

            <Typography
              variant="body2"
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              {message.sentAt ??
                message.scheduledAt ??
                "Não programado"}
            </Typography>
          </Box>
        ))}
      </Paper>

      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 2,
          mt: 3,
          flexWrap: "wrap",
        }}
      >
        <Button
          variant="outlined"
          startIcon={<CampaignIcon />}
        >
          Criar campanha
        </Button>

        <Button
          variant="contained"
          startIcon={<ScheduleSendIcon />}
        >
          Programar disparo
        </Button>
      </Box>
    </Box>
  );
}

interface CommunicationSummaryProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function CommunicationSummary({
  title,
  value,
  icon,
}: CommunicationSummaryProps) {
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