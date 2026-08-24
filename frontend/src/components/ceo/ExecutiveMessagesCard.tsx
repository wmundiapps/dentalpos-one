import {
  Box,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

export interface ExecutiveMessage {
  id: number;
  sender: string;
  subject: string;
  priority: "success" | "warning" | "error" | "info";
}

export interface ExecutiveMessagesCardProps {
  messages: ExecutiveMessage[];
}

export default function ExecutiveMessagesCard({
  messages,
}: ExecutiveMessagesCardProps) {
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
          Mensagens Importantes
        </Box>

        {messages.map((message) => (
          <Box
            key={message.id}
            sx={{
              mb: 2,
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
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
                {message.sender}
              </Box>

              <Chip
                size="small"
                color={message.priority}
                label={message.priority.toUpperCase()}
              />
            </Box>

            <Box
              sx={{
                color: "text.secondary",
              }}
            >
              {message.subject}
            </Box>
          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
