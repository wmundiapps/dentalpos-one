import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import InsightsIcon from "@mui/icons-material/Insights";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";

import {
  clinicHealthHistory,
  clinicHealthIndicators,
  getClinicHealthSummary,
} from "../services/ClinicHealthService";

import type {
  ClinicHealthLevel,
} from "../types/clinicHealth";

function getLevelColor(level: ClinicHealthLevel) {
  switch (level) {
    case "Excelente":
      return "success" as const;

    case "Bom":
      return "primary" as const;

    case "Atenção":
      return "warning" as const;

    case "Crítico":
      return "error" as const;

    default:
      return "default" as const;
  }
}

function getIndicatorColor(score: number) {
  if (score >= 85) {
    return "success" as const;
  }

  if (score >= 70) {
    return "primary" as const;
  }

  if (score >= 60) {
    return "warning" as const;
  }

  return "error" as const;
}

export default function ClinicHealth() {
  const summary = getClinicHealthSummary();

  const strongestIndicators = clinicHealthIndicators
    .filter((indicator) => indicator.score >= 85)
    .length;

  const attentionIndicators = clinicHealthIndicators
    .filter((indicator) => indicator.score < 70)
    .length;

  return (
    <Box>
      <PageHeader
        title="Índice de Saúde da Clínica"
        description="Nota diária da operação, baseada em indicadores clínicos, comerciais, financeiros e administrativos."
      />

      <Paper
        elevation={0}
        sx={{
          p: 4,
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
            flexDirection: {
              xs: "column",
              lg: "row",
            },
            alignItems: {
              xs: "flex-start",
              lg: "center",
            },
            justifyContent: "space-between",
            gap: 4,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <HealthAndSafetyIcon
              sx={{
                fontSize: 64,
              }}
            />

            <Box>
              <Typography
                variant="body1"
                sx={{
                  opacity: 0.9,
                }}
              >
                Índice atual
              </Typography>

              <Typography
                variant="h2"
                sx={{
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                {summary.score}
                <Typography
                  component="span"
                  variant="h5"
                  sx={{
                    ml: 1,
                    opacity: 0.85,
                  }}
                >
                  / 1000
                </Typography>
              </Typography>
            </Box>
          </Box>

          <Box>
            <Chip
              label={summary.level}
              color={getLevelColor(summary.level)}
              sx={{
                mb: 1.5,
                fontWeight: 900,
                bgcolor: "#FFFFFF",
              }}
            />

            <Typography>
              Atualizado em {summary.calculatedAt}
            </Typography>

            <Typography
              sx={{
                mt: 0.5,
                fontWeight: 800,
              }}
            >
              {summary.variation >= 0 ? "+" : ""}
              {summary.variation} pontos desde ontem
            </Typography>
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={summary.score / 10}
          sx={{
            mt: 4,
            height: 14,
            borderRadius: 10,
            bgcolor: "rgba(255,255,255,0.25)",

            "& .MuiLinearProgress-bar": {
              bgcolor: "#FFFFFF",
            },
          }}
        />
      </Paper>

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
        <HealthSummary
          title="Indicadores avaliados"
          value={String(clinicHealthIndicators.length)}
          icon={<InsightsIcon />}
        />

        <HealthSummary
          title="Indicadores excelentes"
          value={String(strongestIndicators)}
          icon={<CheckCircleIcon />}
        />

        <HealthSummary
          title="Pontos de atenção"
          value={String(attentionIndicators)}
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
            Composição do índice
          </Typography>

          {clinicHealthIndicators.map((indicator) => (
            <Paper
              key={indicator.id}
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
                  gap: 2,
                  mb: 1,
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 900,
                    }}
                  >
                    {indicator.title}
                  </Typography>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                  >
                    {indicator.module} • Peso:{" "}
                    {indicator.weight}%
                  </Typography>
                </Box>

                <Chip
                  label={`${indicator.score}/100`}
                  color={getIndicatorColor(
                    indicator.score,
                  )}
                  sx={{
                    fontWeight: 900,
                  }}
                />
              </Box>

              <LinearProgress
                variant="determinate"
                value={indicator.score}
                color={getIndicatorColor(
                  indicator.score,
                )}
                sx={{
                  height: 10,
                  borderRadius: 10,
                  my: 2,
                }}
              />

              <Typography color="text.secondary">
                {indicator.description}
              </Typography>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1,
                  mt: 2,
                  p: 2,
                  borderRadius: 2,
                  bgcolor: "background.default",
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
                    Recomendação
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    {indicator.recommendation}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          ))}
        </Paper>

        <Box>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
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
              <TrendingUpIcon color="primary" />

              <Typography
                variant="h6"
                sx={{
                  fontWeight: 900,
                }}
              >
                Evolução do índice
              </Typography>
            </Box>

            {clinicHealthHistory.map((history) => (
              <Box
                key={history.date}
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
                    {history.date}
                  </Typography>

                  <Typography sx={{ fontWeight: 900 }}>
                    {history.score}
                  </Typography>
                </Box>

                <LinearProgress
                  variant="determinate"
                  value={history.score / 10}
                  sx={{
                    height: 9,
                    borderRadius: 10,
                  }}
                />
              </Box>
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
            <Typography
              variant="h6"
              sx={{
                fontWeight: 900,
                mb: 2,
              }}
            >
              Plano de evolução
            </Typography>

            <Typography color="text.secondary">
              A IA pode transformar os indicadores com
              menor desempenho em tarefas, responsáveis
              e prazos de melhoria.
            </Typography>

            <Button
              fullWidth
              variant="contained"
              startIcon={<AutoAwesomeIcon />}
              sx={{
                mt: 3,
              }}
            >
              Gerar plano de ação
            </Button>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}

interface HealthSummaryProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function HealthSummary({
  title,
  value,
  icon,
}: HealthSummaryProps) {
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
          mb: 2,
          borderRadius: 2,
          bgcolor: "primary.main",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </Box>

      <Typography color="text.secondary">
        {title}
      </Typography>

      <Typography
        variant="h4"
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