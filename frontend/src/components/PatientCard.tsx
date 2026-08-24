import {
  Avatar,
  Box,
  Button,
  Chip,
  Paper,
  Typography,
} from "@mui/material";

import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

interface PatientCardProps {
  nome: string;
  telefone: string;
  tratamento: string;
  ultimaConsulta: string;
  status: "Ativo" | "Em acompanhamento" | "Inativo";
}

export default function PatientCard({
  nome,
  telefone,
  tratamento,
  ultimaConsulta,
  status,
}: PatientCardProps) {
  const primeiraLetra = nome.trim().charAt(0).toUpperCase();

  const corStatus =
    status === "Ativo"
      ? "success"
      : status === "Em acompanhamento"
        ? "warning"
        : "default";

  return (
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
          alignItems: "flex-start",
          gap: 2,
        }}
      >
        <Avatar
          sx={{
            width: 54,
            height: 54,
            bgcolor: "primary.main",
            fontSize: 22,
          }}
        >
          {primeiraLetra}
        </Avatar>

        <Box sx={{ flex: 1 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
            }}
          >
            {nome}
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
          >
            {telefone}
          </Typography>
        </Box>

        <Chip
          size="small"
          label={status}
          color={corStatus}
        />
      </Box>

      <Box
        sx={{
          mt: 3,
          p: 2,
          borderRadius: 2,
          bgcolor: "#F8FAFC",
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
        >
          Tratamento
        </Typography>

        <Typography
          sx={{
            fontWeight: 700,
          }}
        >
          {tratamento}
        </Typography>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mt: 2,
        }}
      >
        <CalendarMonthIcon
          fontSize="small"
          color="action"
        />

        <Typography
          variant="body2"
          color="text.secondary"
        >
          Última consulta: {ultimaConsulta}
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 2,
          mt: 3,
        }}
      >
        <Button variant="outlined">
          Abrir prontuário
        </Button>

        <Button
          variant="contained"
          startIcon={<WhatsAppIcon />}
        >
          WhatsApp
        </Button>
      </Box>
    </Paper>
  );
}