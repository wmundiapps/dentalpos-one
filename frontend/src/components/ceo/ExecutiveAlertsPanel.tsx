import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

export interface ExecutiveAlertItem {
  id: number;
  title: string;
  message: string;
  priority: "Crítica" | "Alta" | "Média" | "Baixa";
}

export interface ExecutiveAlertsPanelProps {
  alerts: ExecutiveAlertItem[];
}

export default function ExecutiveAlertsPanel({
  alerts,
}: ExecutiveAlertsPanelProps) {
  function severity(
    priority: ExecutiveAlertItem["priority"],
  ): "error" | "warning" | "info" | "success" {
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
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        height: "100%",
      }}
    >
      <CardContent>

        <Box
          component="h2"
          sx={{
            m: 0,
            mb: 3,
            fontWeight: 800,
            fontSize: "1.2rem",
          }}
        >
          Alertas Executivos
        </Box>

        {alerts.map((alert) => (
          <Alert
            key={alert.id}
            severity={severity(alert.priority)}
            sx={{
              mb: 2,
              alignItems: "flex-start",
            }}
            action={
              <Chip
                size="small"
                label={alert.priority}
                color={severity(alert.priority)}
              />
            }
          >
            <Box
              component="div"
              sx={{
                fontWeight: 700,
                mb: .5,
              }}
            >
              {alert.title}
            </Box>

            <Box component="div">
              {alert.message}
            </Box>
          </Alert>
        ))}

      </CardContent>
    </Card>
  );
}
