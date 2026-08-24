import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveRevenueForecast {
  id: number;
  month: string;
  forecast: number;
  target: number;
}

export interface ExecutiveRevenueForecastCardProps {
  forecasts: ExecutiveRevenueForecast[];
}

export default function ExecutiveRevenueForecastCard({
  forecasts,
}: ExecutiveRevenueForecastCardProps) {
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
          Previsão de Faturamento
        </Box>

        {forecasts.map((forecast) => {
          const progress =
            forecast.target <= 0
              ? 0
              : Math.min(
                  (forecast.forecast / forecast.target) * 100,
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
                      color: "success.main",
                      fontWeight: 700,
                    }}
                  >
                    {money(forecast.forecast)}
                  </Box>

                </Box>

                <Chip
                  color={
                    progress >= 100
                      ? "success"
                      : progress >= 80
                      ? "warning"
                      : "error"
                  }
                  label={`${progress.toFixed(0)}%`}
                />
              </Box>

              <LinearProgress
                variant="determinate"
                value={progress}
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
