import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveFinancialSummaryCardProps {
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
}

export default function ExecutiveFinancialSummaryCard({
  revenue,
  expenses,
  profit,
  margin,
}: ExecutiveFinancialSummaryCardProps) {
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
          Resumo Financeiro
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            py: 1,
          }}
        >
          <Box>Receitas</Box>

          <Box
            sx={{
              fontWeight: 700,
            }}
          >
            {money(revenue)}
          </Box>
        </Box>

        <Divider sx={{ my: 1 }} />

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            py: 1,
          }}
        >
          <Box>Despesas</Box>

          <Box
            sx={{
              fontWeight: 700,
            }}
          >
            {money(expenses)}
          </Box>
        </Box>

        <Divider sx={{ my: 1 }} />

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            py: 1,
          }}
        >
          <Box>Lucro</Box>

          <Box
            sx={{
              color:
                profit >= 0
                  ? "success.main"
                  : "error.main",
              fontWeight: 800,
            }}
          >
            {money(profit)}
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box>Margem</Box>

          <Chip
            color={
              margin >= 20
                ? "success"
                : margin >= 10
                ? "warning"
                : "error"
            }
            label={`${margin.toFixed(1)}%`}
          />
        </Box>
      </CardContent>
    </Card>
  );
}