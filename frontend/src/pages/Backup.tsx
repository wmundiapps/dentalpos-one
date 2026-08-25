import { Alert, Box, Chip, Paper, Typography } from "@mui/material";
import BackupIcon from "@mui/icons-material/Backup";
import RestoreIcon from "@mui/icons-material/Restore";
import SecurityIcon from "@mui/icons-material/Security";
import PageHeader from "../components/PageHeader";

export default function Backup() {
  return (
    <Box>
      <PageHeader
        title="Backup e Recuperação"
        description="Política de cópia, retenção e teste de restauração do DentalPos One."
      />

      <Alert severity="warning" sx={{ mb: 3 }}>
        Esta tela não simula backups concluídos. O ambiente só deve ser considerado protegido depois de configurar o job real no servidor e executar um teste de restauração documentado.
      </Alert>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2, mb: 3 }}>
        <StatusCard icon={<BackupIcon />} title="Backup automático" status="Configurar no servidor" />
        <StatusCard icon={<RestoreIcon />} title="Teste de restauração" status="Obrigatório antes da produção" />
        <StatusCard icon={<SecurityIcon />} title="Retenção" status="Definida por ambiente" />
      </Box>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 900, mb: 1 }}>Rotina operacional incluída no projeto</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          O Bloco 15 inclui scripts PowerShell para gerar backup do PostgreSQL via Docker e restaurar uma cópia de teste. Eles não são executados automaticamente pela interface para evitar uma falsa sensação de segurança.
        </Typography>
        <Box component="code" sx={{ display: "block", p: 2, borderRadius: 2, bgcolor: "action.hover", whiteSpace: "pre-wrap" }}>
          scripts\backup-postgres.ps1{"\n"}scripts\restore-postgres.ps1
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 900, mb: 1 }}>Critério de homologação</Typography>
        <Typography color="text.secondary">
          Backup diário configurado, retenção definida, cópia armazenada fora do servidor principal e restauração testada em base separada. Depois disso, registre BACKUP_ENABLED=true e BACKUP_LAST_RESTORE_TEST_AT no ambiente seguro.
        </Typography>
      </Paper>
    </Box>
  );
}

function StatusCard({ icon, title, status }: { icon: React.ReactNode; title: string; status: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Box sx={{ color: "primary.main", mb: 1 }}>{icon}</Box>
      <Typography sx={{ fontWeight: 900 }}>{title}</Typography>
      <Chip size="small" label={status} sx={{ mt: 1 }} />
    </Paper>
  );
}
