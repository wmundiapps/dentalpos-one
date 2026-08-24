import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

import InsightsIcon from "@mui/icons-material/Insights";
import VisibilityIcon from "@mui/icons-material/Visibility";

export interface ExecutiveAIInsight {
  id: number;
  title: string;
  description: string;
  impact: "Baixo" | "Médio" | "Alto";
  confidence: number;
}

export interface ExecutiveAIInsightsCardProps {
  insights: ExecutiveAIInsight[];
  onOpen?: (id: number) => void;
}

export default function ExecutiveAIInsightsCard({
  insights,
  onOpen,
}: ExecutiveAIInsightsCardProps) {
  function getColor(
    impact: ExecutiveAIInsight["impact"],
  ): "success" | "warning" | "error" {
    switch (impact) {
      case "Alto":
        return "error";

      case "Médio":
        return "warning";

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
          <InsightsIcon color="primary" />
          Insights da IA
        </Box>

        <Stack spacing={2}>

          {insights.map((insight) => (
            <Card
              key={insight.id}
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
                    {insight.title}
                  </Box>

                  <Chip
                    color={getColor(insight.impact)}
                    label={`${insight.confidence}%`}
                  />
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                    mb: 3,
                  }}
                >
                  {insight.description}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <Button
                    variant="contained"
                    startIcon={<VisibilityIcon />}
                    onClick={() =>
                      onOpen?.(insight.id)
                    }
                  >
                    Ver Insight
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
