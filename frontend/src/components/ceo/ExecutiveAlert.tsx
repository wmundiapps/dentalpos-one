import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import type {
  CEOAlertStatus,
  CEOPriority,
} from "../../types/ceo";

type PriorityColor =
  | "error"
  | "warning"
  | "info"
  | "success";

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

function getPriorityColor(
  priority: CEOPriority,
): PriorityColor {
  switch (priority) {
    case "Crítica":
      return "error";

    case "Alta":
      return "warning";

    case "Média":
      return "info";

    case "Baixa":
      return "success";
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
  const priorityColor = getPriorityColor(priority);

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
              minWidth: 0,
            }}
          >
            <WarningAmberIcon color={priorityColor} />

            <Box
              sx={{
                minWidth: 0,
              }}
            >
              <Box
                component="h3"
                sx={{
                  m: 0,
                  fontSize: "1.25rem",
                  lineHeight: 1.4,
                  fontWeight: 800,
                  color: "text.primary",
                }}
              >
                {title}
              </Box>

              <Box
                component="p"
                sx={{
                  m: 0,
                  mt: 0.5,
                  fontSize: "0.875rem",
                  lineHeight: 1.5,
                  color: "text.secondary",
                }}
              >
                {area}
                {createdAt ? ` • ${createdAt}` : ""}
              </Box>
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
              color={priorityColor}
            />

            <Chip
              size="small"
              label={status}
              variant="outlined"
            />
          </Box>
        </Box>

        <Box
          component="p"
          sx={{
            m: 0,
            mt: 2,
            fontSize: "1rem",
            lineHeight: 1.6,
            color: "text.secondary",
          }}
        >
          {description}
        </Box>

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
              variant="outlined"
              label={`Prazo: ${deadline}`}
            />
          )}

          {responsible && (
            <Chip
              size="small"
              variant="outlined"
              label={`Responsável: ${responsible}`}
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
