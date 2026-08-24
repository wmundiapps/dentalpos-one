import { Card, CardContent, Typography } from "@mui/material";

export interface ExecutiveFinancialCardProps {
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
}

export default function ExecutiveFinancialCard({
  revenue,
  expenses,
  profit,
  margin,
}: ExecutiveFinancialCardProps) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6">
          Resumo Financeiro
        </Typography>

        <Typography>
          Receita: R$ {revenue.toLocaleString("pt-BR")}
        </Typography>

        <Typography>
          Despesas: R$ {expenses.toLocaleString("pt-BR")}
        </Typography>

        <Typography>
          Lucro: R$ {profit.toLocaleString("pt-BR")}
        </Typography>

        <Typography>
          Margem: {margin.toFixed(1)}%
        </Typography>
      </CardContent>
    </Card>
  );
}