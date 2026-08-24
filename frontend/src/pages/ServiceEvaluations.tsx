import {
  Box,
  Button,
  Chip,
  LinearProgress,
  MenuItem,
  Paper,
  Rating,
  TextField,
  Typography,
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import AssessmentIcon from "@mui/icons-material/Assessment";
import EmailIcon from "@mui/icons-material/Email";
import GroupsIcon from "@mui/icons-material/Groups";
import QrCodeIcon from "@mui/icons-material/QrCode";
import SendIcon from "@mui/icons-material/Send";
import SmsIcon from "@mui/icons-material/Sms";
import TabletMacIcon from "@mui/icons-material/TabletMac";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";

import {
  calculateClinicAverage,
  calculateNps,
  calculateProcedureAverage,
  calculateProfessionalAverage,
  calculateServiceAverage,
  countPendingEvaluations,
  serviceEvaluations,
} from "../services/ServiceEvaluationService";

import type {
  EvaluationChannel,
  EvaluationStatus,
} from "../types/serviceEvaluation";

function getStatusColor(status: EvaluationStatus) {
  switch (status) {
    case "Respondida":
      return "success" as const;

    case "Enviada":
      return "info" as const;

    case "Pendente":
      return "warning" as const;

    case "Expirada":
      return "error" as const;

    default:
      return "default" as const;
  }
}

function getChannelIcon(
  channel: EvaluationChannel,
): ReactNode {
  switch (channel) {
    case "WhatsApp":
      return <WhatsAppIcon />;

    case "SMS":
      return <SmsIcon />;

    case "E-mail":
      return <EmailIcon />;

    case "QR Code":
      return <QrCodeIcon />;

    case "Terminal da clínica":
      return <TabletMacIcon />;

    default:
      return <SendIcon />;
  }
}

export default function ServiceEvaluations() {
  const professionalAverage =
    calculateProfessionalAverage();

  const clinicAverage =
    calculateClinicAverage();

  const procedureAverage =
    calculateProcedureAverage();

  const serviceAverage =
    calculateServiceAverage();

  const nps = calculateNps();

  const pendingEvaluations =
    countPendingEvaluations();

  const answeredEvaluations =
    serviceEvaluations.filter(
      (evaluation) =>
        evaluation.status === "Respondida",
    ).length;

  return (
    <Box>
      <PageHeader
        title="Avaliação do Atendimento"
        description="Acompanhe a experiência do paciente, satisfação, qualidade dos serviços e NPS."
        actionLabel="Nova pesquisa"
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
        <EvaluationSummary
          title="Avaliações respondidas"
          value={String(answeredEvaluations)}
          icon={<AssessmentIcon />}
        />

        <EvaluationSummary
          title="Pesquisas pendentes"
          value={String(pendingEvaluations)}
          icon={<SendIcon />}
        />

        <EvaluationSummary
          title="Nota geral"
          value={serviceAverage.toFixed(1)}
          icon={<GroupsIcon />}
        />

        <EvaluationSummary
          title="NPS"
          value={String(nps)}
          icon={<AssessmentIcon />}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            xl: "1.2fr 1fr",
          },
          gap: 3,
          mb: 4,
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
            Indicadores de satisfação
          </Typography>

          <ScoreIndicator
            title="Avaliação do profissional"
            value={professionalAverage}
          />

          <ScoreIndicator
            title="Apresentação do consultório"
            value={clinicAverage}
          />

          <ScoreIndicator
            title="Procedimento realizado"
            value={procedureAverage}
          />

          <ScoreIndicator
            title="Qualidade geral dos serviços"
            value={serviceAverage}
          />

          <Box
            sx={{
              mt: 3,
              p: 2.5,
              borderRadius: 2,
              bgcolor: "background.default",
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
            >
              Net Promoter Score
            </Typography>

            <Typography
              variant="h3"
              sx={{
                fontWeight: 900,
                color:
                  nps >= 75
                    ? "success.main"
                    : nps >= 50
                      ? "warning.main"
                      : "error.main",
              }}
            >
              {nps}
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
            >
              Escala de -100 a 100.
            </Typography>
          </Box>
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
          <Typography
            variant="h6"
            sx={{
              fontWeight: 900,
              mb: 3,
            }}
          >
            Programar pesquisa
          </Typography>

          <TextField
            fullWidth
            label="Paciente"
            placeholder="Selecione ou pesquise o paciente"
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="Atendimento"
            placeholder="Selecione o atendimento realizado"
            sx={{ mb: 2 }}
          />

          <TextField
            select
            fullWidth
            label="Canal de envio"
            defaultValue="WhatsApp"
            sx={{ mb: 2 }}
          >
            <MenuItem value="WhatsApp">
              WhatsApp
            </MenuItem>

            <MenuItem value="SMS">
              SMS
            </MenuItem>

            <MenuItem value="E-mail">
              E-mail
            </MenuItem>

            <MenuItem value="Link">
              Link
            </MenuItem>

            <MenuItem value="QR Code">
              QR Code
            </MenuItem>

            <MenuItem value="Terminal da clínica">
              Terminal da clínica
            </MenuItem>
          </TextField>

          <TextField
            fullWidth
            label="Mensagem"
            multiline
            minRows={4}
            defaultValue="Olá! Gostaríamos de saber como foi sua experiência conosco. Sua avaliação nos ajuda a melhorar continuamente."
            sx={{ mb: 2 }}
          />

          <Button
            fullWidth
            variant="contained"
            startIcon={<SendIcon />}
          >
            Enviar pesquisa
          </Button>
        </Paper>
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
        <Box
          sx={{
            display: "flex",
            flexDirection: {
              xs: "column",
              md: "row",
            },
            alignItems: {
              xs: "stretch",
              md: "center",
            },
            justifyContent: "space-between",
            gap: 3,
          }}
        >
          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 900,
              }}
            >
              Terminal de avaliação na clínica
            </Typography>

            <Typography
              color="text.secondary"
              sx={{
                mt: 1,
                maxWidth: 760,
              }}
            >
              Instale um tablet ou terminal na
              recepção para o paciente avaliar o
              atendimento imediatamente após a
              consulta.
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Button
              variant="outlined"
              startIcon={<QrCodeIcon />}
            >
              Gerar QR Code
            </Button>

            <Button
              variant="contained"
              startIcon={<TabletMacIcon />}
            >
              Abrir modo terminal
            </Button>
          </Box>
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
              xl: "1.2fr 1fr 130px 130px 140px 150px",
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
            Nota geral
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
            NPS
          </Typography>
        </Box>

        {serviceEvaluations.map((evaluation) => (
          <Box
            key={evaluation.id}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr 120px",
                xl: "1.2fr 1fr 130px 130px 140px 150px",
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
              <Typography sx={{ fontWeight: 900 }}>
                {evaluation.patientName}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                {evaluation.procedure}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                {evaluation.appointmentDate}
              </Typography>
            </Box>

            <Chip
              size="small"
              label={evaluation.status}
              color={getStatusColor(
                evaluation.status,
              )}
            />

            <Typography
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              {evaluation.professionalName}
            </Typography>

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
              {getChannelIcon(evaluation.channel)}

              <Typography variant="body2">
                {evaluation.channel}
              </Typography>
            </Box>

            <Box
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              {typeof evaluation.serviceScore ===
              "number" ? (
                <Rating
                  value={
                    evaluation.serviceScore / 2
                  }
                  precision={0.5}
                  readOnly
                  size="small"
                />
              ) : (
                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  Aguardando
                </Typography>
              )}
            </Box>

            <Typography
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
                fontWeight: 900,
              }}
            >
              {evaluation.npsScore ?? "—"}
            </Typography>
          </Box>
        ))}
      </Paper>
    </Box>
  );
}

interface EvaluationSummaryProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function EvaluationSummary({
  title,
  value,
  icon,
}: EvaluationSummaryProps) {
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

interface ScoreIndicatorProps {
  title: string;
  value: number;
}

function ScoreIndicator({
  title,
  value,
}: ScoreIndicatorProps) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          gap: 2,
          mb: 1,
        }}
      >
        <Typography sx={{ fontWeight: 800 }}>
          {title}
        </Typography>

        <Typography sx={{ fontWeight: 900 }}>
          {value.toFixed(1)} / 10
        </Typography>
      </Box>

      <LinearProgress
        variant="determinate"
        value={value * 10}
        sx={{
          height: 10,
          borderRadius: 10,
        }}
      />
    </Box>
  );
}