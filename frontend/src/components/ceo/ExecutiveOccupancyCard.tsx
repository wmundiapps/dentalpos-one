import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveOccupancyCardProps {
  occupancy: number;
  availableHours: number;
  bookedHours: number;
  idleHours: number;
}

export default function ExecutiveOccupancyCard({
  occupancy,
  availableHours,
  bookedHours,
  idleHours,
}: ExecutiveOccupancyCardProps) {
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
          Ocupação da Clínica
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Horas Disponíveis
          </Box>

          <Box>{availableHours} h</Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Horas Agendadas
          </Box>

          <Box
            sx={{
              color: "success.main",
              fontWeight: 700,
            }}
          >
            {bookedHours} h
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Horas Ociosas
          </Box>

          <Box
            sx={{
              color: "warning.main",
              fontWeight: 700,
            }}
          >
            {idleHours} h
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={Math.min(occupancy, 100)}
          sx={{
            height: 10,
            borderRadius: 10,
          }}
        />

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mt: 2,
          }}
        >
          <Chip
            color={
              occupancy >= 90
                ? "success"
                : occupancy >= 75
                ? "warning"
                : "error"
            }
            label={`${occupancy.toFixed(1)}%`}
          />
        </Box>

      </CardContent>
    </Card>
  );
}
