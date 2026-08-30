import { Alert, Box, Button, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  demoSalesUrl,
  formatDemoDate,
  publicBookingUrl,
  readDemoAccess,
  readSessionUser,
} from "../services/DemoAccess";

export default function DemoBanner() {
  const demo = readDemoAccess();
  const user = readSessionUser();

  if (!demo?.isDemo) return null;

  const days = demo.daysRemaining ?? 0;
  const severity =
    demo.phase === "READ_ONLY"
      ? "warning"
      : days <= 3
        ? "error"
        : days <= 7
          ? "warning"
          : "info";

  const title =
    demo.phase === "READ_ONLY"
      ? "Demo encerrada • modo somente leitura"
      : `Demo gratuita • ${days} ${days === 1 ? "dia restante" : "dias restantes"}`;

  const bookingUrl = publicBookingUrl(user?.clinicId);

  return (
    <Alert
      severity={severity}
      sx={{
        borderRadius: 0,
        px: { xs: 2, md: 4 },
        py: 1,
        "& .MuiAlert-message": { width: "100%" },
      }}
    >
      <Box
        sx={{
          width: "100%",
          display: "flex",
          alignItems: { xs: "flex-start", md: "center" },
          flexDirection: { xs: "column", md: "row" },
          gap: 1.5,
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 950 }}>{title}</Typography>
          <Typography variant="body2">
            {demo.phase === "READ_ONLY"
              ? `O uso operacional está bloqueado. Consulta disponível até ${formatDemoDate(demo.graceUntil)}. Seus dados permanecem preservados.`
              : `Acesso gratuito e temporário até ${formatDemoDate(demo.endAt)}. Após essa data, será necessária a contratação para continuar utilizando o sistema.`}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {demo.phase === "ACTIVE" && user?.clinicId ? (
            <Button
              size="small"
              variant="outlined"
              endIcon={<OpenInNewIcon />}
              onClick={() => window.open(bookingUrl, "_blank", "noopener,noreferrer")}
            >
              Agendamento online
            </Button>
          ) : null}
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              window.location.href = demoSalesUrl();
            }}
          >
            Solicitar proposta
          </Button>
        </Box>
      </Box>
    </Alert>
  );
}
