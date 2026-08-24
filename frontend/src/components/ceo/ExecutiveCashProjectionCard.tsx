import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveCashProjection {
  id: number;
  period: string;
  income: number;
  expenses: number;
}

export interface ExecutiveCashProjectionCardProps {
  projections: ExecutiveCashProjection[];
}

export default function ExecutiveCashProjectionCard({
  projections,
}: ExecutiveCashProjectionCardProps) {
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
          Projeção de Caixa
        </Box>

        {projections.map((projection, index) => {
          const balance =
            projection.income - projection.expenses;

          return (
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
                    {projection.period}
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
                    balance >= 0
                      ? "success"
                      : "error"
                  }
                  label={money(balance)}
                />

              </Box>

              {index < projections.length - 1 && (
                <Divider />
              )}

            </Box>
          );
        })}

      </CardContent>
    </Card>
  );
}
