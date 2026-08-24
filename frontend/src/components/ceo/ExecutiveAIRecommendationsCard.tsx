import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

import RecommendIcon from "@mui/icons-material/Recommend";
import TaskAltIcon from "@mui/icons-material/TaskAlt";

export interface ExecutiveAIRecommendation {
  id: number;
  title: string;
  description: string;
  priority: "Baixa" | "Média" | "Alta" | "Crítica";
  estimatedGain: string;
}

export interface ExecutiveAIRecommendationsCardProps {
  recommendations: ExecutiveAIRecommendation[];
  onApply?: (id: number) => void;
}

export default function ExecutiveAIRecommendationsCard({
  recommendations,
  onApply,
}: ExecutiveAIRecommendationsCardProps) {
  function getColor(
    priority: ExecutiveAIRecommendation["priority"],
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
          <RecommendIcon color="primary" />
          Recomendações da IA
        </Box>

        <Stack spacing={2}>

          {recommendations.map((recommendation) => (
            <Card
              key={recommendation.id}
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
                    sx={{
                      fontWeight: 700,
                    }}
                  >
                    {recommendation.title}
                  </Box>

                  <Chip
                    color={getColor(recommendation.priority)}
                    label={recommendation.priority}
                  />
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                    mb: 2,
                  }}
                >
                  {recommendation.description}
                </Box>

                <Box
                  sx={{
                    color: "success.main",
                    fontWeight: 700,
                    mb: 3,
                  }}
                >
                  Ganho estimado: {recommendation.estimatedGain}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <Button
                    variant="contained"
                    startIcon={<TaskAltIcon />}
                    onClick={() =>
                      onApply?.(recommendation.id)
                    }
                  >
                    Aplicar
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
