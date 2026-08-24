import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

import AccountTreeIcon from "@mui/icons-material/AccountTree";
import PsychologyAltIcon from "@mui/icons-material/PsychologyAlt";

export interface ExecutiveReasoning {
  id: number;
  question: string;
  conclusion: string;
  confidence: number;
  status: "Analisando" | "Concluído" | "Revisar";
}

export interface ExecutiveAIReasoningEngineCardProps {
  reasoning: ExecutiveReasoning[];
  onDetails?: (id: number) => void;
}

export default function ExecutiveAIReasoningEngineCard({
  reasoning,
  onDetails,
}: ExecutiveAIReasoningEngineCardProps) {
  function getColor(
    status: ExecutiveReasoning["status"],
  ): "info" | "success" | "warning" {
    switch (status) {
      case "Concluído":
        return "success";

      case "Revisar":
        return "warning";

      default:
        return "info";
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
          <AccountTreeIcon color="primary" />
          Motor de Raciocínio IA
        </Box>

        <Stack spacing={2}>

          {reasoning.map((item) => (
            <Card
              key={item.id}
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
                    {item.question}
                  </Box>

                  <Chip
                    color={getColor(item.status)}
                    label={`${item.confidence}%`}
                  />
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                    mb: 3,
                  }}
                >
                  {item.conclusion}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <Button
                    variant="contained"
                    startIcon={<PsychologyAltIcon />}
                    onClick={() =>
                      onDetails?.(item.id)
                    }
                  >
                    Ver Análise
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
