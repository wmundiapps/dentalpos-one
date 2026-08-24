import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveGoalCardProps {
  title: string;
  current: number;
  target: number;
  unit?: string;
}

export default function ExecutiveGoalCard({
  title,
  current,
  target,
  unit = "",
}: ExecutiveGoalCardProps) {
  const progress =
    target <= 0
      ? 0
      : Math.min((current / target) * 100, 100);

  const color =
    progress >= 100
      ? "success"
      : progress >= 75
      ? "warning"
      : "error";

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
          {title}
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Box component="span">
            Atual
          </Box>

          <Box
            component="span"
            sx={{
              fontWeight: 700,
            }}
          >
            {current} {unit}
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Box component="span">
            Meta
          </Box>

          <Box
            component="span"
            sx={{
              fontWeight: 700,
            }}
          >
            {target} {unit}
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 10,
            borderRadius: 10,
            mb: 2,
          }}
        />

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <Chip
            color={color}
            label={`${progress.toFixed(1)}%`}
          />
        </Box>

      </CardContent>
    </Card>
  );
}
