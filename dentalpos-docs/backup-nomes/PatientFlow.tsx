import {
  Box,
  Chip,
  Paper,
  Typography,
} from "@mui/material";

type StatusAtendimento =
  | "Aguardando"
  | "Sala em preparação"
  | "Em atendimento"
  | "Atendimento finalizado";

interface PacienteFila {
  id: number;
  nome: string;
  horario: string;
  profissional: string;
  sala: string;
  status: StatusAtendimento;
}

const pacientes: PacienteFila[] = [
  {
    id: 1,
    nome: "Robson",
    horario: "08:00",
    profissional: "Dr. Carlos",
    sala: "Consultório 1",
    status: "Atendimento finalizado",
  },
  {
    id: 2,
    nome: "Mariana",
    horario: "09:00",
    profissional: "Dra. Juliana",
    sala: "Consultório 2",
    status: "Em atendimento",
  },
  {
    id: 3,
    nome: "João",
    horario: "09:30",
    profissional: "Dr. Carlos",
    sala: "Consultório 1",
    status: "Sala em preparação",
  },
  {
    id: 4,
    nome: "Ana",
    horario: "10:00",
    profissional: "Dra. Juliana",
    sala: "Consultório 2",
    status: "Aguardando",
  },
];

function anonimizarNome(nome: string) {
  return nome.trim().slice(0, 4).toUpperCase();
}

function obterCores(status: StatusAtendimento) {
  switch (status) {
    case "Aguardando":
      return {
        fundo: "#FEF3C7",
        texto: "#92400E",
        borda: "#F59E0B",
      };

    case "Sala em preparação":
      return {
        fundo: "#DBEAFE",
        texto: "#1E40AF",
        borda: "#3B82F6",
      };

    case "Em atendimento":
      return {
        fundo: "#DCFCE7",
        texto: "#166534",
        borda: "#22C55E",
      };

    case "Atendimento finalizado":
      return {
        fundo: "#F3E8FF",
        texto: "#6B21A8",
        borda: "#A855F7",
      };

    default:
      return {
        fundo: "#F1F5F9",
        texto: "#334155",
        borda: "#94A3B8",
      };
  }
}

export default function PatientFlow() {
  return (
    <Box>
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
        }}
      >
        Painel de Atendimento
      </Typography>

      <Typography
        color="text.secondary"
        sx={{
          mt: 1,
          mb: 4,
        }}
      >
        Acompanhamento da fila e do status dos atendimentos.
      </Typography>

      <Paper
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "80px 1fr",
              md: "100px 120px 1.5fr 1fr 1fr",
            },
            gap: 2,
            px: 3,
            py: 2,
            bgcolor: "#0F172A",
            color: "#FFFFFF",
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>Horário</Typography>

          <Typography sx={{ fontWeight: 700 }}>
            Paciente
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                md: "block",
              },
            }}
          >
            Status
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                md: "block",
              },
            }}
          >
            Profissional
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                md: "block",
              },
            }}
          >
            Sala
          </Typography>
        </Box>

        {[...pacientes].reverse().map((paciente) => {
          const cores = obterCores(paciente.status);

          return (
            <Box
              key={paciente.id}
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "80px 1fr",
                  md: "100px 120px 1.5fr 1fr 1fr",
                },
                gap: 2,
                alignItems: "center",
                px: 3,
                py: 2,
                borderBottom: "1px solid",
                borderColor: "divider",
                bgcolor: cores.fundo,
                borderLeft: `6px solid ${cores.borda}`,
              }}
            >
              <Typography sx={{ fontWeight: 700 }}>
                {paciente.horario}
              </Typography>

              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 18,
                  letterSpacing: 1,
                }}
              >
                {anonimizarNome(paciente.nome)}
              </Typography>

              <Box
                sx={{
                  display: {
                    xs: "none",
                    md: "block",
                  },
                }}
              >
                <Chip
                  label={paciente.status}
                  sx={{
                    bgcolor: cores.borda,
                    color: "#FFFFFF",
                    fontWeight: 700,
                  }}
                />
              </Box>

              <Typography
                sx={{
                  display: {
                    xs: "none",
                    md: "block",
                  },
                  color: cores.texto,
                  fontWeight: 600,
                }}
              >
                {paciente.profissional}
              </Typography>

              <Typography
                sx={{
                  display: {
                    xs: "none",
                    md: "block",
                  },
                  color: cores.texto,
                }}
              >
                {paciente.sala}
              </Typography>
            </Box>
          );
        })}
      </Paper>
    </Box>
  );
}