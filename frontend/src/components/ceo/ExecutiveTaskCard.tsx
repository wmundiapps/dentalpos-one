import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

export interface ExecutiveTaskCardProps {
  title: string;
  sector: string;
  responsible: string;
  deadline: string;
  priority: "Alta" | "Média" | "Baixa";
  completed: boolean;
  onOpen?: () => void;
}

export default function ExecutiveTaskCard({
  title,
  sector,
  responsible,
  deadline,
  priority,
  completed,
  onOpen,
}: ExecutiveTaskCardProps) {
  const color =
    priority === "Alta"
      ? "error"
      : priority === "Média"
      ? "warning"
      : "success";

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        opacity: completed ? 0.65 : 1,
      }}
    >
      <CardContent>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            mb: 2,
          }}
        >
          <Box
            component="h3"
            sx={{
              m: 0,
              fontSize: "1.15rem",
              fontWeight: 800,
            }}
          >
            {title}
          </Box>

          <Chip
            label={priority}
            color={color}
            size="small"
          />
        </Box>

        <Box
          component="p"
          sx={{
            mt: 0,
            mb: 1,
          }}
        >
          <strong>Setor:</strong> {sector}
        </Box>

        <Box
          component="p"
          sx={{
            m: 0,
          }}
        >
          <strong>Responsável:</strong> {responsible}
        </Box>

        <Box
          component="p"
          sx={{
            mt: 1,
            mb: 0,
          }}
        >
          <strong>Prazo:</strong> {deadline}
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mt: 3,
          }}
        >
          <Chip
            label={
              completed
                ? "Concluída"
                : "Pendente"
            }
            color={
              completed
                ? "success"
                : "warning"
            }
          />

          <Button
            variant="contained"
            onClick={onOpen}
          >
            Abrir
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
