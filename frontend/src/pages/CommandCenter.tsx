import {
  Box,
  Chip,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CampaignIcon from "@mui/icons-material/Campaign";
import EventIcon from "@mui/icons-material/Event";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import PaymentsIcon from "@mui/icons-material/Payments";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import ScienceIcon from "@mui/icons-material/Science";
import TaskAltIcon from "@mui/icons-material/TaskAlt";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";
import { agents } from "../ai/agents";
import { tasks } from "../services/TaskService";

interface CommandIndicator {
  title: string;
  value: string;
  progress: number;
  description: string;
  icon: ReactNode;
}

const indicators: CommandIndicator[] = [
  {
    title: "Agenda",
    value: "18 atendimentos",
    progress: 82,
    description: "15 pacientes confirmados.",
    icon: <EventIcon />,
  },
  {
    title: "Pacientes",
    value: "325 ativos",
    progress: 76,
    description: "12 pacientes em acompanhamento.",
    icon: <PeopleAltIcon />,
  },
  {
    title: "Financeiro",
    value: "R$ 52.480",
    progress: 68,
    description: "Contas a receber neste mês.",
    icon: <PaymentsIcon />,
  },
  {
    title: "Estoque",
    value: "12 alertas",
    progress: 54,
    description: "Produtos abaixo do estoque mínimo.",
    icon: <Inventory2Icon />,
  },
  {
    title: "Laboratório",
    value: "24 trabalhos",
    progress: 71,
    description: "3 trabalhos próximos do prazo.",
    icon: <ScienceIcon />,
  },
  {
    title: "Marketing",
    value: "6 campanhas",
    progress: 63,
    description: "2 campanhas aguardando aprovação.",
    icon: <CampaignIcon />,
  },
];

export default function CommandCenter() {
  const pendingTasks = tasks.filter((task) => !task.concluida);
  const activeAgents = agents.filter((agent) => agent.ativo);

  return (
    <Box>
      <PageHeader
        title="Centro de Comando"
        description="Visão integrada da clínica, tarefas, indicadores e agentes de inteligência artificial."
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, 1fr)",
            xl: "repeat(3, 1fr)",
          },
          gap: 3,
        }}
      >
        {indicators.map((indicator) => (
          <Paper
            key={indicator.title}
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
                alignItems: "center",
                gap: 2,
                mb: 2,
              }}
            >
              <Box
                sx={{
                  width: 46,
                  height: 46,
                  borderRadius: 2,
                  bgcolor: "primary.main",
                  color: "#FFFFFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {indicator.icon}
              </Box>

              <Box>
                <Typography color="text.secondary">
                  {indicator.title}
                </Typography>

                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {indicator.value}
                </Typography>
              </Box>
            </Box>

            <LinearProgress
              variant="determinate"
              value={indicator.progress}
              sx={{
                height: 9,
                borderRadius: 10,
              }}
            />

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 1.5,
              }}
            >
              {indicator.description}
            </Typography>
          </Paper>
        ))}
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "1fr 1fr",
          },
          gap: 3,
          mt: 4,
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
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 3,
            }}
          >
            <TaskAltIcon color="primary" />

            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
              }}
            >
              Tarefas prioritárias
            </Typography>
          </Box>

          {pendingTasks.map((task) => (
            <Box
              key={task.id}
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 2,
                bgcolor: "background.default",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  mb: 1,
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {task.titulo}
                </Typography>

                <Chip
                  size="small"
                  label={task.prioridade}
                  color={
                    task.prioridade === "Urgente"
                      ? "error"
                      : task.prioridade === "Alta"
                        ? "warning"
                        : "default"
                  }
                />
              </Box>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                {task.descricao}
              </Typography>
            </Box>
          ))}
        </Paper>

        <Paper
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
              alignItems: "center",
              gap: 1.5,
              mb: 3,
            }}
          >
            <AutoAwesomeIcon color="primary" />

            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
              }}
            >
              Agentes de IA ativos
            </Typography>
          </Box>

          {activeAgents.map((agent) => (
            <Box
              key={agent.id}
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 2,
                bgcolor: "background.default",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  mb: 1,
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {agent.nome}
                </Typography>

                <Chip
                  size="small"
                  label="Ativa"
                  color="success"
                />
              </Box>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                {agent.descricao}
              </Typography>
            </Box>
          ))}
        </Paper>
      </Box>
    </Box>
  );
}