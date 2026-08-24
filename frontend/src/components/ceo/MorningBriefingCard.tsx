import {
  Box,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Typography,
} from "@mui/material";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import type { CEOPriority } from "../../types/ceo";

export interface MorningBriefingCardProps {
  title: string;
  description: string;
  area: string;
  priority: CEOPriority;
  completed: boolean;
  onToggle?: () => void;
}

function getPriorityColor(priority: CEOPriority) {
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

export default function MorningBriefingCard({
  title,
  description,
  area,
  priority,
  completed,
  onToggle,
}: MorningBriefingCardProps) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        opacity: completed ? 0.75 : 1,
      }}
    >
      <CardContent>
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 2,
          }}
        >
          {onToggle ? (
            <Checkbox
              checked={completed}
              onChange={onToggle}
              sx={{ p: 0 }}
            />
          ) : completed ? (
            <CheckCircleIcon color="success" />
          ) : (
            <WarningAmberIcon
              color={getPriorityColor(priority)}
            />
          )}

          <Box sx={{ flex: 1 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: 2,
              }}
            >
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 700,
                    textDecoration: completed
                      ? "line-through"
                      : "none",
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

              <Chip
                size="small"
                color={getPriorityColor(priority)}
                label={priority}
              />
            </Box>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 1.5,
              }}
            >
              {description}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
