import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";

export interface ExecutiveTask {
  id: number;
  title: string;
  responsible: string;
  deadline: string;
  status: "Pendente" | "Em andamento" | "Concluída";
}

export interface ExecutiveTasksBoardProps {
  tasks: ExecutiveTask[];
  onOpen?: (id: number) => void;
}

export default function ExecutiveTasksBoard({
  tasks,
  onOpen,
}: ExecutiveTasksBoardProps) {
  function getColor(
    status: ExecutiveTask["status"],
  ): "warning" | "info" | "success" {
    switch (status) {
      case "Concluída":
        return "success";

      case "Em andamento":
        return "info";

      default:
        return "warning";
    }
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
          Quadro de Tarefas
        </Box>

        <Stack spacing={2}>
          {tasks.map((task) => (
            <Card
              key={task.id}
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
                    {task.title}
                  </Box>

                  <Chip
                    size="small"
                    color={getColor(task.status)}
                    label={task.status}
                  />
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                    mb: 1,
                  }}
                >
                  Responsável: {task.responsible}
                </Box>

                <Box
                  sx={{
                    color: "text.secondary",
                  }}
                >
                  Prazo: {task.deadline}
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
                      onOpen?.(task.id)
                    }
                  >
                    Abrir
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
