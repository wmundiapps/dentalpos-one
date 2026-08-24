import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BarChartIcon from "@mui/icons-material/BarChart";
import InsightsIcon from "@mui/icons-material/Insights";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";

import {
  benchmarkEvolution,
  benchmarkIndicators,
  benchmarkPosition,
  calculateBenchmarkDifference,
  calculateBenchmarkScore,
  countIndicatorsAboveAverage,
  countIndicatorsBelowAverage,
  getBenchmarkPerformance,
} from "../services/BenchmarkService";

import type {
  BenchmarkIndicator,
  BenchmarkPerformance,
} from "../types/benchmark";

function formatValue(
  value: number,
  unit: string,
): string {
  if (unit === " BRL") {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(value);
  }

  if (unit === " dias") {
    return `${value.toFixed(1)} dias`;
  }

  if (unit === "%") {
    return `${value.toFixed(0)}%`;
  }

  return `${value.toFixed(0)}${unit}`;
}

function getPerformanceColor(
  performance: BenchmarkPerformance,
) {
  switch (performance) {
    case "Muito acima da média":
      return "success" as const;

    case "Acima da média":
      return "primary" as const;

    case "Na média":
      return "info" as const;

    case "Abaixo da média":
      return "warning" as const;

    case "Muito abaixo da média":
      return "error" as const;

    default:
      return "default" as const;
  }
}

function isPositivePerformance(
  indicator: BenchmarkIndicator,
): boolean {
  if (indicator.higherIsBetter) {
    return (
      indicator.clinicValue >=
      indicator.marketAverage
    );
  }

  return (
    indicator.clinicValue <=
    indicator.marketAverage
  );
}

function getProgressValue(
  indicator: BenchmarkIndicator,
): number {
  const highestValue = Math.max(
    indicator.clinicValue,
    indicator.marketAverage,
    indicator.topPerformersAverage,
  );

  if (highestValue === 0) {
    return 0;
  }

  return Math.min(
    100,
    (indicator.clinicValue / highestValue) * 100,
  );
}

