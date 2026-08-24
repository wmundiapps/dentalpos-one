import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutivePerformanceItem {
  id: number;
  name: string;
  current: number;
  target: number;
}

export interface ExecutivePerformanceCardProps {
  title: string;
  items: ExecutivePerformanceItem[];
}

export default function ExecutivePerformanceCard({
  title,
  items,
}: ExecutivePerformanceCardProps) {
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
          {title}
        </Box>

        {items.map((item) => {
          const progress =
            item.target <= 0
              ? 0
              : Math.min(
                  (item.current / item.target) * 100,
                  100,
                );

          return (
            <Box
              key={item.id}
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
                  {item.name}
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
                  fontSize: ".85rem",
                  color: "text.secondary",
                }}
              >
                <Box>
                  Atual: {item.current}
                </Box>

                <Box>
                  Meta: {item.target}
                </Box>
              </Box>
            </Box>
          );
        })}

      </CardContent>
    </Card>
  );
}
