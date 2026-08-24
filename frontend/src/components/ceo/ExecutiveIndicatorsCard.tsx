import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveIndicator {
  id: number;
  title: string;
  value: string;
  variation: number;
}

export interface ExecutiveIndicatorsCardProps {
  indicators: ExecutiveIndicator[];
}

export default function ExecutiveIndicatorsCard({
  indicators,
}: ExecutiveIndicatorsCardProps) {
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
          Indicadores Estratégicos
        </Box>

        {indicators.map((indicator, index) => (
          <Box key={indicator.id}>

            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                py: 2,
              }}
            >
              <Box>

                <Box
                  component="div"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {indicator.title}
                </Box>

                <Box
                  component="div"
                  sx={{
                    fontSize: "1.25rem",
                    fontWeight: 800,
                  }}
                >
                  {indicator.value}
                </Box>

              </Box>

              <Chip
                color={
                  indicator.variation >= 0
                    ? "success"
                    : "error"
                }
                label={`${indicator.variation >= 0 ? "+" : ""}${indicator.variation.toFixed(1)}%`}
              />

            </Box>

            {index < indicators.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
