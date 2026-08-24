import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

export interface ExecutiveAction {
  id: number;
  title: string;
  description: string;
  category: string;
  priority: "success" | "warning" | "error" | "info";
}

export interface ExecutiveActionCenterProps {
  actions: ExecutiveAction[];
  onExecute?: (id: number) => void;
}

export default function ExecutiveActionCenter({
  actions,
  onExecute,
}: ExecutiveActionCenterProps) {
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
          Central de Ações
        </Box>

        <Stack spacing={2}>

          {actions.map((action) => (
            <Card
              key={action.id}
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
                    {action.title}
                  </Box>

                  <Chip
                    size="small"
                    color={action.priority}
                    label={action.category}
                  />
                </Box>

                <Box
                  component="p"
                  sx={{
                    m: 0,
                    color: "text.secondary",
                    lineHeight: 1.6,
                  }}
                >
                  {action.description}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                    mt: 3,
                  }}
                >
                  <Button
                    variant="contained"
                    onClick={() =>
                      onExecute?.(action.id)
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
