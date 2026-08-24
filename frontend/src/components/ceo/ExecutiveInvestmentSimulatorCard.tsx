import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveInvestmentSimulation {
  id: number;
  investment: string;
  value: number;
  projectedReturn: number;
  paybackMonths: number;
}

export interface ExecutiveInvestmentSimulatorCardProps {
  simulations: ExecutiveInvestmentSimulation[];
}

export default function ExecutiveInvestmentSimulatorCard({
  simulations,
}: ExecutiveInvestmentSimulatorCardProps) {
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
          Simulador de Investimentos
        </Box>

        {simulations.map((simulation, index) => (
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
                  {simulation.investment}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  Investimento: {money(simulation.value)}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "success.main",
                    fontSize: ".9rem",
                    fontWeight: 700,
                  }}
                >
                  Retorno: {money(simulation.projectedReturn)}
                </Box>

              </Box>

              <Chip
                color="primary"
                label={`${simulation.paybackMonths} meses`}
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
