import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
} from "@mui/material";

import SchoolIcon from "@mui/icons-material/School";

export interface ExecutiveAILearningModule {
  id: number;
  module: string;
  progress: number;
  status: "Aprendendo" | "Otimizado" | "Atualizando";
}

export interface ExecutiveAILearningCenterCardProps {
  modules: ExecutiveAILearningModule[];
}

export default function ExecutiveAILearningCenterCard({
  modules,
}: ExecutiveAILearningCenterCardProps) {
  function getColor(
    status: ExecutiveAILearningModule["status"],
  ): "info" | "success" | "warning" {
    switch (status) {
      case "Otimizado":
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
          <SchoolIcon color="primary" />
          Centro de Aprendizagem da IA
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
                  {module.module}
                </Box>

                <Chip
                  color={getColor(module.status)}
                  label={module.status}
                />
              </Box>

              <LinearProgress
                variant="determinate"
                value={module.progress}
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
                {module.progress.toFixed(0)}%
              </Box>

            </Box>
          ))}

        </Stack>

      </CardContent>
    </Card>
  );
}
