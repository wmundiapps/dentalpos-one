import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveForecastCardProps {
  currentRevenue: number;
  projectedRevenue: number;
  projectedProfit: number;
  confidence: number;
  period: string;
}

export default function ExecutiveForecastCard({
  currentRevenue,
  projectedRevenue,
  projectedProfit,
  confidence,
  period,
}: ExecutiveForecastCardProps) {
  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const variation =
    currentRevenue === 0
      ? 0
      : ((projectedRevenue - currentRevenue) /
          currentRevenue) *
        100;

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
          Previsão da IA
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <strong>Período</strong>
          <Box>{period}</Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <strong>Receita Atual</strong>
          <Box>{money(currentRevenue)}</Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <strong>Receita Prevista</strong>
          <Box
            sx={{
              color: "success.main",
              fontWeight: 700,
            }}
          >
            {money(projectedRevenue)}
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 3,
          }}
        >
          <strong>Lucro Previsto</strong>
          <Box
            sx={{
              color: "primary.main",
              fontWeight: 700,
            }}
          >
            {money(projectedProfit)}
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={confidence}
          sx={{
            height: 10,
            borderRadius: 10,
          }}
        />

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mt: 2,
          }}
        >
          <Chip
            color="info"
            label={`Confiança ${confidence.toFixed(0)}%`}
          />

          <Chip
            color={
              variation >= 0
                ? "success"
                : "error"
            }
            label={`${variation >= 0 ? "+" : ""}${variation.toFixed(1)}%`}
          />
        </Box>

      </CardContent>
    </Card>
  );
}
