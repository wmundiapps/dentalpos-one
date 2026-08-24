import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveStrategicDecision {
  id: number;
  title: string;
  recommendation: string;
  financialImpact: number;
  confidence: number;
}

export interface ExecutiveStrategicDecisionCardProps {
  decisions: ExecutiveStrategicDecision[];
}

export default function ExecutiveStrategicDecisionCard({
  decisions,
}: ExecutiveStrategicDecisionCardProps) {
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
          Decisões Estratégicas da IA
        </Box>

        {decisions.map((decision, index) => (

          <Box key={decision.id}>

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
                  {decision.title}
                </Box>

                <Box
                  component="div"
                  sx={{
                    mt: 1,
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  {decision.recommendation}
                </Box>

                <Box
                  component="div"
                  sx={{
                    mt: 1,
                    color: "success.main",
                    fontWeight: 700,
                  }}
                >
                  Impacto: {money(decision.financialImpact)}
                </Box>

              </Box>

              <Chip
                color={
                  decision.confidence >= 90
                    ? "success"
                    : decision.confidence >= 70
                    ? "warning"
                    : "error"
                }
                label={`${decision.confidence}%`}
              />

            </Box>

            {index < decisions.length - 1 && (
              <Divider />
            )}

          </Box>

        ))}

      </CardContent>
    </Card>
  );
}
