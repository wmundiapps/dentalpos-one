import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Typography,
} from "@mui/material";

import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import type {
  CEOAlertStatus,
  CEOPriority,
} from "../../types/ceo";

export interface ExecutiveAlertProps {
  title: string;
  description: string;
  area: string;
  priority: CEOPriority;
  status: CEOAlertStatus;
  createdAt?: string;
  financialImpact?: number;
  deadline?: string;
  responsible?: string;
  onOpen?: () => void;
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

export default function ExecutiveAlert({
  title,
  description,
  area,
  priority,
  status,
  createdAt,
  financialImpact,
  deadline,
  responsible,
  onOpen,
}: ExecutiveAlertProps) {
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
            <WarningAmberIcon
              color={getPriorityColor(priority)}
            />

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
                {createdAt ? ` • ${createdAt}` : ""}
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
            }}
          >
            <Chip
              size="small"
              label={priority}
              color={getPriorityColor(priority)}
            />

            <Chip
              size="small"
              label={status}
              variant="outlined"
            />
          </Box>
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
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            mt: 2,
          }}
        >
          {financialImpact !== undefined && (
            <Chip
              size="small"
              variant="outlined"
              label={`Impacto: ${financialImpact.toLocaleString(
                "pt-BR",
                {
                  style: "currency",
                  currency: "BRL",
                },
              )}`}
            />
          )}

          {deadline && (
            <Chip
              size="small"
              label={`Prazo: ${deadline}`}
              variant="outlined"
            />
          )}

          {responsible && (
            <Chip
              size="small"
              label={`Responsável: ${responsible}`}
              variant="outlined"
            />
          )}
        </Box>

        {onOpen && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              mt: 3,
            }}
          >
            <Button
              variant="outlined"
              onClick={onOpen}
            >
              Abrir alerta
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
