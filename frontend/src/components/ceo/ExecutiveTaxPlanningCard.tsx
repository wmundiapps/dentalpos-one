import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveTaxPlanningCardProps {
  estimatedTaxes: number;
  taxSavings: number;
  taxBurdenPercent: number;
  regime: string;
}

export default function ExecutiveTaxPlanningCard({
  estimatedTaxes,
  taxSavings,
  taxBurdenPercent,
  regime,
}: ExecutiveTaxPlanningCardProps) {
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
            fontWeight: 800,
            fontSize: "1.2rem",
          }}
        >
          Planejamento Tributário
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Regime
          </Box>

          <Box>{regime}</Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Tributos Estimados
          </Box>

          <Box
            sx={{
              color: "error.main",
              fontWeight: 700,
            }}
          >
            {money(estimatedTaxes)}
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Economia Potencial
          </Box>

          <Box
            sx={{
              color: "success.main",
              fontWeight: 700,
            }}
          >
            {money(taxSavings)}
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={Math.min(taxBurdenPercent, 100)}
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
              taxBurdenPercent <= 15
                ? "success"
                : taxBurdenPercent <= 25
                ? "warning"
                : "error"
            }
            label={`${taxBurdenPercent.toFixed(1)}%`}
          />
        </Box>

      </CardContent>
    </Card>
  );
}
