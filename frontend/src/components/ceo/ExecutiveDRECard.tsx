import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveDRECardProps {
  revenue: number;
  variableCosts: number;
  fixedCosts: number;
  taxes: number;
}

export default function ExecutiveDRECard({
  revenue,
  variableCosts,
  fixedCosts,
  taxes,
}: ExecutiveDRECardProps) {
  const grossProfit = revenue - variableCosts;
  const operatingProfit = grossProfit - fixedCosts;
  const netProfit = operatingProfit - taxes;

  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        height: "100%",
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
          Demonstrativo de Resultado (DRE)
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            Receita Bruta
          </Box>

          <Box
            component="span"
            sx={{
              color: "success.main",
              fontWeight: 700,
            }}
          >
            {money(revenue)}
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            (-) Custos Variáveis
          </Box>

          <Box
            component="span"
            sx={{
              color: "error.main",
              fontWeight: 700,
            }}
          >
            {money(variableCosts)}
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            Lucro Bruto
          </Box>

          <Box
            component="span"
            sx={{
              color: "primary.main",
              fontWeight: 700,
            }}
          >
            {money(grossProfit)}
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            (-) Custos Fixos
          </Box>

          <Box
            component="span"
            sx={{
              color: "error.main",
              fontWeight: 700,
            }}
          >
            {money(fixedCosts)}
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            (-) Tributos
          </Box>

          <Box
            component="span"
            sx={{
              color: "error.main",
              fontWeight: 700,
            }}
          >
            {money(taxes)}
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box
            component="span"
            sx={{
              fontWeight: 800,
              fontSize: "1.05rem",
            }}
          >
            Lucro Líquido
          </Box>

          <Chip
            label={money(netProfit)}
            color={netProfit >= 0 ? "success" : "error"}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
