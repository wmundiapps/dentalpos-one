import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveExpenseItem {
  id: number;
  category: string;
  amount: number;
  percentage: number;
}

export interface ExecutiveExpensesBreakdownCardProps {
  expenses: ExecutiveExpenseItem[];
}

export default function ExecutiveExpensesBreakdownCard({
  expenses,
}: ExecutiveExpensesBreakdownCardProps) {
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
            fontSize: "1.2rem",
            fontWeight: 800,
          }}
        >
          Despesas por Categoria
        </Box>

        {expenses.map((expense, index) => (
          <Box key={expense.id}>

            <Box
              sx={{
                py: 2,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Box>

                <Box
                  component="div"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {expense.category}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "error.main",
                    fontWeight: 700,
                  }}
                >
                  {money(expense.amount)}
                </Box>

              </Box>

              <Chip
                color="error"
                label={`${expense.percentage.toFixed(1)}%`}
              />

            </Box>

            {index < expenses.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
