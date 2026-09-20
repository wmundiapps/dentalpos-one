import {
  Box,
  Chip,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";

import AssessmentIcon from "@mui/icons-material/Assessment";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import GroupsIcon from "@mui/icons-material/Groups";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import PersonOffIcon from "@mui/icons-material/PersonOff";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";
import {
  executiveCards,
  type ExecutiveCard,
} from "../services/ExecutiveDashboardService";

interface ProfessionalProduction {
  id: number;
  name: string;
  specialty: string;
  appointments: number;
  production: number;
  occupancy: number;
}

interface ProcedurePerformance {
  id: number;
  name: string;
  quantity: number;
  revenue: number;
  conversionRate: number;
}

const professionalProduction: ProfessionalProduction[] = [
  {
    id: 1,
    name: "Dr. Robson",
    specialty: "Implantodontia e Prótese",
    appointments: 14,
    production: 28500,
    occupancy: 92,
  },
  {
    id: 2,
    name: "Dra. Cássia",
    specialty: "Ortodontia e Clínica",
    appointments: 18,
    production: 17400,
    occupancy: 88,
  },
  {
    id: 3,
    name: "Dra. Juliana",
    specialty: "Harmonização Orofacial",
    appointments: 9,
    production: 12800,
    occupancy: 76,
  },
  {
    id: 4,
    name: "Dr. Marcelo",
    specialty: "Cirurgia Oral",
    appointments: 6,
    production: 9600,
    occupancy: 64,
  },
];

const procedurePerformance: ProcedurePerformance[] = [
  {
    id: 1,
    name: "Implantes",
    quantity: 12,
    revenue: 34800,
    conversionRate: 68,
  },
  {
    id: 2,
    name: "Prótese sobre implante",
    quantity: 8,
    revenue: 19200,
    conversionRate: 72,
  },
  {
    id: 3,
    name: "Ortodontia",
    quantity: 11,
    revenue: 14300,
    conversionRate: 61,
  },
  {
    id: 4,
    name: "Harmonização Orofacial",
    quantity: 7,
    revenue: 11900,
    conversionRate: 58,
  },
];

const clinicRooms = [
  {
    id: 1,
    room: "Consultório 1",
    professional: "Dr. Robson",
    occupancy: 94,
  },
  {
    id: 2,
    room: "Consultório 2",
    professional: "Dra. Cássia",
    occupancy: 89,
  },
  {
    id: 3,
    room: "Consultório 3",
    professional: "Dra. Juliana",
    occupancy: 71,
  },
  {
    id: 4,
    room: "Consultório 4",
    professional: "Equipe clínica",
    occupancy: 48,
  },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getCardIcon(title: string): ReactNode {
  if (title.includes("Faturamento")) {
    return <AttachMoneyIcon />;
  }

  if (title.includes("Pacientes")) {
    return <GroupsIcon />;
  }

  if (title.includes("Orçamentos")) {
    return <PointOfSaleIcon />;
  }

  if (title.includes("Faltas")) {
    return <PersonOffIcon />;
  }

  if (
    title.includes("PIX") ||
    title.includes("Cartão") ||
    title.includes("Boletos") ||
    title.includes("Ticket")
  ) {
    return <AssessmentIcon />;
  }

  return <LocalHospitalIcon />;
}

function getProgressColor(value: number) {
  if (value >= 85) {
    return "success" as const;
  }

  if (value >= 65) {
    return "primary" as const;
  }

  if (value >= 50) {
    return "warning" as const;
  }

  return "error" as const;
}

export default function ExecutiveDashboard() {
  const totalProduction = professionalProduction.reduce(
    (total, professional) =>
      total + professional.production,
    0,
  );

  const totalAppointments = professionalProduction.reduce(
    (total, professional) =>
      total + professional.appointments,
    0,
  );

  const totalProcedureRevenue = procedurePerformance.reduce(
    (total, procedure) => total + procedure.revenue,
    0,
  );

  const averageOccupancy =
    clinicRooms.reduce(
      (total, room) => total + room.occupancy,
      0,
    ) / clinicRooms.length;

  return (
    <Box>
      <PageHeader
        title="Painel Executivo"
        description="Visão consolidada da produção, agenda, faturamento, conversão e desempenho da clínica."
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            xl: "repeat(4, 1fr)",
          },
          gap: 3,
          mb: 4,
        }}
      >
        {executiveCards.map((card) => (
          <ExecutiveMetricCard
            key={card.title}
            card={card}
            icon={getCardIcon(card.title)}
          />
        ))}
      </Box>

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
        <ExecutiveSummary
          title="Produção dos profissionais"
          value={formatCurrency(totalProduction)}
          description="Produção acumulada no período atual."
          icon={<AttachMoneyIcon />}
        />

        <ExecutiveSummary
          title="Atendimentos realizados"
          value={String(totalAppointments)}
          description="Total de atendimentos da equipe."
          icon={<EventAvailableIcon />}
        />

        <ExecutiveSummary
          title="Receita por procedimentos"
          value={formatCurrency(totalProcedureRevenue)}
          description="Receita vinculada aos principais tratamentos."
          icon={<PointOfSaleIcon />}
        />

        <ExecutiveSummary
          title="Ocupação média"
          value={`${averageOccupancy.toFixed(0)}%`}
          description="Ocupação média dos consultórios."
          icon={<LocalHospitalIcon />}
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
            Produção por profissional
          </Typography>

          {professionalProduction.map((professional) => (
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
                    {professional.name}
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    {professional.specialty}
                  </Typography>
                </Box>

                <Chip
                  label={formatCurrency(
                    professional.production,
                  )}
                  color="primary"
                  sx={{
                    fontWeight: 900,
                  }}
                />
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "130px 1fr",
                  },
                  gap: 2,
                  alignItems: "center",
                  mt: 2,
                }}
              >
                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  {professional.appointments} atendimentos
                </Typography>

                <Box>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 2,
                      mb: 0.5,
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                    >
                      Ocupação da agenda
                    </Typography>

                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 900,
                      }}
                    >
                      {professional.occupancy}%
                    </Typography>
                  </Box>

                  <LinearProgress
                    variant="determinate"
                    value={professional.occupancy}
                    color={getProgressColor(
                      professional.occupancy,
                    )}
                    sx={{
                      height: 9,
                      borderRadius: 10,
                    }}
                  />
                </Box>
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
          <Typography
            variant="h6"
            sx={{
              fontWeight: 900,
              mb: 3,
            }}
          >
            Ocupação dos consultórios
          </Typography>

          {clinicRooms.map((room) => (
            <Box
              key={room.id}
              sx={{
                mb: 3,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  mb: 0.5,
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 900,
                    }}
                  >
                    {room.room}
                  </Typography>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                  >
                    {room.professional}
                  </Typography>
                </Box>

                <Chip
                  size="small"
                  label={`${room.occupancy}%`}
                  color={getProgressColor(room.occupancy)}
                />
              </Box>

              <LinearProgress
                variant="determinate"
                value={room.occupancy}
                color={getProgressColor(room.occupancy)}
                sx={{
                  height: 10,
                  borderRadius: 10,
                  mt: 1,
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
          Desempenho por procedimento
        </Typography>

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
          {procedurePerformance.map((procedure) => (
            <Paper
              key={procedure.id}
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 2,
              }}
            >
              <Typography
                sx={{
                  fontWeight: 900,
                }}
              >
                {procedure.name}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt: 0.5,
                }}
              >
                {procedure.quantity} procedimentos
              </Typography>

              <Typography
                variant="h6"
                sx={{
                  mt: 2,
                  fontWeight: 900,
                }}
              >
                {formatCurrency(procedure.revenue)}
              </Typography>

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
                  Conversão
                </Typography>

                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 900,
                  }}
                >
                  {procedure.conversionRate}%
                </Typography>
              </Box>

              <LinearProgress
                variant="determinate"
                value={procedure.conversionRate}
                color={getProgressColor(
                  procedure.conversionRate,
                )}
                sx={{
                  height: 9,
                  borderRadius: 10,
                }}
              />
            </Paper>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}

interface ExecutiveMetricCardProps {
  card: ExecutiveCard;
  icon: ReactNode;
}

function ExecutiveMetricCard({
  card,
  icon,
}: ExecutiveMetricCardProps) {
  const isPositive = card.variation >= 0;

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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 2,
        }}
      >
        <Box>
          <Typography color="text.secondary">
            {card.title}
          </Typography>

          <Typography
            variant="h5"
            sx={{
              mt: 1,
              fontWeight: 900,
            }}
          >
            {card.value}
          </Typography>
        </Box>

        <Box
          sx={{
            width: 46,
            height: 46,
            borderRadius: 2,
            bgcolor: `${card.color}.main`,
            color: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          mt: 2,
        }}
      >
        {isPositive ? (
          <TrendingUpIcon
            fontSize="small"
            color="success"
          />
        ) : (
          <TrendingDownIcon
            fontSize="small"
            color="error"
          />
        )}

        <Typography
          variant="body2"
          sx={{
            fontWeight: 900,
            color: isPositive
              ? "success.main"
              : "error.main",
          }}
        >
          {card.variation > 0 ? "+" : ""}
          {card.variation}%
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
        >
          em relação ao período anterior
        </Typography>
      </Box>
    </Paper>
  );
}

interface ExecutiveSummaryProps {
  title: string;
  value: string;
  description: string;
  icon: ReactNode;
}

function ExecutiveSummary({
  title,
  value,
  description,
  icon,
}: ExecutiveSummaryProps) {
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
          width: 44,
          height: 44,
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

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          mt: 1,
        }}
      >
        {description}
      </Typography>
    </Paper>
  );
}