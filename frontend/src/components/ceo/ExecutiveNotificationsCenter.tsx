import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveNotification {
  id: number;
  title: string;
  description: string;
  level: "success" | "warning" | "error" | "info";
}

export interface ExecutiveNotificationsCenterProps {
  notifications: ExecutiveNotification[];
}

export default function ExecutiveNotificationsCenter({
  notifications,
}: ExecutiveNotificationsCenterProps) {
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
            m: 0,
            mb: 3,
            fontSize: "1.2rem",
            fontWeight: 800,
          }}
        >
          Central de Notificações
        </Box>

        {notifications.map((notification, index) => (
          <Box key={notification.id}>

            <Box
              sx={{
                py: 2,
              }}
            >
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
                  {notification.title}
                </Box>

                <Chip
                  size="small"
                  color={notification.level}
                  label={notification.level.toUpperCase()}
                />
              </Box>

              <Box
                sx={{
                  color: "text.secondary",
                  lineHeight: 1.6,
                }}
              >
                {notification.description}
              </Box>
            </Box>

            {index < notifications.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
