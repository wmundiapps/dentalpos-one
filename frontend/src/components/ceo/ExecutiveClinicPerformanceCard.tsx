import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveClinicPerformanceCardProps {
  attendanceRate: number;
  cancellationRate: number;
  occupancyRate: number;
  patientSatisfaction: number;
}

export default function ExecutiveClinicPerformanceCard({
  attendanceRate,
  cancellationRate,
  occupancyRate,
  patientSatisfaction,
}: ExecutiveClinicPerformanceCardProps) {
  const items = [
    {
      title: "Comparecimento",
      value: attendanceRate,
      color: "success" as const,
    },
    {
      title: "Cancelamentos",
      value: cancellationRate,
      color: "error" as const,
    },
    {
      title: "Ocupação",
      value: occupancyRate,
      color: "info" as const,
    },
    {
      title: "Satisfação",
      value: patientSatisfaction,
      color: "warning" as const,
    },
  ];

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
          Performance Clínica
        </Box>

        {items.map((item) => (
          <Box
            key={item.title}
            sx={{ mb: 3 }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mb: 1,
              }}
            >
              <Box
                component="span"
                sx={{ fontWeight: 700 }}
              >
                {item.title}
              </Box>

              <Chip
                size="small"
                color={item.color}
                label={`${item.value.toFixed(0)}%`}
              />
            </Box>

            <LinearProgress
              variant="determinate"
              value={item.value}
              color={item.color}
              sx={{
                height: 10,
                borderRadius: 10,
              }}
            />
          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
