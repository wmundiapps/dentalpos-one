import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

export interface ExecutiveAssistantSuggestion {
  id: number;
  title: string;
  description: string;
  impact: string;
}

export interface ExecutiveAICEOAssistantCardProps {
  suggestions: ExecutiveAssistantSuggestion[];
  onExecute?: (id: number) => void;
}

export default function ExecutiveAICEOAssistantCard({
  suggestions,
  onExecute,
}: ExecutiveAICEOAssistantCardProps) {
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
          <SupportAgentIcon color="primary" />
          Assistente Executivo IA
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
                    endIcon={<ArrowForwardIcon />}
                    onClick={() =>
                      onExecute?.(suggestion.id)
                    }
                  >
                    Aplicar
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
