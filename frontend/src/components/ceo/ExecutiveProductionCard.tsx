import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveProductionCardProps {
  procedures: number;
  revenue: number;
  averageTicket: number;
  productionGoal: number;
}

export default function ExecutiveProductionCard({
  procedures,
  revenue,
  averageTicket,
  productionGoal,
}: ExecutiveProductionCardProps) {
  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const progress =
    productionGoal === 0
      ? 0
      : Math.min(
          (revenue / productionGoal) * 100,
          100,
        );

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
            fontWeight: 800,
            fontSize: "1.2rem",
          }}
        >
          Produção Clínica
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Procedimentos
          </Box>

          <Box>{procedures}</Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Produção
          </Box>

          <Box
            sx={{
              color: "success.main",
              fontWeight: 700,
            }}
          >
            {money(revenue)}
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Ticket Médio
          </Box>

          <Box>{money(averageTicket)}</Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 10,
            borderRadius: 10,
          }}
        />

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mt: 2,
          }}
        >
          <Chip
            color={
              progress >= 100
                ? "success"
                : progress >= 80
                ? "warning"
                : "error"
            }
            label={`${progress.toFixed(1)}% da meta`}
          />
        </Box>

      </CardContent>
    </Card>
  );
}
