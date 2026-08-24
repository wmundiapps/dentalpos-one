import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
} from "@mui/material";

import SendIcon from "@mui/icons-material/Send";

import { useState } from "react";

export interface ExecutiveAIChatCardProps {
  onSend?: (message: string) => void;
}

export default function ExecutiveAIChatCard({
  onSend,
}: ExecutiveAIChatCardProps) {
  const [message, setMessage] = useState("");

  function handleSend() {
    const text = message.trim();

    if (!text) {
      return;
    }

    onSend?.(text);
    setMessage("");
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
            m: 0,
            mb: 3,
            fontSize: "1.2rem",
            fontWeight: 800,
          }}
        >
          CEO IA
        </Box>

        <Stack spacing={2}>

          <TextField
            fullWidth
            multiline
            minRows={5}
            value={message}
            placeholder="Pergunte qualquer coisa para o CEO IA..."
            onChange={(event) =>
              setMessage(event.target.value)
            }
          />

          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <Button
              variant="contained"
              endIcon={<SendIcon />}
              disabled={!message.trim()}
              onClick={handleSend}
            >
              Enviar
            </Button>
          </Box>

        </Stack>

      </CardContent>
    </Card>
  );
}
