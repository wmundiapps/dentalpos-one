import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveReminder {
  id: number;
  title: string;
  dueDate: string;
  amount: number;
  reminderType:
    | "Previsão Mensal"
    | "7 dias"
    | "1 dia"
    | "Hoje";
}

export interface ExecutiveReminderCenterCardProps {
  reminders: ExecutiveReminder[];
}

export default function ExecutiveReminderCenterCard({
  reminders,
}: ExecutiveReminderCenterCardProps) {
  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  function getColor(
    type: ExecutiveReminder["reminderType"],
  ): "info" | "warning" | "error" | "success" {
    switch (type) {
      case "Hoje":
        return "error";

      case "1 dia":
        return "warning";

      case "7 dias":
        return "info";

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
            m: 0,
            mb: 3,
            fontWeight: 800,
            fontSize: "1.2rem",
          }}
        >
          Central de Lembretes
        </Box>

        {reminders.map((reminder, index) => (
          <Box key={reminder.id}>

            <Box
              sx={{
                py: 2,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Box>

                <Box
                  component="div"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {reminder.title}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  {reminder.dueDate}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "primary.main",
                    fontWeight: 700,
                  }}
                >
                  {money(reminder.amount)}
                </Box>

              </Box>

              <Chip
                color={getColor(reminder.reminderType)}
                label={reminder.reminderType}
              />

            </Box>

            {index < reminders.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
