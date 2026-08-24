import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";

export interface ExecutiveAIControl {
  id: number;
  module: string;
  status: "Online" | "Offline" | "Processando";
  description: string;
}

export interface ExecutiveAIControlCenterCardProps {
  controls: ExecutiveAIControl[];
  onOpen?: (id: number) => void;
}

export default function ExecutiveAIControlCenterCard({
  controls,
  onOpen,
}: ExecutiveAIControlCenterCardProps) {
  function getColor(
    status: ExecutiveAIControl["status"],
  ): "success" | "warning" | "error" {
    switch (status) {
      case "Online":
        return "success";

      case "Processando":
        return "warning";

      default:
        return "error";
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
          <AdminPanelSettingsIcon color="primary" />
          Central de Controle da IA
        </Box>

        <Stack spacing={2}>

          {controls.map((control) => (
            <Card
              key={control.id}
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
                    {control.module}
                  </Box>

                  <Chip
                    color={getColor(control.status)}
                    label={control.status}
                  />
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                    mb: 3,
                  }}
                >
                  {control.description}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <Button
                    variant="contained"
                    onClick={() =>
                      onOpen?.(control.id)
                    }
                  >
                    Gerenciar
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
