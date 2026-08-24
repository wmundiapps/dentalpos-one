import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveAIAdvice {
  id: number;
  subject: string;
  recommendation: string;
  expectedBenefit: string;
  priority: "Baixa" | "Média" | "Alta" | "Crítica";
}

export interface ExecutiveAIAdvisorCardProps {
  advices: ExecutiveAIAdvice[];
}

export default function ExecutiveAIAdvisorCard({
  advices,
}: ExecutiveAIAdvisorCardProps) {
  function getColor(
    priority: ExecutiveAIAdvice["priority"],
  ): "success" | "info" | "warning" | "error" {
    switch (priority) {
      case "Crítica":
        return "error";

      case "Alta":
        return "warning";

      case "Média":
        return "info";

      default:
        return "success";
    }
  }

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
          Conselheiro IA
        </Box>

        {advices.map((advice, index) => (
          <Box key={advice.id}>

            <Box
              sx={{
                py: 2,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <Box sx={{ flex: 1 }}>

                <Box
                  component="div"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {advice.subject}
                </Box>

                <Box
                  component="div"
                  sx={{
                    mt: 1,
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  {advice.recommendation}
                </Box>

                <Box
                  component="div"
                  sx={{
                    mt: 1,
                    color: "success.main",
                    fontWeight: 700,
                  }}
                >
                  {advice.expectedBenefit}
                </Box>

              </Box>

              <Chip
                color={getColor(advice.priority)}
                label={advice.priority}
              />

            </Box>

            {index < advices.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
