import {
  Box,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";

export interface ExecutiveNotification {
  id: number;
  title: string;
  description: string;
  time: string;
  priority: "success" | "info" | "warning" | "error";
}

export interface ExecutiveNotificationCardProps {
  notifications: ExecutiveNotification[];
}

export default function ExecutiveNotificationCard({
  notifications,
}: ExecutiveNotificationCardProps) {
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
            fontWeight: 800,
            fontSize: "1.2rem",
          }}
        >
          Notificações
        </Box>

        <List disablePadding>
          {notifications.map((notification) => (
            <ListItem
              key={notification.id}
              disablePadding
              sx={{
                py: 1.5,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              <ListItemText
                primary={notification.title}
                secondary={notification.description}
              />

              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 1,
                }}
              >
                <Chip
                  size="small"
                  color={notification.priority}
                  label={notification.time}
                />
              </Box>
            </ListItem>
          ))}
        </List>

      </CardContent>
    </Card>
  );
}
