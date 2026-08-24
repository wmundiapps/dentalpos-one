import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveReceivablesCardProps {
  totalReceivable: number;
  overdue: number;
  received: number;
  defaultRate: number;
}

export default function ExecutiveReceivablesCard({
  totalReceivable,
  overdue,
  received,
  defaultRate,
}: ExecutiveReceivablesCardProps) {
  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const receivedPercent =
    totalReceivable === 0
      ? 0
      : Math.min(
          (received / totalReceivable) * 100,
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
          Contas a Receber
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="strong">
            Total a Receber
          </Box>

          <Box
            sx={{
              color: "primary.main",
              fontWeight: 700,
            }}
          >
            {formatCurrency(totalReceivable)}
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="strong">
            Recebido
          </Box>

          <Box
            sx={{
              color: "success.main",
              fontWeight: 700,
            }}
          >
            {formatCurrency(received)}
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="strong">
            Em Atraso
          </Box>

          <Box
            sx={{
              color: "error.main",
              fontWeight: 700,
            }}
          >
            {formatCurrency(overdue)}
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={receivedPercent}
          sx={{
            mt: 3,
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
            color="success"
            label={`${receivedPercent.toFixed(1)}% recebido`}
          />

          <Chip
            color={
              defaultRate <= 5
                ? "success"
                : defaultRate <= 10
                ? "warning"
                : "error"
            }
            label={`Inadimplência ${defaultRate.toFixed(1)}%`}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
