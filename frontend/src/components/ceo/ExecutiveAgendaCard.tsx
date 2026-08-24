import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveAgendaItem {
  id: number;
  time: string;
  patient: string;
  professional: string;
  procedure: string;
  status: "Agendado" | "Em Atendimento" | "Concluído" | "Cancelado";
}

export interface ExecutiveAgendaCardProps {
  appointments: ExecutiveAgendaItem[];
}

export default function ExecutiveAgendaCard({
  appointments,
}: ExecutiveAgendaCardProps) {
  function getColor(
    status: ExecutiveAgendaItem["status"],
  ): "info" | "warning" | "success" | "error" {
    switch (status) {
      case "Concluído":
        return "success";

      case "Em Atendimento":
        return "warning";

      case "Cancelado":
        return "error";

      default:
        return "info";
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
          Agenda Executiva
        </Box>

        {appointments.map((appointment, index) => (
          <Box key={appointment.id}>

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
                  {appointment.time} • {appointment.patient}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  {appointment.professional}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "text.secondary",
                    fontSize: ".85rem",
                  }}
                >
                  {appointment.procedure}
                </Box>

              </Box>

              <Chip
                size="small"
                color={getColor(appointment.status)}
                label={appointment.status}
              />

            </Box>

            {index < appointments.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
