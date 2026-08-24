import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

import SmartToyIcon from "@mui/icons-material/SmartToy";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

export interface ExecutiveCopilotSuggestion {
  id: number;
  title: string;
  description: string;
  impact: string;
}

export interface ExecutiveAICopilotCardProps {
  suggestions: ExecutiveCopilotSuggestion[];
  onExecute?: (id: number) => void;
}

export default function ExecutiveAICopilotCard({
  suggestions,
  onExecute,
}: ExecutiveAICopilotCardProps) {
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
            display: "flex",
            alignItems: "center",
            gap: 1,
            fontWeight: 800,
            fontSize: "1.2rem",
          }}
        >
          <SmartToyIcon color="primary" />
          CEO Copilot
        </Box>

        <Stack spacing={2}>

          {suggestions.map((suggestion) => (
            <Card
              key={suggestion.id}
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
                    component="span"
                    sx={{
                      fontWeight: 700,
                    }}
                  >
                    {suggestion.title}
                  </Box>

                  <Chip
                    color="primary"
                    label={suggestion.impact}
                  />
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                    mb: 3,
                  }}
                >
                  {suggestion.description}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <Button
                    variant="contained"
                    startIcon={<PlayArrowIcon />}
                    onClick={() =>
                      onExecute?.(suggestion.id)
                    }
                  >
                    Executar
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
