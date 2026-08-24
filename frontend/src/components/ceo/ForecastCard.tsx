import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Typography,
} from "@mui/material";

import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";

export interface ForecastCardProps {
  title: string;
  period: string;
  currentValue: number;
  projectedValue: number;
  variationPercent: number;
  confidencePercent: number;
}

export default function ForecastCard({
  title,
  period,
  currentValue,
  projectedValue,
  variationPercent,
  confidencePercent,
}: ForecastCardProps) {
  const confidence = Math.max(
    0,
    Math.min(confidencePercent, 100)
  );

  const positive = variationPercent >= 0;

  return (
    <Card
      elevation={0}
      sx={{
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
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
              }}
            >
              {title}
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
            >
              {period}
            </Typography>
          </Box>

          <Chip
            size="small"
            variant="outlined"
            label={`${confidence}% confiança`}
          />
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "1fr 1fr",
            },
            gap: 2,
            mt: 3,
          }}
        >
          <Box
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              p: 2,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
            >
              Valor Atual
            </Typography>

            <Typography
              variant="h6"
              sx={{
                mt: 1,
                fontWeight: 700,
              }}
            >
              {currentValue.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </Typography>
          </Box>

          <Box
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              p: 2,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
            >
              Projeção
            </Typography>

            <Typography
              variant="h6"
              sx={{
                mt: 1,
                fontWeight: 700,
              }}
            >
              {projectedValue.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mt: 3,
          }}
        >
          {positive ? (
            <TrendingUpIcon color="success" />
          ) : (
            <TrendingDownIcon color="error" />
          )}

          <Typography
            sx={{
              fontWeight: 700,
              color: positive
                ? "success.main"
                : "error.main",
            }}
          >
            {positive ? "+" : ""}
            {variationPercent.toFixed(1)}%
          </Typography>
        </Box>

        <Box sx={{ mt: 3 }}>
          <Typography
            variant="caption"
            color="text.secondary"
          >
            Confiança da previsão
          </Typography>

          <LinearProgress
            variant="determinate"
            value={confidence}
            sx={{
              mt: 1,
              height: 8,
              borderRadius: 5,
            }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
