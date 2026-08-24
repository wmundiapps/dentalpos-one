import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveMonthlyProjection {
  id: number;
  month: string;
  income: number;
  expenses: number;
  balance: number;
}

export interface ExecutiveMonthlyProjectionCardProps {
  projections: ExecutiveMonthlyProjection[];
}

export default function ExecutiveMonthlyProjectionCard({
  projections,
}: ExecutiveMonthlyProjectionCardProps) {
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
          Projeção Mensal
        </Box>

        {projections.map((projection, index) => (
          <Box key={projection.id}>

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
                  {projection.month}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "success.main",
                    fontSize: ".9rem",
                  }}
                >
                  Entradas: {money(projection.income)}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "error.main",
                    fontSize: ".9rem",
                  }}
                >
                  Saídas: {money(projection.expenses)}
                </Box>

              </Box>

              <Chip
                color={
                  projection.balance >= 0
                    ? "success"
                    : "error"
                }
                label={money(projection.balance)}
              />

            </Box>

            {index < projections.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