export default function Benchmark() {
  const benchmarkScore = calculateBenchmarkScore();

  const aboveAverage =
    countIndicatorsAboveAverage();

  const belowAverage =
    countIndicatorsBelowAverage();

  return (
    <Box>
      <PageHeader
        title="Benchmark Inteligente"
        description="Compare os indicadores da clínica com operações semelhantes, utilizando dados agregados e anonimizados."
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
            justifyContent: "space-between",
            alignItems: {
              xs: "flex-start",
              lg: "center",
            },
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
            <LeaderboardIcon
              sx={{
                fontSize: 64,
              }}
            />

            <Box>
              <Typography
                sx={{
                  opacity: 0.9,
                }}
              >
                Posição comparativa
              </Typography>

              <Typography
                variant="h2"
                sx={{
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                Top {100 - benchmarkPosition.percentile}%
              </Typography>

              <Typography
                sx={{
                  mt: 1,
                  opacity: 0.9,
                }}
              >
                Entre clínicas semelhantes da plataforma.
              </Typography>
            </Box>
          </Box>

          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 900,
              }}
            >
              Score comparativo: {benchmarkScore}/100
            </Typography>

            <Typography
              sx={{
                mt: 1,
                opacity: 0.9,
              }}
            >
              {benchmarkPosition.similarClinics} clínicas
              semelhantes analisadas.
            </Typography>

            <Typography
              sx={{
                opacity: 0.9,
              }}
            >
              Base total anonimizada:{" "}
              {benchmarkPosition.comparedClinics} clínicas.
            </Typography>
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={benchmarkScore}
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
        <BenchmarkSummary
          title="Acima da média"
          value={String(aboveAverage)}
          icon={<TrendingUpIcon />}
        />

        <BenchmarkSummary
          title="Abaixo da média"
          value={String(belowAverage)}
          icon={<TrendingDownIcon />}
        />

        <BenchmarkSummary
          title="Percentil da clínica"
          value={`${benchmarkPosition.percentile}º`}
          icon={<LeaderboardIcon />}
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
            fontWeight: 900,
            mb: 3,
          }}
        >
          Grupo comparativo utilizado
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(3, 1fr)",
            },
            gap: 2,
          }}
        >
          <ComparisonProfile
            title="Região"
            value={benchmarkPosition.region}
          />

          <ComparisonProfile
            title="Porte"
            value={benchmarkPosition.clinicSize}
          />

          <ComparisonProfile
            title="Perfil clínico"
            value={
              benchmarkPosition.specialtyProfile
            }
          />
        </Box>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 3,
          }}
        >
          Os comparativos utilizam somente dados
          consolidados e anonimizados. Nenhuma clínica,
          paciente ou profissional é identificado.
        </Typography>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            xl: "repeat(2, 1fr)",
          },
          gap: 3,
          mb: 4,
        }}
      >
        {benchmarkIndicators.map((indicator) => {
          const performance =
            getBenchmarkPerformance(indicator);

          const difference =
            calculateBenchmarkDifference(indicator);

          const positive =
            isPositivePerformance(indicator);

          return (
            <Paper
              key={indicator.id}
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
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                  mb: 2,
                }}
              >
                <Box>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 900,
                    }}
                  >
                    {indicator.title}
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    Módulo: {indicator.module}
                  </Typography>
                </Box>

                <Chip
                  size="small"
                  label={performance}
                  color={getPerformanceColor(
                    performance,
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
                  mb: 3,
                }}
              >
                <BenchmarkValue
                  title="Sua clínica"
                  value={formatValue(
                    indicator.clinicValue,
                    indicator.unit,
                  )}
                  highlight
                />

                <BenchmarkValue
                  title="Média do mercado"
                  value={formatValue(
                    indicator.marketAverage,
                    indicator.unit,
                  )}
                />

                <BenchmarkValue
                  title="Melhores clínicas"
                  value={formatValue(
                    indicator.topPerformersAverage,
                    indicator.unit,
                  )}
                />
              </Box>

              <LinearProgress
                variant="determinate"
                value={getProgressValue(indicator)}
                color={positive ? "success" : "warning"}
                sx={{
                  height: 10,
                  borderRadius: 10,
                  mb: 2,
                }}
              />

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mb: 2,
                }}
              >
                {positive ? (
                  <TrendingUpIcon color="success" />
                ) : (
                  <TrendingDownIcon color="error" />
                )}

                <Typography
                  sx={{
                    fontWeight: 900,
                    color: positive
                      ? "success.main"
                      : "error.main",
                  }}
                >
                  Diferença de{" "}
                  {Math.abs(difference).toFixed(1)}
                  {indicator.unit} em relação à média.
                </Typography>
              </Box>

              <Typography color="text.secondary">
                {indicator.description}
              </Typography>

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
                      Recomendação da IA
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
            </Paper>
          );
        })}
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            xl: "1.3fr 1fr",
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
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 3,
            }}
          >
            <BarChartIcon color="primary" />

            <Typography
              variant="h6"
              sx={{
                fontWeight: 900,
              }}
            >
              Evolução comparativa
            </Typography>
          </Box>

          {benchmarkEvolution.map((evolution) => (
            <Box
              key={evolution.period}
              sx={{
                mb: 3,
              }}
            >
              <Typography
                sx={{
                  fontWeight: 900,
                  mb: 1,
                }}
              >
                {evolution.period}
              </Typography>

              <Box sx={{ mb: 1.5 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 2,
                    mb: 0.5,
                  }}
                >
                  <Typography variant="body2">
                    DentalPos
                  </Typography>

                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 900,
                    }}
                  >
                    {evolution.clinicScore}
                  </Typography>
                </Box>

                <LinearProgress
                  variant="determinate"
                  value={evolution.clinicScore}
                  color="primary"
                  sx={{
                    height: 9,
                    borderRadius: 10,
                  }}
                />
              </Box>

              <Box>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 2,
                    mb: 0.5,
                  }}
                >
                  <Typography variant="body2">
                    Média do mercado
                  </Typography>

                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 900,
                    }}
                  >
                    {evolution.marketScore}
                  </Typography>
                </Box>

                <LinearProgress
                  variant="determinate"
                  value={evolution.marketScore}
                  color="info"
                  sx={{
                    height: 9,
                    borderRadius: 10,
                  }}
                />
              </Box>
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
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 3,
            }}
          >
            <InsightsIcon color="primary" />

            <Typography
              variant="h6"
              sx={{
                fontWeight: 900,
              }}
            >
              Plano de melhoria
            </Typography>
          </Box>

          <Typography color="text.secondary">
            O sistema poderá transformar os indicadores
            abaixo da média em metas, tarefas,
            responsáveis e prazos de execução.
          </Typography>

          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mt: 3,
              borderRadius: 2,
              bgcolor: "background.default",
            }}
          >
            <Typography
              sx={{
                fontWeight: 900,
              }}
            >
              Prioridade atual
            </Typography>

            <Typography
              color="text.secondary"
              sx={{
                mt: 1,
              }}
            >
              Reduzir o prazo do laboratório e a
              inadimplência para alcançar o grupo das
              clínicas de melhor desempenho.
            </Typography>
          </Paper>

          <Button
            fullWidth
            variant="contained"
            startIcon={<AutoAwesomeIcon />}
            sx={{
              mt: 3,
            }}
          >
            Gerar plano com IA
          </Button>
        </Paper>
      </Box>
    </Box>
  );
}

interface BenchmarkSummaryProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function BenchmarkSummary({
  title,
  value,
  icon,
}: BenchmarkSummaryProps) {
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

interface ComparisonProfileProps {
  title: string;
  value: string;
}

function ComparisonProfile({
  title,
  value,
}: ComparisonProfileProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
      >
        {title}
      </Typography>

      <Typography
        sx={{
          mt: 0.5,
          fontWeight: 900,
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}

interface BenchmarkValueProps {
  title: string;
  value: string;
  highlight?: boolean;
}

function BenchmarkValue({
  title,
  value,
  highlight = false,
}: BenchmarkValueProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        borderColor: highlight
          ? "primary.main"
          : "divider",
        bgcolor: highlight
          ? "action.hover"
          : "background.paper",
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
      >
        {title}
      </Typography>

      <Typography
        sx={{
          mt: 0.5,
          fontWeight: 900,
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}