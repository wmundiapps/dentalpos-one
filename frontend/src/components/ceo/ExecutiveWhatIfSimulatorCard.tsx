import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveWhatIfScenario {
  id: number;
  scenario: string;
  investment: number;
  expectedRevenue: number;
  expectedProfit: number;
  recommendation: "Aprovado" | "Cautela" | "Rejeitado";
}

export interface ExecutiveWhatIfSimulatorCardProps {
  scenarios: ExecutiveWhatIfScenario[];
}

export default function ExecutiveWhatIfSimulatorCard({
  scenarios,
}: ExecutiveWhatIfSimulatorCardProps) {
  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  function getColor(
    recommendation: ExecutiveWhatIfScenario["recommendation"],
  ): "success" | "warning" | "error" {
    switch (recommendation) {
      case "Aprovado":
        return "success";

      case "Cautela":
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
          Simulador "E se..."
        </Box>

        {scenarios.map((scenario, index) => (
          <Box key={scenario.id}>

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
                  {scenario.scenario}
                </Box>

                <Box
                  component="div"
                  sx={{
                    mt: 1,
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  Investimento: {money(scenario.investment)}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "success.main",
                    fontSize: ".9rem",
                  }}
                >
                  Receita prevista: {money(scenario.expectedRevenue)}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "primary.main",
                    fontWeight: 700,
                    fontSize: ".9rem",
                  }}
                >
                  Lucro previsto: {money(scenario.expectedProfit)}
                </Box>

              </Box>

              <Chip
                color={getColor(scenario.recommendation)}
                label={scenario.recommendation}
              />

            </Box>

            {index < scenarios.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
