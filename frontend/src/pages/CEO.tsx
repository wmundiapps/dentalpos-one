import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  TextField,
  Typography,
} from "@mui/material";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import InsightsIcon from "@mui/icons-material/Insights";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import PsychologyIcon from "@mui/icons-material/Psychology";
import SendIcon from "@mui/icons-material/Send";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";

import {
  calculateAverageAreaScore,
  calculateCriticalCEOAlerts,
  calculateOpenCEOAlerts,
  calculatePotentialImpact,
  ceoAlerts,
  ceoAreaScores,
  ceoForecasts,
  ceoKPIs,
  ceoMorningItems,
  ceoQuestionSuggestions,
  ceoRecommendations,
  ceoSummary,
  formatCEOMoney,
} from "../services/CEOService";

import type {
  CEOPriority,
  CEOTrend,
} from "../types/ceo";

function getPriorityColor(priority: CEOPriority) {
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

function getTrendIcon(trend: CEOTrend): ReactNode {
  switch (trend) {
    case "Crescimento":
      return (
        <TrendingUpIcon
          color="success"
          fontSize="small"
        />
      );

    case "Queda":
      return (
        <TrendingDownIcon
          color="error"
          fontSize="small"
        />
      );

    default:
      return (
        <TrendingFlatIcon
          color="action"
          fontSize="small"
        />
      );
  }
}

function getScoreColor(score: number) {
  if (score >= 90) {
    return "success" as const;
  }

  if (score >= 80) {
    return "primary" as const;
  }

  if (score >= 70) {
    return "warning" as const;
  }

  return "error" as const;
}

export default function CEO() {
  const openAlerts = calculateOpenCEOAlerts();
  const criticalAlerts = calculateCriticalCEOAlerts();
  const potentialImpact = calculatePotentialImpact();
  const averageScore = calculateAverageAreaScore();

  return (
    <Box>
      <PageHeader
        title="CEO IA"
        description="Conselho administrativo digital para análise, previsões e decisões estratégicas."
      />

      <Paper
        elevation={0}
        sx={{
          p: 4,
          mb: 4,
          borderRadius: 3,
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
              alignItems: "flex-start",
              gap: 2,
            }}
          >
            <PsychologyIcon
              sx={{
                fontSize: 58,
              }}
            />

            <Box>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 900,
                }}
              >
                {ceoSummary.greeting}
              </Typography>

              <Typography
                sx={{
                  mt: 0.5,
                  opacity: 0.85,
                }}
              >
                {ceoSummary.clinicName} •{" "}
                {ceoSummary.dateLabel}
              </Typography>

              <Typography
                sx={{
                  mt: 2,
                  maxWidth: 800,
                  fontSize: 17,
                }}
              >
                {ceoSummary.executiveMessage}
              </Typography>

              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  mt: 2,
                  opacity: 0.75,
                }}
              >
                Relatório gerado em{" "}
                {ceoSummary.generatedAt}
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              minWidth: {
                xs: "100%",
                lg: 260,
              },
              p: 3,
              borderRadius: 3,
              bgcolor: "rgba(255,255,255,0.14)",
              textAlign: "center",
            }}
          >
            <Typography sx={{ opacity: 0.85 }}>
              Score executivo
            </Typography>

            <Typography
              variant="h2"
              sx={{
                my: 1,
                fontWeight: 900,
              }}
            >
              {ceoSummary.generalScore}
            </Typography>

            <Typography sx={{ fontWeight: 900 }}>
              {ceoSummary.healthLevel}
            </Typography>

            <Typography
              variant="body2"
              sx={{
                mt: 1,
                opacity: 0.85,
              }}
            >
              +
              {ceoSummary.generalScore -
                ceoSummary.previousScore}{" "}
              pontos desde a medição anterior
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
            xl: "repeat(4, 1fr)",
          },
          gap: 3,
          mb: 4,
        }}
      >
        <CEOSummaryCard
          title="Média das áreas"
          value={`${averageScore.toFixed(1)}/100`}
          icon={<InsightsIcon />}
        />

        <CEOSummaryCard
          title="Alertas em aberto"
          value={String(openAlerts)}
          icon={<WarningAmberIcon />}
        />

        <CEOSummaryCard
          title="Alertas críticos"
          value={String(criticalAlerts)}
          icon={<WarningAmberIcon />}
        />

        <CEOSummaryCard
          title="Impacto potencial"
          value={formatCEOMoney(potentialImpact)}
          icon={<MonetizationOnIcon />}
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
          variant="h5"
          sx={{
            fontWeight: 900,
            mb: 3,
          }}
        >
          Radar executivo
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(2, 1fr)",
              xl: "repeat(5, 1fr)",
            },
            gap: 2,
          }}
        >
          {ceoAreaScores.map((areaScore) => (
            <Paper
              key={areaScore.id}
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  alignItems: "center",
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 900,
                  }}
                >
                  {areaScore.area}
                </Typography>

                <Chip
                  size="small"
                  label={areaScore.score}
                  color={getScoreColor(
                    areaScore.score,
                  )}
                  sx={{
                    fontWeight: 900,
                  }}
                />
              </Box>

              <LinearProgress
                variant="determinate"
                value={areaScore.score}
                color={getScoreColor(
                  areaScore.score,
                )}
                sx={{
                  height: 10,
                  borderRadius: 10,
                  my: 2,
                }}
              />

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  mb: 1,
                }}
              >
                {getTrendIcon(areaScore.trend)}

                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 800,
                  }}
                >
                  {areaScore.variation > 0 ? "+" : ""}
                  {areaScore.variation} pontos
                </Typography>
              </Box>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                {areaScore.description}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Paper>

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
            Indicadores principais
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, 1fr)",
              },
              gap: 2,
            }}
          >
            {ceoKPIs.map((kpi) => (
              <Paper
                key={kpi.id}
                variant="outlined"
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                }}
              >
                <Typography color="text.secondary">
                  {kpi.title}
                </Typography>

                <Typography
                  variant="h5"
                  sx={{
                    mt: 1,
                    fontWeight: 900,
                  }}
                >
                  {kpi.value}
                </Typography>

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    mt: 1.5,
                  }}
                >
                  {getTrendIcon(kpi.trend)}

                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 900,
                      color:
                        kpi.trend === "Crescimento"
                          ? "success.main"
                          : kpi.trend === "Queda"
                            ? "error.main"
                            : "text.secondary",
                    }}
                  >
                    {kpi.variation > 0 ? "+" : ""}
                    {kpi.variation}%
                  </Typography>
                </Box>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: "block",
                    mt: 1,
                  }}
                >
                  {kpi.comparison}
                </Typography>
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
          <Typography
            variant="h6"
            sx={{
              fontWeight: 900,
              mb: 3,
            }}
          >
            Previsões executivas
          </Typography>

          {ceoForecasts.map((forecast) => (
            <Paper
              key={forecast.id}
              variant="outlined"
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 900,
                    }}
                  >
                    {forecast.type}
                  </Typography>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                  >
                    {forecast.period}
                  </Typography>
                </Box>

                <Chip
                  size="small"
                  label={`${forecast.confidencePercent}% confiança`}
                  variant="outlined"
                />
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 2,
                  mt: 2,
                }}
              >
                <SmallMetric
                  title="Atual"
                  value={formatCEOMoney(
                    forecast.currentValue,
                  )}
                />

                <SmallMetric
                  title="Projetado"
                  value={formatCEOMoney(
                    forecast.projectedValue,
                  )}
                />
              </Box>

              <Typography
                variant="body2"
                sx={{
                  mt: 2,
                  fontWeight: 900,
                  color:
                    forecast.variationPercent >= 0
                      ? "success.main"
                      : "error.main",
                }}
              >
                {forecast.variationPercent > 0
                  ? "+"
                  : ""}
                {forecast.variationPercent.toFixed(1)}%
              </Typography>
            </Paper>
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
        <Typography
          variant="h5"
          sx={{
            fontWeight: 900,
            mb: 3,
          }}
        >
          Alertas executivos
        </Typography>

        {ceoAlerts.map((alert) => (
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
                flexWrap: "wrap",
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
                  {alert.area} • {alert.createdAt}
                </Typography>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  flexWrap: "wrap",
                }}
              >
                <Chip
                  size="small"
                  label={alert.priority}
                  color={getPriorityColor(
                    alert.priority,
                  )}
                />

                <Chip
                  size="small"
                  label={alert.status}
                  variant="outlined"
                />
              </Box>
            </Box>

            <Typography
              color="text.secondary"
              sx={{
                mt: 1.5,
              }}
            >
              {alert.description}
            </Typography>

            <Box
              sx={{
                display: "flex",
                gap: 2,
                flexWrap: "wrap",
                mt: 2,
              }}
            >
              {alert.financialImpact !== undefined && (
                <Chip
                  size="small"
                  label={`Impacto: ${formatCEOMoney(
                    alert.financialImpact,
                  )}`}
                  variant="outlined"
                />
              )}

              {alert.deadline && (
                <Chip
                  size="small"
                  label={`Prazo: ${alert.deadline}`}
                  variant="outlined"
                />
              )}

              {alert.responsible && (
                <Chip
                  size="small"
                  label={`Responsável: ${alert.responsible}`}
                  variant="outlined"
                />
              )}
            </Box>
          </Paper>
        ))}
      </Paper>

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
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 3,
            }}
          >
            <AutoAwesomeIcon color="primary" />

            <Typography
              variant="h6"
              sx={{
                fontWeight: 900,
              }}
            >
              Recomendações estratégicas
            </Typography>
          </Box>

          {ceoRecommendations.map(
            (recommendation) => (
              <Paper
                key={recommendation.id}
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
                    justifyContent:
                      "space-between",
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
                      {recommendation.title}
                    </Typography>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                    >
                      {recommendation.area}
                    </Typography>
                  </Box>

                  <Chip
                    size="small"
                    label={recommendation.priority}
                    color={getPriorityColor(
                      recommendation.priority,
                    )}
                  />
                </Box>

                <Typography
                  color="text.secondary"
                  sx={{
                    mt: 1.5,
                  }}
                >
                  {recommendation.description}
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
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 900,
                    }}
                  >
                    Ação sugerida
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    {recommendation.action}
                  </Typography>

                  <Box
                    sx={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: 2,
                      mt: 1.5,
                      flexWrap: "wrap",
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 900,
                        color: "success.main",
                      }}
                    >
                      Impacto estimado:{" "}
                      {formatCEOMoney(
                        recommendation.estimatedImpact,
                      )}
                    </Typography>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                    >
                      Confiança:{" "}
                      {
                        recommendation.confidencePercent
                      }
                      %
                    </Typography>
                  </Box>
                </Paper>
              </Paper>
            ),
          )}
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
            Morning briefing
          </Typography>

          {ceoMorningItems.map((item) => (
            <Paper
              key={item.id}
              variant="outlined"
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1.5,
                }}
              >
                {item.completed ? (
                  <CheckCircleIcon color="success" />
                ) : (
                  <WarningAmberIcon
                    color={getPriorityColor(
                      item.priority,
                    )}
                  />
                )}

                <Box sx={{ flexGrow: 1 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: 2,
                      flexWrap: "wrap",
                    }}
                  >
                    <Typography
                      sx={{
                        fontWeight: 900,
                      }}
                    >
                      {item.title}
                    </Typography>

                    <Chip
                      size="small"
                      label={item.priority}
                      color={getPriorityColor(
                        item.priority,
                      )}
                    />
                  </Box>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mt: 1,
                    }}
                  >
                    {item.description}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          ))}
        </Paper>
      </Box>

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
            variant="h5"
            sx={{
              fontWeight: 900,
            }}
          >
            Converse com o CEO IA
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            mb: 3,
          }}
        >
          {ceoQuestionSuggestions.map(
            (suggestion) => (
              <Chip
                key={suggestion.id}
                label={suggestion.question}
                variant="outlined"
                clickable
              />
            ),
          )}
        </Box>

        <TextField
          fullWidth
          multiline
          minRows={4}
          label="Pergunte ao CEO IA"
          placeholder="Exemplo: quanto posso investir em marketing sem comprometer o caixa?"
        />

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mt: 2,
          }}
        >
          <Button
            variant="contained"
            startIcon={<SendIcon />}
          >
            Analisar e responder
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

interface CEOSummaryCardProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function CEOSummaryCard({
  title,
  value,
  icon,
}: CEOSummaryCardProps) {
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

interface SmallMetricProps {
  title: string;
  value: string;
}

function SmallMetric({
  title,
  value,
}: SmallMetricProps) {
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