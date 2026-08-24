import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Typography,
} from "@mui/material";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import type { CEOPriority } from "../../types/ceo";

export interface RecommendationCardProps {
  title: string;
  description: string;
  action: string;
  area: string;
  priority: CEOPriority;
  estimatedImpact: number;
  confidencePercent: number;
  onExecute?: () => void;
}

function getPriorityColor(priority: CEOPriority) {
  switch (priority) {
    case "Crítica":
      return "error" as const;

    case "Alta":
      return "warning" as const;

    case "Média":
      return "info" as const;

    default:
      return "success" as const;
  }
}

export default function RecommendationCard({
  title,
  description,
  action,
  area,
  priority,
  estimatedImpact,
  confidencePercent,
  onExecute,
}: RecommendationCardProps) {
  const confidence = Math.max(
    0,
    Math.min(confidencePercent, 100),
  );

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
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1.5,
              flex: 1,
            }}
          >
            <AutoAwesomeIcon color="primary" />

            <Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                }}
              >
                {title}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                {area}
              </Typography>
            </Box>
          </Box>

          <Chip
            size="small"
            label={priority}
            color={getPriorityColor(priority)}
          />
        </Box>

        <Typography
          color="text.secondary"
          sx={{
            mt: 2,
          }}
        >
          {description}
        </Typography>

        <Box
          sx={{
            p: 2,
            mt: 2,
            borderRadius: 2,
            bgcolor: "background.default",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 800,
            }}
          >
            Ação recomendada
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 1,
            }}
          >
            {action}
          </Typography>

          <Typography
            variant="body2"
            sx={{
              mt: 2,
              fontWeight: 800,
              color: "success.main",
            }}
          >
            Impacto estimado:{" "}
            {estimatedImpact.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </Typography>
        </Box>

        <Box
          sx={{
            mt: 3,
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              gap: 2,
              mb: 1,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
            >
              Confiança da IA
            </Typography>

            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
              }}
            >
              {confidence}%
            </Typography>
          </Box>

          <LinearProgress
            variant="determinate"
            value={confidence}
            sx={{
              height: 8,
              borderRadius: 5,
            }}
          />
        </Box>

        {onExecute && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              mt: 3,
            }}
          >
            <Button
              variant="contained"
              onClick={onExecute}
            >
              Executar
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
