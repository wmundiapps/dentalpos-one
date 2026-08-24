import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveForecastSummary {
  id: number;
  title: string;
  current: number;
  projected: number;
}

export interface ExecutiveForecastSummaryCardProps {
  forecasts: ExecutiveForecastSummary[];
}

export default function ExecutiveForecastSummaryCard({
  forecasts,
}: ExecutiveForecastSummaryCardProps) {
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
          Resumo das Projeções
        </Box>

        {forecasts.map((forecast, index) => {
          const variation =
            forecast.current === 0
              ? 0
              : ((forecast.projected - forecast.current) /
                  forecast.current) *
                100;

          return (
            <Box key={forecast.id}>

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
                    {forecast.title}
                  </Box>

                  <Box
                    component="div"
                    sx={{
                      color: "text.secondary",
                      fontSize: ".9rem",
                    }}
                  >
                    Atual: {money(forecast.current)}
                  </Box>

                  <Box
                    component="div"
                    sx={{
                      color: "primary.main",
                      fontSize: ".9rem",
                      fontWeight: 700,
                    }}
                  >
                    Previsto: {money(forecast.projected)}
                  </Box>

                </Box>

                <Chip
                  color={
                    variation >= 0
                      ? "success"
                      : "error"
                  }
                  label={`${variation >= 0 ? "+" : ""}${variation.toFixed(1)}%`}
                />

              </Box>

              {index < forecasts.length - 1 && (
                <Divider />
              )}

            </Box>
          );
        })}

      </CardContent>
    </Card>
  );
}
