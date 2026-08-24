import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutivePayablesCardProps {
  totalPayable: number;
  overdue: number;
  paid: number;
  nextDue: string;
}

export default function ExecutivePayablesCard({
  totalPayable,
  overdue,
  paid,
  nextDue,
}: ExecutivePayablesCardProps) {
  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const percent =
    totalPayable === 0
      ? 0
      : Math.min((paid / totalPayable) * 100, 100);

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
          Contas a Pagar
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="strong">
            Total a Pagar
          </Box>

          <Box
            sx={{
              color: "primary.main",
              fontWeight: 700,
            }}
          >
            {formatCurrency(totalPayable)}
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="strong">
            Pago
          </Box>

          <Box
            sx={{
              color: "success.main",
              fontWeight: 700,
            }}
          >
            {formatCurrency(paid)}
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="strong">
            Em atraso
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
          value={percent}
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
            label={`${percent.toFixed(1)}% pago`}
          />

          <Chip
            color={
              overdue > 0
                ? "error"
                : "success"
            }
            label={`Próx. venc.: ${nextDue}`}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
