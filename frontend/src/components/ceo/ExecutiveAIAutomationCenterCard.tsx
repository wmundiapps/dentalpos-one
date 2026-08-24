import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Switch,
} from "@mui/material";

import AutoModeIcon from "@mui/icons-material/AutoMode";

export interface ExecutiveAutomation {
  id: number;
  name: string;
  description: string;
  active: boolean;
  executionsToday: number;
}

export interface ExecutiveAIAutomationCenterCardProps {
  automations: ExecutiveAutomation[];
  onToggle?: (id: number) => void;
  onEdit?: (id: number) => void;
}

export default function ExecutiveAIAutomationCenterCard({
  automations,
  onToggle,
  onEdit,
}: ExecutiveAIAutomationCenterCardProps) {
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
          <AutoModeIcon color="primary" />
          Central de Automações IA
        </Box>

        <Stack spacing={2}>

          {automations.map((automation) => (

            <Card
              key={automation.id}
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
                    {automation.name}
                  </Box>

                  <Switch
                    checked={automation.active}
                    onChange={() =>
                      onToggle?.(automation.id)
                    }
                  />
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                    mb: 2,
                  }}
                >
                  {automation.description}
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
                      automation.active
                        ? "success"
                        : "default"
                    }
                    label={`${automation.executionsToday} execuções hoje`}
                  />

                  <Button
                    variant="contained"
                    onClick={() =>
                      onEdit?.(automation.id)
                    }
                  >
                    Editar
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
