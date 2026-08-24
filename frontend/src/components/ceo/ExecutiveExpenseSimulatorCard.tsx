import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveExpenseSimulation {
  id: number;
  description: string;
  currentCost: number;
  simulatedCost: number;
}

export interface ExecutiveExpenseSimulatorCardProps {
  simulations: ExecutiveExpenseSimulation[];
}

export default function ExecutiveExpenseSimulatorCard({
  simulations,
}: ExecutiveExpenseSimulatorCardProps) {
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
          Simulador de Despesas
        </Box>

        {simulations.map((simulation, index) => {
          const variation =
            simulation.simulatedCost -
            simulation.currentCost;

          return (
            <Box key={simulation.id}>

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
                    {simulation.description}
                  </Box>

                  <Box
                    component="div"
                    sx={{
                      color: "text.secondary",
                      fontSize: ".9rem",
                    }}
                  >
                    Atual: {money(simulation.currentCost)}
                  </Box>

                  <Box
                    component="div"
                    sx={{
                      color: "primary.main",
                      fontSize: ".9rem",
                    }}
                  >
                    Simulado: {money(simulation.simulatedCost)}
                  </Box>

                </Box>

                <Chip
                  color={
                    variation <= 0
                      ? "success"
                      : "error"
                  }
                  label={`${variation > 0 ? "+" : ""}${money(variation)}`}
                />

              </Box>

              {index < simulations.length - 1 && (
                <Divider />
              )}

            </Box>
          );
        })}

      </CardContent>
    </Card>
  );
}
