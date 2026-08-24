import {
  Box,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

export interface ExecutiveInsightCardProps {
  title: string;
  insight: string;
  impact: string;
  priority: "Alta" | "Média" | "Baixa";
}

export default function ExecutiveInsightCard({
  title,
  insight,
  impact,
  priority,
}: ExecutiveInsightCardProps) {
  const color =
    priority === "Alta"
      ? "error"
      : priority === "Média"
      ? "warning"
      : "success";

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
            alignItems: "flex-start",
            mb: 2,
          }}
        >
          <Box
            component="h2"
            sx={{
              m: 0,
              fontSize: "1.15rem",
              fontWeight: 800,
            }}
          >
            {title}
          </Box>

          <Chip
            size="small"
            color={color}
            label={priority}
          />
        </Box>

        <Box
          component="p"
          sx={{
            m: 0,
            lineHeight: 1.7,
            color: "text.secondary",
          }}
        >
          {insight}
        </Box>

        <Box
          sx={{
            mt: 3,
            p: 2,
            borderRadius: 2,
            bgcolor: "grey.100",
          }}
        >
          <Box
            component="span"
            sx={{
              fontWeight: 800,
            }}
          >
            Impacto esperado
          </Box>

          <Box
            component="p"
            sx={{
              mt: 1,
              mb: 0,
              color: "success.main",
              fontWeight: 700,
            }}
          >
            {impact}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
