import {
  Box,
  Button,
  Chip,
  Paper,
  TextField,
  Typography,
} from "@mui/material";

import CameraAltIcon from "@mui/icons-material/CameraAlt";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DrawIcon from "@mui/icons-material/Draw";
import UploadFileIcon from "@mui/icons-material/UploadFile";

import PageHeader from "../components/PageHeader";
import { operationalTasks } from "../services/OperationalTaskService";

export default function OperationalEvidence() {
  return (
    <Box>
      <PageHeader
        title="Evidências Operacionais"
        description="Registro fotográfico, assinatura e comprovação das tarefas críticas."
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "repeat(2, 1fr)",
          },
          gap: 3,
        }}
      >
        {operationalTasks.map((task) => (
          <Paper
            key={task.id}
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                gap: 2,
                mb: 2,
              }}
            >
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {task.title}
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  {task.sector} • {task.dueAt}
                </Typography>
              </Box>

              <Chip
                label={task.priority}
                color={
                  task.priority === "Crítica"
                    ? "error"
                    : task.priority === "Alta"
                      ? "warning"
                      : "default"
                }
              />
            </Box>

            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {task.description}
            </Typography>

            <Box
              sx={{
                p: 2,
                mb: 3,
                borderRadius: 2,
                bgcolor: "#F8FAFC",
              }}
            >
              <Typography variant="body2">
                Evidência exigida:
              </Typography>

              <Typography sx={{ fontWeight: 700 }}>
                {task.evidenceRequirement}
              </Typography>
            </Box>

            {task.evidenceRequirement !== "Nenhuma" && (
              <Button
                fullWidth
                variant="outlined"
                component="label"
                startIcon={<CameraAltIcon />}
                sx={{ mb: 2 }}
              >
                Fotografar ou anexar imagem

                <input
                  hidden
                  accept="image/*"
                  capture="environment"
                  type="file"
                />
              </Button>
            )}

            <TextField
              fullWidth
              multiline
              minRows={3}
              label="Observações"
              placeholder="Descreva o procedimento realizado."
              sx={{ mb: 2 }}
            />

            {task.evidenceRequirement === "Foto e assinatura" && (
              <Button
                fullWidth
                variant="outlined"
                startIcon={<DrawIcon />}
                sx={{ mb: 2 }}
              >
                Registrar assinatura
              </Button>
            )}

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 2,
              }}
            >
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
              >
                Salvar rascunho
              </Button>

              <Button
                variant="contained"
                startIcon={<CheckCircleIcon />}
              >
                Concluir tarefa
              </Button>
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}