import {
  Box,
  Chip,
  Paper,
  Typography,
} from "@mui/material";

import PsychologyIcon from "@mui/icons-material/Psychology";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import PageHeader from "../components/PageHeader";
import {
  aiInsights,
  indicators,
} from "../services/BusinessIntelligenceService";

export default function BusinessIntelligence() {
  return (
    <Box>
      <PageHeader
        title="Centro de Inteligência"
        description="Painel executivo com indicadores, alertas e recomendações da IA."
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, 1fr)",
            xl: "repeat(4, 1fr)",
          },
          gap: 3,
          mb: 4,
        }}
      >
        {indicators.map((indicator) => (
          <Paper
            key={indicator.id}
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography color="text.secondary">
              {indicator.title}
            </Typography>

            <Typography
              variant="h4"
              sx={{
                mt: 1,
                fontWeight: 900,
              }}
            >
              {indicator.value}
            </Typography>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mt: 1,
              }}
            >
              {indicator.positive ? (
                <TrendingUpIcon color="success" />
              ) : (
                <TrendingDownIcon color="error" />
              )}

              <Typography
                sx={{
                  fontWeight: 800,
                  color: indicator.positive
                    ? "success.main"
                    : "error.main",
                }}
              >
                {indicator.variation > 0 ? "+" : ""}
                {indicator.variation}%
              </Typography>
            </Box>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 1,
              }}
            >
              {indicator.description}
            </Typography>
          </Paper>
        ))}
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            mb: 3,
          }}
        >
          <PsychologyIcon color="primary" />

          <Typography
            variant="h5"
            sx={{
              fontWeight: 900,
            }}
          >
            Insights da IA
          </Typography>
        </Box>

        {aiInsights.map((insight) => (
          <Paper
            key={insight.id}
            variant="outlined"
            sx={{
              p: 2.5,
              mb: 2,
              borderRadius: 2,
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 2,
                mb: 1.5,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <WarningAmberIcon
                  color={
                    insight.priority === "Alta"
                      ? "error"
                      : insight.priority === "Média"
                        ? "warning"
                        : "success"
                  }
                />

                <Typography
                  sx={{
                    fontWeight: 900,
                  }}
                >
                  {insight.title}
                </Typography>
              </Box>

              <Chip
                size="small"
                label={insight.priority}
                color={
                  insight.priority === "Alta"
                    ? "error"
                    : insight.priority === "Média"
                      ? "warning"
                      : "success"
                }
              />
            </Box>

            <Typography color="text.secondary">
              {insight.description}
            </Typography>

            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 1,
                mt: 2,
                p: 2,
                borderRadius: 2,
                bgcolor: "background.default",
              }}
            >
              <PsychologyIcon
                color="primary"
                fontSize="small"
              />

              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 900,
                  }}
                >
                  Recomendação da IA
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  {insight.recommendation}
                </Typography>
              </Box>
            </Box>
          </Paper>
        ))}
      </Paper>
    </Box>
  );
}