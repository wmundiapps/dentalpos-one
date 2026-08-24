import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";

import BackupIcon from "@mui/icons-material/Backup";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import HistoryIcon from "@mui/icons-material/History";
import RestoreIcon from "@mui/icons-material/Restore";
import SecurityIcon from "@mui/icons-material/Security";

const backups = [
  {
    data: "01/08/2026 — 03:00",
    tipo: "Automático diário",
    tamanho: "2,8 GB",
    status: "Concluído",
  },
  {
    data: "31/07/2026 — 03:00",
    tipo: "Automático diário",
    tamanho: "2,7 GB",
    status: "Concluído",
  },
  {
    data: "30/07/2026 — 18:45",
    tipo: "Backup manual",
    tamanho: "2,7 GB",
    status: "Concluído",
  },
];

export default function Backup() {
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700 }}>
        Backup e Recuperação
      </Typography>

      <Typography color="text.secondary" sx={{ mt: 1, mb: 4 }}>
        Proteção do banco de dados, documentos, imagens e arquivos do sistema.
      </Typography>

      <Alert severity="success" sx={{ mb: 3 }}>
        Último backup concluído com sucesso em 01/08/2026 às 03:00.
      </Alert>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, 1fr)",
            xl: "repeat(4, 1fr)",
          },
          gap: 3,
        }}
      >
        <ResumoBackup
          titulo="Último backup"
          valor="Hoje, 03:00"
          icone={<CloudDoneIcon />}
        />

        <ResumoBackup
          titulo="Armazenamento"
          valor="68%"
          icone={<BackupIcon />}
        />

        <ResumoBackup
          titulo="Retenção"
          valor="90 dias"
          icone={<HistoryIcon />}
        />

        <ResumoBackup
          titulo="Integridade"
          valor="100%"
          icone={<SecurityIcon />}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "1fr 1.5fr",
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
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Proteção do sistema
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Banco de dados, prontuários, fotos, documentos, exames e arquivos.
          </Typography>

          <Box sx={{ mt: 4 }}>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>
              Espaço utilizado
            </Typography>

            <LinearProgress
              variant="determinate"
              value={68}
              sx={{
                height: 10,
                borderRadius: 10,
              }}
            />

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 1 }}
            >
              68 GB utilizados de 100 GB.
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gap: 2,
              mt: 4,
            }}
          >
            <Button variant="contained" startIcon={<BackupIcon />}>
              Executar backup agora
            </Button>

            <Button variant="outlined" startIcon={<RestoreIcon />}>
              Restaurar backup
            </Button>
          </Box>
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
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
            Histórico de backups
          </Typography>

          {backups.map((backup) => (
            <Box
              key={`${backup.data}-${backup.tipo}`}
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "1.5fr 1fr 100px 110px",
                },
                alignItems: "center",
                gap: 2,
                p: 2,
                mb: 2,
                borderRadius: 2,
                bgcolor: "#F8FAFC",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 700 }}>
                  {backup.data}
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  {backup.tipo}
                </Typography>
              </Box>

              <Typography>{backup.tamanho}</Typography>

              <Chip
                size="small"
                label={backup.status}
                color="success"
                icon={<CheckCircleIcon />}
              />

              <Button size="small" startIcon={<RestoreIcon />}>
                Restaurar
              </Button>
            </Box>
          ))}
        </Paper>
      </Box>
    </Box>
  );
}

interface ResumoBackupProps {
  titulo: string;
  valor: string;
  icone: React.ReactNode;
}

function ResumoBackup({
  titulo,
  valor,
  icone,
}: ResumoBackupProps) {
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
          width: 48,
          height: 48,
          borderRadius: 2,
          bgcolor: "primary.main",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 2,
        }}
      >
        {icone}
      </Box>

      <Typography color="text.secondary">{titulo}</Typography>

      <Typography variant="h5" sx={{ fontWeight: 700, mt: 1 }}>
        {valor}
      </Typography>
    </Paper>
  );
}