import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, Typography } from "@mui/material";
import Layout from "./components/Layout";
import AppRoutes from "./routes/AppRoutes";
import Login from "./pages/Login";
import PublicBooking from "./pages/PublicBooking";
import DemoLanding from "./pages/DemoLanding";
import {
  clearClientSession,
  demoSalesUrl,
  formatDemoDate,
  type DemoAccessSnapshot,
  writeDemoAccess,
  writeSessionUser,
} from "./services/DemoAccess";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

type SessionState = "checking" | "valid" | "invalid" | "unavailable" | "expired";

function currentAppPath() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pathname = window.location.pathname;
  if (base && pathname.startsWith(base)) {
    return pathname.slice(base.length) || "/";
  }
  return pathname;
}

function clearSession() {
  clearClientSession();
}

export default function App() {
  const appPath = currentAppPath().replace(/\/$/, "") || "/";
  const [session, setSession] = useState<SessionState>(() =>
    localStorage.getItem("dentalpos.token") ? "checking" : "invalid",
  );
  const [expiredDemo, setExpiredDemo] = useState<DemoAccessSnapshot | null>(null);

  const validateSession = async () => {
    const token = localStorage.getItem("dentalpos.token");
    if (!token) {
      setSession("invalid");
      return;
    }

    setSession("checking");
    const clinicId = localStorage.getItem("dentalpos.clinicId") || "";

    try {
      const response = await fetch(`${API}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
        },
      });

      if (response.status === 401 || response.status === 403) {
        clearSession();
        setSession("invalid");
        return;
      }

      if (!response.ok) {
        setSession("unavailable");
        return;
      }

      const data = await response.json();
      writeSessionUser(data);
      writeDemoAccess(data.demo);
      if (data.clinicId) localStorage.setItem("dentalpos.clinicId", data.clinicId);

      if (data.demo?.isDemo && data.demo?.phase === "ENDED") {
        setExpiredDemo(data.demo);
        setSession("expired");
        return;
      }

      setExpiredDemo(null);
      setSession("valid");
    } catch {
      setSession("unavailable");
    }
  };

  useEffect(() => {
    if (appPath !== "/agendamento-online" && appPath !== "/demo") void validateSession();
  }, [appPath]);

  if (appPath === "/agendamento-online") {
    return <PublicBooking />;
  }

  if (appPath === "/demo") {
    return <DemoLanding />;
  }

  if (session === "invalid") return <Login />;

  if (session === "checking") {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}>
        <Box sx={{ textAlign: "center" }}>
          <CircularProgress size={36} />
          <Typography color="text.secondary" sx={{ mt: 2 }}>Validando sessão...</Typography>
        </Box>
      </Box>
    );
  }

  if (session === "expired") {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          p: 2,
          bgcolor: "background.default",
        }}
      >
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 4, width: "min(620px,100%)" }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            A demonstração gratuita foi encerrada.
          </Alert>
          <Typography variant="h4" sx={{ fontWeight: 950 }}>Seus dados continuam preservados</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 1 }}>
            O período gratuito terminou em {formatDemoDate(expiredDemo?.endAt)}.
            Pacientes, agenda e histórico não são apagados automaticamente pelo vencimento da demo.
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Para reativar o acesso e continuar utilizando o DentalPos One, solicite uma proposta comercial.
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              onClick={() => {
                window.location.href = demoSalesUrl();
              }}
            >
              Solicitar proposta
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                clearSession();
                setSession("invalid");
              }}
            >
              Sair
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  if (session === "unavailable") {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}>
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 4, width: "min(520px,100%)" }}>
          <Alert severity="warning" sx={{ mb: 2 }}>A API do DentalPos One não respondeu. Nenhum dado foi alterado.</Alert>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>Ambiente indisponível</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            Verifique o backend e tente novamente. Em homologação pública, esta tela evita operar com uma sessão não validada.
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="contained" onClick={() => void validateSession()}>Tentar novamente</Button>
            <Button
              variant="outlined"
              onClick={() => {
                clearSession();
                setSession("invalid");
              }}
            >
              Voltar ao login
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Layout>
      <AppRoutes />
    </Layout>
  );
}
