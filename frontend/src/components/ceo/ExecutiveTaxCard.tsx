import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveTaxCardProps {
  taxesDue: number;
  taxesPaid: number;
  nextDueDate: string;
  estimatedMonthTax: number;
}

export default function ExecutiveTaxCard({
  taxesDue,
  taxesPaid,
  nextDueDate,
  estimatedMonthTax,
}: ExecutiveTaxCardProps) {
  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const percent =
    taxesDue === 0
      ? 100
      : Math.min((taxesPaid / taxesDue) * 100, 100);

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
          Gestão Tributária
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="strong">
            Impostos do Período
          </Box>

          <Box
            sx={{
              color: "error.main",
              fontWeight: 700,
            }}
          >
            {formatCurrency(taxesDue)}
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="strong">
            Já Recolhido
          </Box>

          <Box
            sx={{
              color: "success.main",
              fontWeight: 700,
            }}
          >
            {formatCurrency(taxesPaid)}
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Box component="strong">
            Estimativa Próximo Mês
          </Box>

          <Box
            sx={{
              fontWeight: 800,
            }}
          >
            {formatCurrency(estimatedMonthTax)}
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={percent}
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
            color="primary"
            label={`Venc.: ${nextDueDate}`}
          />

          <Chip
            color={
              percent >= 100
                ? "success"
                : "warning"
            }
            label={`${percent.toFixed(1)}%`}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
