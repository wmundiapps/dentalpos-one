import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

import HubIcon from "@mui/icons-material/Hub";

export interface ExecutiveAIProcess {
  id: number;
  name: string;
  status: "Executando" | "Aguardando" | "Concluído" | "Erro";
  description: string;
}

export interface ExecutiveAIOrchestratorCardProps {
  processes: ExecutiveAIProcess[];
  onOpen?: (id: number) => void;
}

export default function ExecutiveAIOrchestratorCard({
  processes,
  onOpen,
}: ExecutiveAIOrchestratorCardProps) {
  function getColor(
    status: ExecutiveAIProcess["status"],
  ): "success" | "warning" | "error" | "info" {
    switch (status) {
      case "Concluído":
        return "success";

      case "Executando":
        return "info";

      case "Erro":
        return "error";

      default:
        return "warning";
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
          <HubIcon color="primary" />
          Orquestrador da IA
        </Box>

        <Stack spacing={2}>

          {processes.map((process) => (

            <Card
              key={process.id}
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
                    {process.name}
                  </Box>

                  <Chip
                    color={getColor(process.status)}
                    label={process.status}
                  />
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                    mb: 3,
                  }}
                >
                  {process.description}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <Button
                    variant="contained"
                    onClick={() =>
                      onOpen?.(process.id)
                    }
                  >
                    Abrir
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
