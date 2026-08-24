import {
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";

import AttachFileIcon from "@mui/icons-material/AttachFile";
import BugReportIcon from "@mui/icons-material/BugReport";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import SendIcon from "@mui/icons-material/Send";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";
import {
  countCriticalFeedbacks,
  countOpenFeedbacks,
  userFeedbacks,
} from "../services/FeedbackService";
import type {
  FeedbackPriority,
  FeedbackStatus,
  FeedbackType,
} from "../types/feedback";

function getTypeIcon(type: FeedbackType): ReactNode {
  switch (type) {
    case "Bug":
    case "Problema":
      return <BugReportIcon />;

    case "Sugestão":
    case "Melhoria":
      return <LightbulbIcon />;

    default:
      return <SupportAgentIcon />;
  }
}

function getPriorityColor(priority: FeedbackPriority) {
  switch (priority) {
    case "Crítica":
      return "error" as const;

    case "Alta":
      return "warning" as const;

    case "Média":
      return "info" as const;

    default:
      return "default" as const;
  }
}

function getStatusColor(status: FeedbackStatus) {
  switch (status) {
    case "Resolvido":
      return "success" as const;

    case "Em desenvolvimento":
      return "primary" as const;

    case "Em análise":
      return "warning" as const;

    case "Arquivado":
      return "default" as const;

    default:
      return "info" as const;
  }
}

export default function Feedback() {
  const openFeedbacks = countOpenFeedbacks();
  const criticalFeedbacks = countCriticalFeedbacks();

  return (
    <Box>
      <PageHeader
        title="Sugestões e Problemas"
        description="Envie sugestões, relate defeitos, bugs, dúvidas e oportunidades de melhoria."
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            xl: "1fr 1.2fr",
          },
          gap: 3,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="h6"
            sx={{
              fontWeight: 900,
              mb: 3,
            }}
          >
            Enviar novo relato
          </Typography>

          <TextField
            select
            fullWidth
            label="Tipo do relato"
            defaultValue="Sugestão"
            sx={{ mb: 2 }}
          >
            <MenuItem value="Sugestão">Sugestão</MenuItem>
            <MenuItem value="Bug">Bug</MenuItem>
            <MenuItem value="Problema">Problema</MenuItem>
            <MenuItem value="Dúvida">Dúvida</MenuItem>
            <MenuItem value="Melhoria">Melhoria</MenuItem>
          </TextField>

          <TextField
            fullWidth
            label="Título"
            placeholder="Resuma o que aconteceu ou sua sugestão."
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="Módulo"
            placeholder="Exemplo: Agenda, Financeiro, Estoque..."
            sx={{ mb: 2 }}
          />

          <TextField
            select
            fullWidth
            label="Prioridade"
            defaultValue="Média"
            sx={{ mb: 2 }}
          >
            <MenuItem value="Baixa">Baixa</MenuItem>
            <MenuItem value="Média">Média</MenuItem>
            <MenuItem value="Alta">Alta</MenuItem>
            <MenuItem value="Crítica">Crítica</MenuItem>
          </TextField>

          <TextField
            fullWidth
            multiline
            minRows={6}
            label="Descrição"
            placeholder="Descreva detalhadamente o problema, sugestão ou melhoria."
            sx={{ mb: 2 }}
          />

          <Button
            fullWidth
            component="label"
            variant="outlined"
            startIcon={<AttachFileIcon />}
            sx={{ mb: 2 }}
          >
            Anexar imagem ou arquivo

            <input
              hidden
              multiple
              type="file"
              accept="image/*,.pdf,.txt"
            />
          </Button>

          <Button
            fullWidth
            variant="contained"
            startIcon={<SendIcon />}
          >
            Enviar relato
          </Button>
        </Paper>

        <Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(3, 1fr)",
              },
              gap: 2,
              mb: 3,
            }}
          >
            <SummaryCard
              title="Relatos cadastrados"
              value={String(userFeedbacks.length)}
            />

            <SummaryCard
              title="Em aberto"
              value={String(openFeedbacks)}
            />

            <SummaryCard
              title="Críticos"
              value={String(criticalFeedbacks)}
            />
          </Box>

          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 900,
                mb: 3,
              }}
            >
              Histórico de relatos
            </Typography>

            {userFeedbacks.map((feedback) => (
              <Paper
                key={feedback.id}
                variant="outlined"
                sx={{
                  p: 2.5,
                  mb: 2,
                  borderRadius: 2,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 2,
                  }}
                >
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: 2,
                      bgcolor: "primary.main",
                      color: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {getTypeIcon(feedback.type)}
                  </Box>

                  <Box sx={{ flexGrow: 1 }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 2,
                        flexWrap: "wrap",
                      }}
                    >
                      <Box>
                        <Typography
                          sx={{
                            fontWeight: 900,
                          }}
                        >
                          {feedback.title}
                        </Typography>

                        <Typography
                          variant="body2"
                          color="text.secondary"
                        >
                          {feedback.type} • {feedback.module}
                        </Typography>
                      </Box>

                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                          flexWrap: "wrap",
                        }}
                      >
                        <Chip
                          size="small"
                          label={feedback.priority}
                          color={getPriorityColor(
                            feedback.priority,
                          )}
                        />

                        <Chip
                          size="small"
                          label={feedback.status}
                          color={getStatusColor(
                            feedback.status,
                          )}
                        />
                      </Box>
                    </Box>

                    <Typography
                      color="text.secondary"
                      sx={{
                        mt: 1.5,
                      }}
                    >
                      {feedback.description}
                    </Typography>

                    {feedback.attachmentName && (
                      <Chip
                        size="small"
                        icon={<AttachFileIcon />}
                        label={feedback.attachmentName}
                        variant="outlined"
                        sx={{ mt: 2 }}
                      />
                    )}

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: "block",
                        mt: 2,
                      }}
                    >
                      Enviado por {feedback.userName} em{" "}
                      {feedback.createdAt}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
}

function SummaryCard({
  title,
  value,
}: SummaryCardProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography color="text.secondary">
        {title}
      </Typography>

      <Typography
        variant="h4"
        sx={{
          mt: 1,
          fontWeight: 900,
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}