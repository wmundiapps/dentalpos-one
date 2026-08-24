import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";

export interface ExecutiveAIVoiceCardProps {
  listening: boolean;
  transcript?: string;
  onStart?: () => void;
  onStop?: () => void;
}

export default function ExecutiveAIVoiceCard({
  listening,
  transcript,
  onStart,
  onStop,
}: ExecutiveAIVoiceCardProps) {
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
            m: 0,
            mb: 3,
            fontWeight: 800,
            fontSize: "1.2rem",
          }}
        >
          CEO IA por Voz
        </Box>

        <Stack spacing={3}>

          <Chip
            color={
              listening
                ? "error"
                : "success"
            }
            label={
              listening
                ? "Ouvindo..."
                : "Aguardando comando"
            }
          />

          <Box
            sx={{
              minHeight: 120,
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              color: transcript
                ? "text.primary"
                : "text.secondary",
            }}
          >
            {transcript ||
              "Nenhum comando de voz recebido."}
          </Box>

          <Box
            sx={{
              display: "flex",
              gap: 2,
              justifyContent: "flex-end",
            }}
          >
            <Button
              variant="outlined"
              startIcon={<MicIcon />}
              disabled={listening}
              onClick={onStart}
            >
              Iniciar
            </Button>

            <Button
              variant="contained"
              color="error"
              startIcon={<StopIcon />}
              disabled={!listening}
              onClick={onStop}
            >
              Parar
            </Button>
          </Box>

        </Stack>

      </CardContent>
    </Card>
  );
}
