import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

import GavelIcon from "@mui/icons-material/Gavel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

export interface ExecutiveDecisionEngineItem {
  id: number;
  title: string;
  analysis: string;
  confidence: number;
  decision: string;
}

export interface ExecutiveAIDecisionEngineCardProps {
  decisions: ExecutiveDecisionEngineItem[];
  onApprove?: (id: number) => void;
}

export default function ExecutiveAIDecisionEngineCard({
  decisions,
  onApprove,
}: ExecutiveAIDecisionEngineCardProps) {
  function getColor(confidence: number) {
    if (confidence >= 90) return "success";
    if (confidence >= 70) return "warning";
    return "error";
  }

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        height: "100%",
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
          <GavelIcon color="primary" />
          Motor de Decisão IA
        </Box>

        <Stack spacing={2}>

          {decisions.map((decision) => (

            <Card
              key={decision.id}
              variant="outlined"
            >
              <CardContent>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    mb: 2,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      fontWeight: 700,
                    }}
                  >
                    {decision.title}
                  </Box>

                  <Chip
                    color={getColor(decision.confidence)}
                    label={`${decision.confidence}%`}
                  />
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                    mb: 2,
                  }}
                >
                  {decision.analysis}
                </Box>

                <Box
                  sx={{
                    fontWeight: 700,
                    color: "primary.main",
                    mb: 3,
                  }}
                >
                  {decision.decision}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <Button
                    variant="contained"
                    startIcon={<CheckCircleIcon />}
                    onClick={() =>
                      onApprove?.(decision.id)
                    }
                  >
                    Aprovar
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
