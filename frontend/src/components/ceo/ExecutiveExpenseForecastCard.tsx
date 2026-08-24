import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveExpenseForecast {
  id: number;
  month: string;
  forecast: number;
  budget: number;
}

export interface ExecutiveExpenseForecastCardProps {
  forecasts: ExecutiveExpenseForecast[];
}

export default function ExecutiveExpenseForecastCard({
  forecasts,
}: ExecutiveExpenseForecastCardProps) {
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
          Previsão de Despesas
        </Box>

        {forecasts.map((forecast) => {
          const progress =
            forecast.budget <= 0
              ? 0
              : Math.min(
                  (forecast.forecast / forecast.budget) * 100,
                  100,
                );

          return (
            <Box
              key={forecast.id}
              sx={{ mb: 3 }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1,
                }}
              >
                <Box>

                  <Box
                    component="div"
                    sx={{
                      fontWeight: 700,
                    }}
                  >
                    {forecast.month}
                  </Box>

                  <Box
                    component="div"
                    sx={{
                      color: "error.main",
                      fontWeight: 700,
                    }}
                  >
                    {money(forecast.forecast)}
                  </Box>

                </Box>

                <Chip
                  color={
                    progress <= 80
                      ? "success"
                      : progress <= 100
                      ? "warning"
                      : "error"
                  }
                  label={`${progress.toFixed(0)}%`}
                />
              </Box>

              <LinearProgress
                variant="determinate"
                value={Math.min(progress, 100)}
                sx={{
                  height: 10,
                  borderRadius: 10,
                }}
              />
            </Box>
          );
        })}

      </CardContent>
    </Card>
  );
}
