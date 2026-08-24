import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveAnalyticsCardProps {
  patients: number;
  appointments: number;
  conversionRate: number;
  averageTicket: number;
  monthlyRevenue: number;
}

export default function ExecutiveAnalyticsCard({
  patients,
  appointments,
  conversionRate,
  averageTicket,
  monthlyRevenue,
}: ExecutiveAnalyticsCardProps) {
  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <CardContent>

        <Box
          component="h2"
          sx={{
            m: 0,
            mb: 3,
            fontSize: "1.2rem",
            fontWeight: 800,
          }}
        >
          Analytics Executivo
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <strong>Pacientes</strong>
          <Box>{patients}</Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <strong>Consultas</strong>
          <Box>{appointments}</Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <strong>Conversão</strong>

          <Chip
            color={
              conversionRate >= 60
                ? "success"
                : conversionRate >= 40
                ? "warning"
                : "error"
            }
            label={`${conversionRate.toFixed(1)}%`}
          />
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <strong>Ticket Médio</strong>
          <Box>{money(averageTicket)}</Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <strong>Faturamento</strong>

          <Box
            sx={{
              fontSize: "1.25rem",
              fontWeight: 900,
              color: "success.main",
            }}
          >
            {money(monthlyRevenue)}
          </Box>
        </Box>

      </CardContent>
    </Card>
  );
}
