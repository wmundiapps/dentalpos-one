import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Switch,
} from "@mui/material";

import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff";

export interface ExecutiveAutopilotRule {
  id: number;
  title: string;
  description: string;
  enabled: boolean;
}

export interface ExecutiveAIAutopilotCardProps {
  rules: ExecutiveAutopilotRule[];
  onToggle?: (id: number) => void;
  onConfigure?: (id: number) => void;
}

export default function ExecutiveAIAutopilotCard({
  rules,
  onToggle,
  onConfigure,
}: ExecutiveAIAutopilotCardProps) {
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
          <FlightTakeoffIcon color="primary" />
          Piloto Automático IA
        </Box>

        <Stack spacing={2}>

          {rules.map((rule) => (

            <Card
              key={rule.id}
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
                    {rule.title}
                  </Box>

                  <Switch
                    checked={rule.enabled}
                    onChange={() =>
                      onToggle?.(rule.id)
                    }
                  />
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                    mb: 3,
                  }}
                >
                  {rule.description}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Chip
                    color={
                      rule.enabled
                        ? "success"
                        : "default"
                    }
                    label={
                      rule.enabled
                        ? "Ativo"
                        : "Inativo"
                    }
                  />

                  <Button
                    variant="contained"
                    onClick={() =>
                      onConfigure?.(rule.id)
                    }
                  >
                    Configurar
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
