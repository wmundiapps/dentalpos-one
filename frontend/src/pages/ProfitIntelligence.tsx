import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CalculateIcon from "@mui/icons-material/Calculate";
import ChairIcon from "@mui/icons-material/Chair";
import GroupsIcon from "@mui/icons-material/Groups";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import PriceCheckIcon from "@mui/icons-material/PriceCheck";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";

import {
  calculateOverallMargin,
  calculateProfessionalMargin,
  calculateProfessionalNetProfit,
  calculateRoomOccupancy,
  calculateRoomProfit,
  calculateTotalGrossRevenue,
  calculateTotalNetProfit,
  financialInsights,
  formatProfitMoney,
  getAllProcedurePricing,
  professionalProfitability,
  profitScenarios,
  roomProfitability,
} from "../services/ProfitIntelligenceService";

import type {
  FinancialInsightPriority,
  ProfitabilityLevel,
} from "../types/profitIntelligence";

function getProfitabilityColor(
  level: ProfitabilityLevel,
) {
  switch (level) {
    case "Excelente":
      return "success" as const;

    case "Saudável":
      return "primary" as const;

    case "Atenção":
      return "warning" as const;

    case "Prejuízo":
      return "error" as const;

    default:
      return "default" as const;
  }
}

function getPriorityColor(
  priority: FinancialInsightPriority,
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

function getMarginColor(margin: number) {
  if (margin >= 30) {
    return "success" as const;
  }

  if (margin >= 20) {
    return "primary" as const;
  }

  if (margin >= 10) {
    return "warning" as const;
  }

  return "error" as const;
}

export default function ProfitIntelligence() {
  const procedurePricing = getAllProcedurePricing();

  const totalRevenue = calculateTotalGrossRevenue();
  const totalProfit = calculateTotalNetProfit();
  const overallMargin = calculateOverallMargin();

  const proceduresBelowMinimum =
    procedurePricing.filter(
      (procedure) =>
        procedure.level === "Atenção" ||
        procedure.level === "Prejuízo",
    ).length;

  return (
    <Box>
      <PageHeader
        title="Inteligência Financeira"
        description="Precificação, custos, margem, lucro por procedimento, profissional, cadeira e simulações estratégicas."
        actionLabel="Nova simulação"
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
        <ProfitSummary
          title="Faturamento analisado"
          value={formatProfitMoney(totalRevenue)}
          icon={<MonetizationOnIcon />}
        />

        <ProfitSummary
          title="Lucro líquido estimado"
          value={formatProfitMoney(totalProfit)}
          icon={<TrendingUpIcon />}
        />

        <ProfitSummary
          title="Margem geral"
          value={`${overallMargin.toFixed(1)}%`}
          icon={<ShowChartIcon />}
        />

        <ProfitSummary
          title="Procedimentos em atenção"
          value={String(proceduresBelowMinimum)}
          icon={<WarningAmberIcon />}
        />
      </Box>

      <Paper
        elevation={0}
        sx={{
          mb: 4,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            p: 3,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <PriceCheckIcon color="primary" />

            <Box>
              <Typography
                variant="h5"
                sx={{ fontWeight: 900 }}
              >
                Precificação inteligente
              </Typography>

              <Typography color="text.secondary">
                Comparação entre preço atual, custo real,
                preço mínimo, ideal e premium.
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr 125px",
              xl: "1.3fr 115px 115px 115px 115px 110px 130px",
            },
            gap: 2,
            px: 3,
            py: 2,
            bgcolor: "primary.main",
            color: "#FFFFFF",
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>
            Procedimento
          </Typography>

          <Typography sx={{ fontWeight: 700 }}>
            Margem
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: { xs: "none", xl: "block" },
            }}
          >
            Preço atual
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: { xs: "none", xl: "block" },
            }}
          >
            Custo total
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: { xs: "none", xl: "block" },
            }}
          >
            Mínimo
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: { xs: "none", xl: "block" },
            }}
          >
            Ideal
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: { xs: "none", xl: "block" },
            }}
          >
            Situação
          </Typography>
        </Box>

        {procedurePricing.map((result) => {
          const source = professionalProcedureSource(
            result.procedureId,
          );

          return (
            <Box
              key={result.procedureId}
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr 125px",
                  xl: "1.3fr 115px 115px 115px 115px 110px 130px",
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
                  {result.procedureName}
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  {source?.specialty} •{" "}
                  {source?.numberOfSessions} consulta(s) •{" "}
                  {result.totalClinicalHours.toFixed(1)} hora(s)
                </Typography>
              </Box>

              <Typography
                sx={{
                  fontWeight: 900,
                  color:
                    result.currentMarginPercent >= 20
                      ? "success.main"
                      : result.currentMarginPercent >= 10
                        ? "warning.main"
                        : "error.main",
                }}
              >
                {result.currentMarginPercent.toFixed(1)}%
              </Typography>

              <Typography
                sx={{
                  display: { xs: "none", xl: "block" },
                  fontWeight: 800,
                }}
              >
                {formatProfitMoney(
                  source?.averagePrice ?? 0,
                )}
              </Typography>

              <Typography
                sx={{
                  display: { xs: "none", xl: "block" },
                }}
              >
                {formatProfitMoney(
                  result.totalEstimatedCost,
                )}
              </Typography>

              <Typography
                sx={{
                  display: { xs: "none", xl: "block" },
                }}
              >
                {formatProfitMoney(result.minimumPrice)}
              </Typography>

              <Typography
                sx={{
                  display: { xs: "none", xl: "block" },
                  fontWeight: 900,
                }}
              >
                {formatProfitMoney(result.idealPrice)}
              </Typography>

              <Box
                sx={{
                  display: { xs: "none", xl: "block" },
                }}
              >
                <Chip
                  size="small"
                  label={result.level}
                  color={getProfitabilityColor(
                    result.level,
                  )}
                />
              </Box>
            </Box>
          );
        })}
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
            <GroupsIcon color="primary" />

            <Typography
              variant="h6"
              sx={{ fontWeight: 900 }}
            >
              Rentabilidade por profissional
            </Typography>
          </Box>

          {professionalProfitability.map(
            (professional) => {
              const netProfit =
                calculateProfessionalNetProfit(
                  professional,
                );

              const margin =
                calculateProfessionalMargin(
                  professional,
                );

              const profitPerHour =
                professional.workedHours > 0
                  ? netProfit /
                    professional.workedHours
                  : 0;

              return (
                <Paper
                  key={professional.id}
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
                      flexWrap: "wrap",
                    }}
                  >
                    <Box>
                      <Typography
                        sx={{ fontWeight: 900 }}
                      >
                        {professional.professionalName}
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        {professional.specialty}
                      </Typography>
                    </Box>

                    <Chip
                      label={`${margin.toFixed(1)}%`}
                      color={getMarginColor(margin)}
                      sx={{ fontWeight: 900 }}
                    />
                  </Box>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr 1fr",
                        md: "repeat(4, 1fr)",
                      },
                      gap: 2,
                      mt: 2,
                    }}
                  >
                    <MetricBox
                      title="Receita"
                      value={formatProfitMoney(
                        professional.grossRevenue,
                      )}
                    />

                    <MetricBox
                      title="Lucro"
                      value={formatProfitMoney(netProfit)}
                    />

                    <MetricBox
                      title="Lucro por hora"
                      value={formatProfitMoney(
                        profitPerHour,
                      )}
                    />

                    <MetricBox
                      title="Retrabalho"
                      value={formatProfitMoney(
                        professional.reworkValue,
                      )}
                    />
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 2,
                      mt: 2,
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                    >
                      Margem líquida estimada
                    </Typography>

                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 900 }}
                    >
                      {margin.toFixed(1)}%
                    </Typography>
                  </Box>

                  <LinearProgress
                    variant="determinate"
                    value={Math.min(
                      Math.max(margin * 2.5, 0),
                      100,
                    )}
                    color={getMarginColor(margin)}
                    sx={{
                      height: 9,
                      borderRadius: 10,
                    }}
                  />
                </Paper>
              );
            },
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
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 3,
            }}
          >
            <ChairIcon color="primary" />

            <Typography
              variant="h6"
              sx={{ fontWeight: 900 }}
            >
              Rentabilidade por consultório
            </Typography>
          </Box>

          {roomProfitability.map((room) => {
            const profit = calculateRoomProfit(room);
            const occupancy =
              calculateRoomOccupancy(room);

            return (
              <Paper
                key={room.id}
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
                  }}
                >
                  <Box>
                    <Typography
                      sx={{ fontWeight: 900 }}
                    >
                      {room.roomName}
                    </Typography>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                    >
                      {room.occupiedHours} de{" "}
                      {room.availableHours} horas ocupadas
                    </Typography>
                  </Box>

                  <Chip
                    size="small"
                    label={`${occupancy.toFixed(0)}%`}
                    color={
                      occupancy >= 80
                        ? "success"
                        : occupancy >= 60
                          ? "primary"
                          : occupancy >= 40
                            ? "warning"
                            : "error"
                    }
                  />
                </Box>

                <LinearProgress
                  variant="determinate"
                  value={occupancy}
                  color={
                    occupancy >= 80
                      ? "success"
                      : occupancy >= 60
                        ? "primary"
                        : occupancy >= 40
                          ? "warning"
                          : "error"
                  }
                  sx={{
                    height: 9,
                    borderRadius: 10,
                    my: 2,
                  }}
                />

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 2,
                  }}
                >
                  <MetricBox
                    title="Receita"
                    value={formatProfitMoney(
                      room.grossRevenue,
                    )}
                  />

                  <MetricBox
                    title="Lucro"
                    value={formatProfitMoney(profit)}
                  />
                </Box>
              </Paper>
            );
          })}
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
            alignItems: "center",
            gap: 1.5,
            mb: 3,
          }}
        >
          <CalculateIcon color="primary" />

          <Box>
            <Typography
              variant="h5"
              sx={{ fontWeight: 900 }}
            >
              Simulador de cenários
            </Typography>

            <Typography color="text.secondary">
              Impacto financeiro estimado antes de
              executar uma decisão.
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(2, 1fr)",
              xl: "repeat(4, 1fr)",
            },
            gap: 2,
          }}
        >
          {profitScenarios.map((scenario) => {
            const increase =
              scenario.projectedMonthlyProfit -
              scenario.currentMonthlyProfit;

            return (
              <Paper
                key={scenario.id}
                variant="outlined"
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                }}
              >
                <Typography
                  sx={{ fontWeight: 900 }}
                >
                  {scenario.title}
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 1,
                    minHeight: 80,
                  }}
                >
                  {scenario.description}
                </Typography>

                <Typography
                  variant="caption"
                  color="text.secondary"
                >
                  Aumento mensal estimado
                </Typography>

                <Typography
                  variant="h6"
                  sx={{
                    mt: 0.5,
                    fontWeight: 900,
                    color: "success.main",
                  }}
                >
                  +{formatProfitMoney(increase)}
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  Investimento:{" "}
                  {formatProfitMoney(
                    scenario.investmentRequired,
                  )}
                </Typography>

                {scenario.paybackMonths !==
                  undefined && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    Retorno:{" "}
                    {scenario.paybackMonths.toFixed(1)}{" "}
                    mês(es)
                  </Typography>
                )}

                <Button
                  fullWidth
                  variant="outlined"
                  sx={{ mt: 2 }}
                >
                  Abrir simulação
                </Button>
              </Paper>
            );
          })}
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
          <AutoAwesomeIcon color="primary" />

          <Typography
            variant="h5"
            sx={{ fontWeight: 900 }}
          >
            Recomendações da IA Financeira
          </Typography>
        </Box>

        {financialInsights.map((insight) => (
          <Paper
            key={insight.id}
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
                <Typography sx={{ fontWeight: 900 }}>
                  {insight.title}
                </Typography>

                <Typography
                  variant="caption"
                  color="text.secondary"
                >
                  {insight.module}
                </Typography>
              </Box>

              <Chip
                size="small"
                label={insight.priority}
                color={getPriorityColor(
                  insight.priority,
                )}
              />
            </Box>

            <Typography
              color="text.secondary"
              sx={{ mt: 1.5 }}
            >
              {insight.description}
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
                sx={{ fontWeight: 900 }}
              >
                Ação recomendada
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                {insight.recommendation}
              </Typography>

              <Typography
                variant="body2"
                sx={{
                  mt: 1,
                  fontWeight: 900,
                  color: "success.main",
                }}
              >
                Impacto potencial:{" "}
                {formatProfitMoney(
                  insight.estimatedImpact,
                )}
              </Typography>
            </Paper>
          </Paper>
        ))}

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mt: 3,
          }}
        >
          <Button
            variant="contained"
            startIcon={<AutoAwesomeIcon />}
          >
            Gerar plano financeiro com IA
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

function professionalProcedureSource(
  procedureId: number,
) {
  return (
    [
      {
        id: 1,
        specialty: "Implantodontia",
        averagePrice: 4900,
        numberOfSessions: 4,
      },
      {
        id: 2,
        specialty: "Prótese Dentária",
        averagePrice: 19500,
        numberOfSessions: 7,
      },
      {
        id: 3,
        specialty: "Ortodontia",
        averagePrice: 320,
        numberOfSessions: 1,
      },
      {
        id: 4,
        specialty: "Dentística",
        averagePrice: 1200,
        numberOfSessions: 3,
      },
      {
        id: 5,
        specialty: "Harmonização Orofacial",
        averagePrice: 1650,
        numberOfSessions: 2,
      },
    ].find((item) => item.id === procedureId) ?? null
  );
}

interface ProfitSummaryProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function ProfitSummary({
  title,
  value,
  icon,
}: ProfitSummaryProps) {
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

interface MetricBoxProps {
  title: string;
  value: string;
}

function MetricBox({
  title,
  value,
}: MetricBoxProps) {
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