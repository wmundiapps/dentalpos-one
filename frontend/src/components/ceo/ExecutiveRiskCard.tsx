import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveRiskItem {
  id: number;
  title: string;
  probability: number;
  impact: number;
}

export interface ExecutiveRiskCardProps {
  risks: ExecutiveRiskItem[];
}

export default function ExecutiveRiskCard({
  risks,
}: ExecutiveRiskCardProps) {
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
          Matriz de Riscos
        </Box>

        {risks.map((risk) => {
          const score =
            (risk.probability * risk.impact) / 100;

          const color =
            score >= 70
              ? "error"
              : score >= 40
              ? "warning"
              : "success";

          return (
            <Box
              key={risk.id}
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
                  {risk.title}
                </Box>

                <Chip
                  size="small"
                  color={color}
                  label={`${score.toFixed(0)}%`}
                />
              </Box>

              <LinearProgress
                variant="determinate"
                value={score}
                color={color}
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
                  fontSize: ".85rem",
                  color: "text.secondary",
                }}
              >
                <Box>
                  Prob.: {risk.probability}%
                </Box>

                <Box>
                  Impacto: {risk.impact}%
                </Box>
              </Box>
            </Box>
          );
        })}

      </CardContent>
    </Card>
  );
}
