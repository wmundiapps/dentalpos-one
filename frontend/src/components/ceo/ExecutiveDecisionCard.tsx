import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

export interface ExecutiveDecisionCardProps {
  title: string;
  summary: string;
  recommendation: string;
  impact: string;
  confidence: number;
  onApprove?: () => void;
  onReject?: () => void;
}

export default function ExecutiveDecisionCard({
  title,
  summary,
  recommendation,
  impact,
  confidence,
  onApprove,
  onReject,
}: ExecutiveDecisionCardProps) {
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
          component="h3"
          sx={{
            m: 0,
            fontSize: "1.2rem",
            fontWeight: 800,
          }}
        >
          {title}
        </Box>

        <Box
          component="p"
          sx={{
            mt: 2,
            mb: 0,
            color: "text.secondary",
            lineHeight: 1.7,
          }}
        >
          {summary}
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
            component="strong"
            sx={{
              display: "block",
              mb: 1,
            }}
          >
            Recomendação da IA
          </Box>

          <Box
            component="p"
            sx={{
              m: 0,
            }}
          >
            {recommendation}
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            mt: 3,
          }}
        >
          <Chip
            color="info"
            label={`Impacto: ${impact}`}
          />

          <Chip
            color="success"
            label={`Confiança: ${confidence}%`}
          />
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 2,
            mt: 4,
          }}
        >
          <Button
            variant="outlined"
            color="error"
            onClick={onReject}
          >
            Rejeitar
          </Button>

          <Button
            variant="contained"
            onClick={onApprove}
          >
            Aprovar
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
