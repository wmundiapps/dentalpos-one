import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

import PsychologyAltIcon from "@mui/icons-material/PsychologyAlt";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";

export interface ExecutiveAIPlan {
  id: number;
  title: string;
  objective: string;
  expectedResult: string;
  priority: "Baixa" | "Média" | "Alta" | "Crítica";
}

export interface ExecutiveAIPlannerCardProps {
  plans: ExecutiveAIPlan[];
  onExecute?: (id: number) => void;
}

export default function ExecutiveAIPlannerCard({
  plans,
  onExecute,
}: ExecutiveAIPlannerCardProps) {
  function getColor(
    priority: ExecutiveAIPlan["priority"],
  ): "success" | "info" | "warning" | "error" {
    switch (priority) {
      case "Crítica":
        return "error";

      case "Alta":
        return "warning";

      case "Média":
        return "info";

      default:
        return "success";
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
            display: "flex",
            alignItems: "center",
            gap: 1,
            m: 0,
            mb: 3,
            fontWeight: 800,
            fontSize: "1.2rem",
          }}
        >
          <PsychologyAltIcon color="primary" />
          Planejador IA
        </Box>

        <Stack spacing={2}>

          {plans.map((plan) => (
            <Card
              key={plan.id}
              variant="outlined"
            >
              <CardContent>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      fontWeight: 700,
                    }}
                  >
                    {plan.title}
                  </Box>

                  <Chip
                    color={getColor(plan.priority)}
                    label={plan.priority}
                  />
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                    mb: 2,
                  }}
                >
                  {plan.objective}
                </Box>

                <Box
                  sx={{
                    color: "success.main",
                    fontWeight: 700,
                    mb: 3,
                  }}
                >
                  {plan.expectedResult}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <Button
                    variant="contained"
                    startIcon={<AutoFixHighIcon />}
                    onClick={() =>
                      onExecute?.(plan.id)
                    }
                  >
                    Executar Plano
                  </Button>
                </Box>

              </CardContent>
            </Card>
          ))}

        </Stack>

      </CardContent>
    </Card>
  );
}
