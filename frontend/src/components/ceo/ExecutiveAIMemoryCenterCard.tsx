import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
} from "@mui/material";

import StorageIcon from "@mui/icons-material/Storage";

export interface ExecutiveMemoryModule {
  id: number;
  name: string;
  utilization: number;
  status: "Sincronizado" | "Atualizando" | "Processando";
}

export interface ExecutiveAIMemoryCenterCardProps {
  modules: ExecutiveMemoryModule[];
}

export default function ExecutiveAIMemoryCenterCard({
  modules,
}: ExecutiveAIMemoryCenterCardProps) {
  function getColor(
    status: ExecutiveMemoryModule["status"],
  ): "success" | "warning" | "info" {
    switch (status) {
      case "Sincronizado":
        return "success";

      case "Atualizando":
        return "warning";

      default:
        return "info";
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
          <StorageIcon color="primary" />
          Memória da IA
        </Box>

        <Stack spacing={3}>

          {modules.map((module) => (
            <Box key={module.id}>

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {module.name}
                </Box>

                <Chip
                  color={getColor(module.status)}
                  label={module.status}
                />
              </Box>

              <LinearProgress
                variant="determinate"
                value={module.utilization}
                sx={{
                  height: 10,
                  borderRadius: 10,
                }}
              />

              <Box
                sx={{
                  mt: 1,
                  textAlign: "right",
                  color: "text.secondary",
                  fontSize: ".85rem",
                }}
              >
                {module.utilization.toFixed(0)}%
              </Box>

            </Box>
          ))}

        </Stack>

      </CardContent>
    </Card>
  );
}
