import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveMonthlyGoal {
  id: number;
  title: string;
  current: number;
  target: number;
}

export interface ExecutiveMonthlyGoalsCardProps {
  goals: ExecutiveMonthlyGoal[];
}

export default function ExecutiveMonthlyGoalsCard({
  goals,
}: ExecutiveMonthlyGoalsCardProps) {
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
          Metas do Mês
        </Box>

        {goals.map((goal) => {
          const progress =
            goal.target <= 0
              ? 0
              : Math.min(
                  (goal.current / goal.target) * 100,
                  100,
                );

          return (
            <Box
              key={goal.id}
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
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {goal.title}
                </Box>

                <Chip
                  size="small"
                  color={
                    progress >= 100
                      ? "success"
                      : progress >= 75
                      ? "warning"
                      : "error"
                  }
                  label={`${progress.toFixed(0)}%`}
                />
              </Box>

              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 10,
                  borderRadius: 10,
                }}
              />

              <Box
                sx={{
                  mt: 1,
                  display: "flex",
                  justifyContent: "space-between",
                  color: "text.secondary",
                  fontSize: ".85rem",
                }}
              >
                <Box>
                  Atual: {goal.current}
                </Box>

                <Box>
                  Meta: {goal.target}
                </Box>
              </Box>
            </Box>
          );
        })}

      </CardContent>
    </Card>
  );
}
