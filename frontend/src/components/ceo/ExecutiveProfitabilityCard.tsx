import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveProfitabilityCardProps {
  grossRevenue: number;
  netRevenue: number;
  costs: number;
  expenses: number;
  profit: number;
}

export default function ExecutiveProfitabilityCard({
  grossRevenue,
  netRevenue,
  costs,
  expenses,
  profit,
}: ExecutiveProfitabilityCardProps) {
  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const margin =
    netRevenue === 0
      ? 0
      : (profit / netRevenue) * 100;

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
          Rentabilidade
        </Box>

        <Box sx={{ mb: 2 }}>
          <strong>Receita Bruta</strong>
          <Box color="primary.main">
            {formatCurrency(grossRevenue)}
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <strong>Receita Líquida</strong>
          <Box color="success.main">
            {formatCurrency(netRevenue)}
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <strong>Custos</strong>
          <Box color="warning.main">
            {formatCurrency(costs)}
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <strong>Despesas</strong>
          <Box color="error.main">
            {formatCurrency(expenses)}
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <strong>Lucro</strong>

          <Box
            sx={{
              fontSize: "1.6rem",
              fontWeight: 900,
              color:
                profit >= 0
                  ? "success.main"
                  : "error.main",
            }}
          >
            {formatCurrency(profit)}
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={Math.min(Math.max(margin, 0), 100)}
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
              margin >= 20
                ? "success"
                : margin >= 10
                ? "warning"
                : "error"
            }
            label={`Margem ${margin.toFixed(1)}%`}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
