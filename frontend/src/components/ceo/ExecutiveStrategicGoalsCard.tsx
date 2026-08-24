import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface StrategicGoal {
  id: number;
  title: string;
  progress: number;
  deadline: string;
  responsible: string;
}

export interface ExecutiveStrategicGoalsCardProps {
  goals: StrategicGoal[];
}

export default function ExecutiveStrategicGoalsCard({
  goals,
}: ExecutiveStrategicGoalsCardProps) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        height: "100%",
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
          Metas Estratégicas
        </Box>

        {goals.map((goal) => (
          <Box
            key={goal.id}
            sx={{
              mb: 3,
            }}
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
                  goal.progress >= 100
                    ? "success"
                    : goal.progress >= 70
                    ? "warning"
                    : "error"
                }
                label={`${goal.progress}%`}
              />
            </Box>

            <LinearProgress
              variant="determinate"
              value={Math.min(goal.progress, 100)}
              sx={{
                height: 10,
                borderRadius: 10,
              }}
            />

            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mt: 1,
                color: "text.secondary",
                fontSize: ".85rem",
              }}
            >
              <Box component="span">
                {goal.responsible}
              </Box>

              <Box component="span">
                {goal.deadline}
              </Box>
            </Box>
          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
