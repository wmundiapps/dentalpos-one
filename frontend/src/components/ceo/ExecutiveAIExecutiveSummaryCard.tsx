import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

import SummarizeIcon from "@mui/icons-material/Summarize";
import DescriptionIcon from "@mui/icons-material/Description";

export interface ExecutiveSummaryItem {
  id: number;
  category: string;
  summary: string;
  importance: "Baixa" | "Média" | "Alta" | "Crítica";
}

export interface ExecutiveAIExecutiveSummaryCardProps {
  summaries: ExecutiveSummaryItem[];
  onOpen?: (id: number) => void;
}

export default function ExecutiveAIExecutiveSummaryCard({
  summaries,
  onOpen,
}: ExecutiveAIExecutiveSummaryCardProps) {
  function getColor(
    importance: ExecutiveSummaryItem["importance"],
  ): "success" | "info" | "warning" | "error" {
    switch (importance) {
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
            display: "flex",
            alignItems: "center",
            gap: 1,
            m: 0,
            mb: 3,
            fontWeight: 800,
            fontSize: "1.2rem",
          }}
        >
          <SummarizeIcon color="primary" />
          Resumo Executivo IA
        </Box>

        <Stack spacing={2}>

          {summaries.map((summary) => (
            <Card
              key={summary.id}
              variant="outlined"
            >
              <CardContent>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Box
                    sx={{
                      fontWeight: 700,
                    }}
                  >
                    {summary.category}
                  </Box>

                  <Chip
                    color={getColor(summary.importance)}
                    label={summary.importance}
                  />
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                    mb: 3,
                  }}
                >
                  {summary.summary}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <Button
                    variant="contained"
                    startIcon={<DescriptionIcon />}
                    onClick={() =>
                      onOpen?.(summary.id)
                    }
                  >
                    Abrir Relatório
                  </Button>
                </Box>

              </CardContent>
            </Card>
          ))}

        </Stack>

      </CardContent>
    </Card>
  );
}
