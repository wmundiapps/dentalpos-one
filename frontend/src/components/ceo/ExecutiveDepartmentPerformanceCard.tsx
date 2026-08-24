import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveDepartmentPerformance {
  id: number;
  department: string;
  score: number;
}

export interface ExecutiveDepartmentPerformanceCardProps {
  departments: ExecutiveDepartmentPerformance[];
}

export default function ExecutiveDepartmentPerformanceCard({
  departments,
}: ExecutiveDepartmentPerformanceCardProps) {
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
          Performance por Departamento
        </Box>

        {departments.map((department) => (
          <Box
            key={department.id}
            sx={{ mb: 3 }}
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
                {department.department}
              </Box>

              <Chip
                color={
                  department.score >= 90
                    ? "success"
                    : department.score >= 70
                    ? "warning"
                    : "error"
                }
                label={`${department.score.toFixed(0)}%`}
              />
            </Box>

            <LinearProgress
              variant="determinate"
              value={department.score}
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
