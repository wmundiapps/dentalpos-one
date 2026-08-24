import {
  Box,
  Button,
  Chip,
  Paper,
  Typography,
} from "@mui/material";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import ErrorIcon from "@mui/icons-material/Error";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";
import { notifications } from "../services/NotificationService";
import type { Notification } from "../types/notification";

function getNotificationIcon(
  type: Notification["tipo"],
): ReactNode {
  switch (type) {
    case "success":
      return <CheckCircleIcon color="success" />;

    case "warning":
      return <WarningAmberIcon color="warning" />;

    case "error":
      return <ErrorIcon color="error" />;

    default:
      return <InfoOutlinedIcon color="info" />;
  }
}

function getNotificationColor(
  type: Notification["tipo"],
) {
  switch (type) {
    case "success":
      return "success" as const;

    case "warning":
      return "warning" as const;

    case "error":
      return "error" as const;

    default:
      return "info" as const;
  }
}

export default function Notifications() {
  const unreadNotifications = notifications.filter(
    (notification) => !notification.lida,
  );

  const readNotifications = notifications.filter(
    (notification) => notification.lida,
  );

  return (
    <Box>
      <PageHeader
        title="Central de Notificações"
        description="Alertas clínicos, financeiros, operacionais e administrativos."
        actionLabel="Marcar todas como lidas"
        actionIcon={<DoneAllIcon />}
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(3, 1fr)",
          },
          gap: 3,
          mb: 4,
        }}
      >
        <NotificationSummary
          title="Total de notificações"
          value={String(notifications.length)}
        />

        <NotificationSummary
          title="Não lidas"
          value={String(unreadNotifications.length)}
        />

        <NotificationSummary
          title="Lidas"
          value={String(readNotifications.length)}
        />
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            mb: 3,
          }}
        >
          <NotificationsActiveIcon color="primary" />

          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
            }}
          >
            Notificações recentes
          </Typography>
        </Box>

        {notifications.map((notification) => (
          <Paper
            key={notification.id}
            elevation={0}
            sx={{
              p: 2.5,
              mb: 2,
              borderRadius: 2,
              border: "1px solid",
              borderColor: notification.lida
                ? "divider"
                : "primary.main",
              bgcolor: notification.lida
                ? "background.paper"
                : "action.hover",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 2,
              }}
            >
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: 2,
                  bgcolor: "background.default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {getNotificationIcon(notification.tipo)}
              </Box>

              <Box sx={{ flexGrow: 1 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 2,
                    flexWrap: "wrap",
                  }}
                >
                  <Box>
                    <Typography
                      sx={{
                        fontWeight: 800,
                      }}
                    >
                      {notification.titulo}
                    </Typography>

                    <Typography
                      color="text.secondary"
                      sx={{
                        mt: 0.5,
                      }}
                    >
                      {notification.descricao}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      flexWrap: "wrap",
                    }}
                  >
                    <Chip
                      size="small"
                      label={notification.tipo}
                      color={getNotificationColor(
                        notification.tipo,
                      )}
                    />

                    <Chip
                      size="small"
                      label={
                        notification.lida
                          ? "Lida"
                          : "Não lida"
                      }
                      variant={
                        notification.lida
                          ? "outlined"
                          : "filled"
                      }
                    />
                  </Box>
                </Box>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: "block",
                    mt: 1.5,
                  }}
                >
                  {notification.data}
                </Typography>

                {!notification.lida && (
                  <Button
                    size="small"
                    sx={{
                      mt: 1.5,
                      px: 0,
                    }}
                  >
                    Marcar como lida
                  </Button>
                )}
              </Box>
            </Box>
          </Paper>
        ))}
      </Paper>
    </Box>
  );
}

interface NotificationSummaryProps {
  title: string;
  value: string;
}

function NotificationSummary({
  title,
  value,
}: NotificationSummaryProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography color="text.secondary">
        {title}
      </Typography>

      <Typography
        variant="h4"
        sx={{
          mt: 1,
          fontWeight: 900,
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}