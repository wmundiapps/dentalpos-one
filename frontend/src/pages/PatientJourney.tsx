import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";

import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import ScheduleIcon from "@mui/icons-material/Schedule";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";

import {
  calculateJourneyApprovedValue,
  calculateJourneyPipelineValue,
  countJourneyRisks,
  countJourneyWarnings,
  journeyBottlenecks,
  journeyConversions,
  patientJourneys,
} from "../services/PatientJourneyService";

import type {
  JourneyRiskLevel,
  JourneyStageStatus,
} from "../types/patientJourney";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getRiskColor(risk: JourneyRiskLevel) {
  switch (risk) {
    case "Normal":
      return "success" as const;

    case "Atenção":
      return "warning" as const;

    case "Risco de perda":
      return "error" as const;

    default:
      return "default" as const;
  }
}

function getStageColor(status: JourneyStageStatus) {
  switch (status) {
    case "Concluída":
      return "success" as const;

    case "Em andamento":
      return "primary" as const;

    case "Atrasada":
      return "error" as const;

    case "Pendente":
      return "warning" as const;

    default:
      return "default" as const;
  }
}

export default function PatientJourney() {
  const selectedJourney = patientJourneys[0];

  const pipelineValue =
    calculateJourneyPipelineValue();

  const approvedValue =
    calculateJourneyApprovedValue();

  const warningPatients =
    countJourneyWarnings();

  const riskPatients = countJourneyRisks();

  if (!selectedJourney) {
    return (
      <Box>
        <Typography>
          Nenhuma jornada cadastrada.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Jornada Inteligente do Paciente"
        description="Acompanhe cada etapa, identifique gargalos e receba recomendações automáticas."
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
        <JourneySummary
          title="Pacientes acompanhados"
          value={String(patientJourneys.length)}
          icon={<PeopleAltIcon />}
        />

        <JourneySummary
          title="Valor na jornada"
          value={formatCurrency(pipelineValue)}
          icon={<MonetizationOnIcon />}
        />

        <JourneySummary
          title="Valor aprovado"
          value={formatCurrency(approvedValue)}
          icon={<CheckCircleIcon />}
        />

        <JourneySummary
          title="Pacientes em atenção"
          value={String(
            warningPatients + riskPatients,
          )}
          icon={<WarningAmberIcon />}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            xl: "1.25fr 1fr",
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
            Pacientes na jornada
          </Typography>

          {patientJourneys.map((journey) => {
            const approvalPercent =
              journey.estimatedValue > 0
                ? (journey.approvedValue /
                    journey.estimatedValue) *
                  100
                : 0;

            return (
              <Paper
                key={journey.id}
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
                    flexWrap: "wrap",
                  }}
                >
                  <Box>
                    <Typography
                      sx={{
                        fontWeight: 900,
                      }}
                    >
                      {journey.patientName}
                    </Typography>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                    >
                      {journey.treatment}
                    </Typography>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                    >
                      {journey.professionalName} • Origem:{" "}
                      {journey.origin}
                    </Typography>
                  </Box>

                  <Chip
                    size="small"
                    label={journey.riskLevel}
                    color={getRiskColor(
                      journey.riskLevel,
                    )}
                  />
                </Box>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(3, 1fr)",
                    },
                    gap: 2,
                    mt: 2,
                  }}
                >
                  <JourneyDetail
                    title="Etapa atual"
                    value={journey.currentStage}
                  />

                  <JourneyDetail
                    title="Valor estimado"
                    value={formatCurrency(
                      journey.estimatedValue,
                    )}
                  />

                  <JourneyDetail
                    title="Valor aprovado"
                    value={formatCurrency(
                      journey.approvedValue,
                    )}
                  />
                </Box>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 2,
                    mb: 1,
                  }}
                >
                  Aprovação financeira:{" "}
                  {approvalPercent.toFixed(0)}%
                </Typography>

                <LinearProgress
                  variant="determinate"
                  value={Math.min(
                    approvalPercent,
                    100,
                  )}
                  sx={{
                    height: 9,
                    borderRadius: 10,
                  }}
                />

                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    mt: 2,
                    borderRadius: 2,
                    bgcolor: "background.default",
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
                          fontWeight: 900,
                        }}
                      >
                        Próxima ação recomendada
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        {
                          journey.nextRecommendedAction
                        }
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Paper>
            );
          })}
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
              mb: 1,
            }}
          >
            Conversão por etapa
          </Typography>

          <Typography
            color="text.secondary"
            sx={{
              mb: 3,
            }}
          >
            Percentual de pacientes que avançaram em
            cada fase.
          </Typography>

          {journeyConversions.map((conversion) => (
            <Box
              key={conversion.stage}
              sx={{
                mb: 2.5,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  mb: 1,
                }}
              >
                <Typography sx={{ fontWeight: 800 }}>
                  {conversion.stage}
                </Typography>

                <Typography sx={{ fontWeight: 900 }}>
                  {conversion.patients} •{" "}
                  {conversion.conversionRate}%
                </Typography>
              </Box>

              <LinearProgress
                variant="determinate"
                value={conversion.conversionRate}
                sx={{
                  height: 10,
                  borderRadius: 10,
                }}
              />
            </Box>
          ))}
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
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 2,
            flexWrap: "wrap",
            mb: 3,
          }}
        >
          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 900,
              }}
            >
              Jornada de {selectedJourney.patientName}
            </Typography>

            <Typography color="text.secondary">
              {selectedJourney.treatment} • Última
              interação: {selectedJourney.lastInteraction}
            </Typography>
          </Box>

          <Chip
            label={selectedJourney.riskLevel}
            color={getRiskColor(
              selectedJourney.riskLevel,
            )}
          />
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              lg: "repeat(2, 1fr)",
            },
            gap: 2,
          }}
        >
          {selectedJourney.stages
            .sort((first, second) => first.order - second.order)
            .map((stage) => (
              <Paper
                key={stage.id}
                variant="outlined"
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  borderLeft: "6px solid",
                  borderLeftColor:
                    stage.status === "Concluída"
                      ? "success.main"
                      : stage.status === "Atrasada"
                        ? "error.main"
                        : stage.status ===
                            "Em andamento"
                          ? "primary.main"
                          : "warning.main",
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
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                    }}
                  >
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        bgcolor: "primary.main",
                        color: "#FFFFFF",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        flexShrink: 0,
                      }}
                    >
                      {stage.order}
                    </Box>

                    <Box>
                      <Typography
                        sx={{
                          fontWeight: 900,
                        }}
                      >
                        {stage.title}
                      </Typography>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                      >
                        Módulo: {stage.module}
                      </Typography>
                    </Box>
                  </Box>

                  <Chip
                    size="small"
                    label={stage.status}
                    color={getStageColor(stage.status)}
                  />
                </Box>

                <Typography color="text.secondary">
                  {stage.description}
                </Typography>

                <Box
                  sx={{
                    display: "flex",
                    gap: 2,
                    flexWrap: "wrap",
                    mt: 2,
                  }}
                >
                  {stage.date && (
                    <Chip
                      size="small"
                      icon={<ScheduleIcon />}
                      label={stage.date}
                      variant="outlined"
                    />
                  )}

                  {stage.responsible && (
                    <Chip
                      size="small"
                      label={stage.responsible}
                      variant="outlined"
                    />
                  )}

                  {stage.daysInStage > 0 && (
                    <Chip
                      size="small"
                      label={`${stage.daysInStage} dia(s) na etapa`}
                      color={
                        stage.status === "Atrasada"
                          ? "error"
                          : "default"
                      }
                    />
                  )}
                </Box>
              </Paper>
            ))}
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
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            mb: 3,
          }}
        >
          <AccountTreeIcon color="primary" />

          <Typography
            variant="h6"
            sx={{
              fontWeight: 900,
            }}
          >
            Mapa de gargalos
          </Typography>
        </Box>

        {journeyBottlenecks.map((bottleneck) => (
          <Box
            key={bottleneck.module}
            sx={{
              mb: 3,
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                gap: 2,
                mb: 1,
              }}
            >
              <Typography sx={{ fontWeight: 900 }}>
                {bottleneck.module}
              </Typography>

              <Typography
                sx={{
                  fontWeight: 900,
                  color:
                    bottleneck.severity >= 75
                      ? "error.main"
                      : bottleneck.severity >= 50
                        ? "warning.main"
                        : "success.main",
                }}
              >
                {bottleneck.severity}%
              </Typography>
            </Box>

            <LinearProgress
              variant="determinate"
              value={bottleneck.severity}
              color={
                bottleneck.severity >= 75
                  ? "error"
                  : bottleneck.severity >= 50
                    ? "warning"
                    : "success"
              }
              sx={{
                height: 11,
                borderRadius: 10,
              }}
            />

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 1,
              }}
            >
              {bottleneck.description}
            </Typography>
          </Box>
        ))}

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mt: 2,
          }}
        >
          <Button
            variant="contained"
            startIcon={<AutoAwesomeIcon />}
          >
            Gerar plano de ação com IA
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

interface JourneySummaryProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function JourneySummary({
  title,
  value,
  icon,
}: JourneySummaryProps) {
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

interface JourneyDetailProps {
  title: string;
  value: string;
}

function JourneyDetail({
  title,
  value,
}: JourneyDetailProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 2,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
      >
        {title}
      </Typography>

      <Typography sx={{ fontWeight: 900 }}>
        {value}
      </Typography>
    </Paper>
  );
}