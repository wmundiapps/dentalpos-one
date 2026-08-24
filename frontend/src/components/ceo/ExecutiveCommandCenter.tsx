import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

export interface ExecutiveCommand {
  id: number;
  title: string;
  description: string;
  priority: "success" | "warning" | "error" | "info";
  action: string;
}

export interface ExecutiveCommandCenterProps {
  commands: ExecutiveCommand[];
  onExecute?: (id: number) => void;
}

export default function ExecutiveCommandCenter({
  commands,
  onExecute,
}: ExecutiveCommandCenterProps) {
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
          component="h2"
          sx={{
            m: 0,
            mb: 3,
            fontWeight: 800,
            fontSize: "1.2rem",
          }}
        >
          Central de Comandos
        </Box>

        <Stack spacing={2}>

          {commands.map((command) => (
            <Card
              key={command.id}
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
                    {command.title}
                  </Box>

                  <Chip
                    size="small"
                    color={command.priority}
                    label={command.priority.toUpperCase()}
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
                  {command.description}
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
                      onExecute?.(command.id)
                    }
                  >
                    {command.action}
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
