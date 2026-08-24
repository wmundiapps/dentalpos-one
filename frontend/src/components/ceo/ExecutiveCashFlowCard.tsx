import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveCashFlowCardProps {
  currentBalance: number;
  expectedIncome: number;
  expectedExpenses: number;
  projectedBalance: number;
}

export default function ExecutiveCashFlowCard({
  currentBalance,
  expectedIncome,
  expectedExpenses,
  projectedBalance,
}: ExecutiveCashFlowCardProps) {
  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const utilization =
    expectedIncome + currentBalance === 0
      ? 0
      : Math.min(
          (expectedExpenses /
            (expectedIncome + currentBalance)) *
            100,
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
          Fluxo de Caixa
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="strong">
            Saldo Atual
          </Box>

          <Box
            sx={{
              color: "primary.main",
              fontWeight: 800,
            }}
          >
            {formatCurrency(currentBalance)}
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="strong">
            Entradas Previstas
          </Box>

          <Box
            sx={{
              color: "success.main",
            }}
          >
            {formatCurrency(expectedIncome)}
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="strong">
            Saídas Previstas
          </Box>

          <Box
            sx={{
              color: "error.main",
            }}
          >
            {formatCurrency(expectedExpenses)}
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Box component="strong">
            Saldo Projetado
          </Box>

          <Box
            sx={{
              fontWeight: 900,
              fontSize: "1.5rem",
              color:
                projectedBalance >= 0
                  ? "success.main"
                  : "error.main",
            }}
          >
            {formatCurrency(projectedBalance)}
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={utilization}
          sx={{
            height: 10,
            borderRadius: 10,
          }}
        />

        <Box
          sx={{
            mt: 2,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Chip
            color="info"
            label={`Uso ${utilization.toFixed(1)}%`}
          />

          <Chip
            color={
              projectedBalance >= 0
                ? "success"
                : "error"
            }
            label={
              projectedBalance >= 0
                ? "Saudável"
                : "Atenção"
            }
          />
        </Box>
      </CardContent>
    </Card>
  );
}
