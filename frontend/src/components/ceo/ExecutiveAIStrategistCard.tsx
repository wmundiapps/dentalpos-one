import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveAIStrategy {
  id: number;
  title: string;
  explanation: string;
  estimatedGain: number;
  confidence: number;
}

export interface ExecutiveAIStrategistCardProps {
  strategies: ExecutiveAIStrategy[];
}

export default function ExecutiveAIStrategistCard({
  strategies,
}: ExecutiveAIStrategistCardProps) {
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
          Estratégias da IA
        </Box>

        {strategies.map((strategy, index) => (

          <Box key={strategy.id}>

            <Box
              sx={{
                py: 2,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <Box sx={{ flex: 1 }}>

                <Box
                  component="div"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {strategy.title}
                </Box>

                <Box
                  component="div"
                  sx={{
                    mt: 1,
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  {strategy.explanation}
                </Box>

                <Box
                  component="div"
                  sx={{
                    mt: 1,
                    color: "success.main",
                    fontWeight: 700,
                  }}
                >
                  Ganho estimado: {money(strategy.estimatedGain)}
                </Box>

              </Box>

              <Chip
                color={
                  strategy.confidence >= 90
                    ? "success"
                    : strategy.confidence >= 70
                    ? "warning"
                    : "error"
                }
                label={`${strategy.confidence}%`}
              />

            </Box>

            {index < strategies.length - 1 && (
              <Divider />
            )}

          </Box>

        ))}

      </CardContent>
    </Card>
  );
}
