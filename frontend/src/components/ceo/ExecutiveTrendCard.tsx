import {
  Box,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";

export interface ExecutiveTrendCardProps {
  title: string;
  currentValue: string;
  previousValue: string;
  variation: number;
  description: string;
}

export default function ExecutiveTrendCard({
  title,
  currentValue,
  previousValue,
  variation,
  description,
}: ExecutiveTrendCardProps) {
  const positive = variation >= 0;

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
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box
            component="h2"
            sx={{
              m: 0,
              fontSize: "1.1rem",
              fontWeight: 800,
            }}
          >
            {title}
          </Box>

          <Chip
            icon={
              positive ? (
                <TrendingUpIcon />
              ) : (
                <TrendingDownIcon />
              )
            }
            label={`${positive ? "+" : ""}${variation}%`}
            color={
              positive ? "success" : "error"
            }
            size="small"
          />
        </Box>

        <Box
          component="h1"
          sx={{
            mt: 3,
            mb: 0,
            fontSize: "2.5rem",
            fontWeight: 900,
          }}
        >
          {currentValue}
        </Box>

        <Box
          component="p"
          sx={{
            mt: 1,
            mb: 0,
            color: "text.secondary",
          }}
        >
          Anterior: {previousValue}
        </Box>

        <Box
          component="p"
          sx={{
            mt: 3,
            mb: 0,
            lineHeight: 1.6,
            color: "text.secondary",
          }}
        >
          {description}
        </Box>
      </CardContent>
    </Card>
  );
}
