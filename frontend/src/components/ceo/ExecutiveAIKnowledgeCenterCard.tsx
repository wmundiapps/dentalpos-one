import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
} from "@mui/material";

import PsychologyIcon from "@mui/icons-material/Psychology";

export interface ExecutiveKnowledgeModule {
  id: number;
  name: string;
  confidence: number;
  status: "Treinando" | "Pronto" | "Atualizando";
}

export interface ExecutiveAIKnowledgeCenterCardProps {
  modules: ExecutiveKnowledgeModule[];
}

export default function ExecutiveAIKnowledgeCenterCard({
  modules,
}: ExecutiveAIKnowledgeCenterCardProps) {
  function getColor(
    status: ExecutiveKnowledgeModule["status"],
  ): "info" | "success" | "warning" {
    switch (status) {
      case "Pronto":
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
          <PsychologyIcon color="primary" />
          Base de Conhecimento da IA
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
                value={module.confidence}
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
                Conhecimento: {module.confidence.toFixed(0)}%
              </Box>

            </Box>
          ))}

        </Stack>

      </CardContent>
    </Card>
  );
}
