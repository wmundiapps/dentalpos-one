import {
  Box,
  Card,
  CardContent,
  LinearProgress,
  Typography,
} from "@mui/material";

export interface ExecutiveScoreProps {
  score: number;
  previousScore?: number;
  healthLevel?: string;
  executiveMessage?: string;
  title?: string;
  subtitle?: string;
}

export default function ExecutiveScore({
  score,
  previousScore,
  healthLevel,
  executiveMessage,
  title = "Score Executivo",
  subtitle,
}: ExecutiveScoreProps) {
  const color =
    score >= 85
      ? "success.main"
      : score >= 70
      ? "warning.main"
      : "error.main";

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
        <Typography
          variant="h6"
          gutterBottom
          sx={{
            fontWeight: 700,
          }}
        >
          {title}
        </Typography>

        {subtitle && (
          <Typography
            variant="body2"
            color="text.secondary"
            gutterBottom
          >
            {subtitle}
          </Typography>
        )}

        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            mt: 3,
            mb: 3,
          }}
        >
          <Box
            sx={{
              width: 170,
              height: 170,
              borderRadius: "50%",
              border: "10px solid",
              borderColor: color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography
              variant="h3"
              color={color}
              sx={{
                fontWeight: 800,
              }}
            >
              {score}
            </Typography>
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={score}
          sx={{
            height: 10,
            borderRadius: 10,
            mb: 2,
          }}
        />

        {previousScore !== undefined && (
          <Typography variant="body2">
            Score anterior: {previousScore}
          </Typography>
        )}

        {healthLevel && (
          <Typography variant="body2">
            Nível: {healthLevel}
          </Typography>
        )}

        {executiveMessage && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1 }}
          >
            {executiveMessage}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}