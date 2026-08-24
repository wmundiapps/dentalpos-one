import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveDecisionSimulation {
  id: number;
  decision: string;
  impact: string;
  risk: "Baixo" | "Médio" | "Alto";
  recommendation: string;
}

export interface ExecutiveDecisionSimulatorCardProps {
  simulations: ExecutiveDecisionSimulation[];
}

export default function ExecutiveDecisionSimulatorCard({
  simulations,
}: ExecutiveDecisionSimulatorCardProps) {
  function getColor(
    risk: ExecutiveDecisionSimulation["risk"],
  ): "success" | "warning" | "error" {
    switch (risk) {
      case "Baixo":
        return "success";

      case "Médio":
        return "warning";

      default:
        return "error";
    }
  }

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
          Simulador de Decisões
        </Box>

        {simulations.map((simulation, index) => (
          <Box key={simulation.id}>

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
                  {simulation.decision}
                </Box>

                <Box
                  component="div"
                  sx={{
                    mt: 1,
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  {simulation.impact}
                </Box>

                <Box
                  component="div"
                  sx={{
                    mt: 1,
                    color: "primary.main",
                    fontSize: ".9rem",
                    fontWeight: 700,
                  }}
                >
                  {simulation.recommendation}
                </Box>

              </Box>

              <Chip
                color={getColor(simulation.risk)}
                label={simulation.risk}
              />

            </Box>

            {index < simulations.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
