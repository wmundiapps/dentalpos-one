import { Alert, Box } from "@mui/material";
import { useLocation } from "react-router-dom";
import { pathAllowed, useMenuAccess } from "../config/menuAccess";
import { useEffect, type ReactNode } from "react";
import { syncProcedureDurations } from "../services/ProcedureDurations";
import { EDU_ONLY } from "../config/appMode";

import DemoBanner from "./DemoBanner";
import SubscriptionBanner from "./SubscriptionBanner";
import EvaluationWidget from "./EvaluationWidget";
import SuggestionBox from "./SuggestionBox";
import Footer from "./Footer";
import Header from "./Header";
import PendingAlertsBar from "./PendingAlertsBar";
import PendingLockGate from "./PendingLockGate";
import ToastHost from "./ToastHost";
import PrintHeader from "./PrintHeader";
import FeedbackButton from "../edu/feedback/FeedbackButton";
import DemoExpiryBanner from "./DemoExpiryBanner";
import Sidebar from "./Sidebar";
import AssistenteTreinamento from "./AssistenteTreinamento";
import ScreenWatermark from "./ScreenWatermark";
import CopyDeterrent from "./CopyDeterrent";
import { AlertsDrawerHost } from "./alerts/AlertsMenu";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({
  children,
}: LayoutProps) {
  useEffect(() => { if (!EDU_ONLY) void syncProcedureDurations(); }, []);
  const location = useLocation();
  const menuAccess = useMenuAccess();
  const blocked = !pathAllowed(location.pathname, menuAccess);

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "background.default",
        backgroundImage: "radial-gradient(circle at 85% 0%, rgba(21,101,192,.08), transparent 28%), radial-gradient(circle at 15% 100%, rgba(0,172,193,.06), transparent 24%)",
      }}
    >
      <Sidebar />

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Header />
        <Box className="no-print"><DemoBanner /></Box>
        <Box className="no-print"><SubscriptionBanner /></Box>
        <Box className="no-print" sx={{ display: { xs: "none", md: "block" } }}><PendingAlertsBar /></Box>
        <ToastHost />

        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            maxWidth: "100%",
            // A agenda usa a tela toda (margens pequenas) para mostrar mais horários e pacientes.
            p: location.pathname.startsWith("/agenda") && !location.pathname.startsWith("/agendamento")
              ? { xs: 1, md: 1.5 }
              : { xs: 2, md: 4 },
          }}
        >
          {EDU_ONLY ? <DemoExpiryBanner /> : null}
          <PrintHeader />
          {blocked ? (
            <Alert severity="warning" sx={{ maxWidth: 640 }}>Seu departamento não tem acesso a esta tela. Peça ao administrador ou ao gestor para liberar em Configurações &gt; Permissões.</Alert>
          ) : (
            <PendingLockGate>
              {children}
              <SuggestionBox />
              <FeedbackButton />
              <AssistenteTreinamento />
            </PendingLockGate>
          )}
        </Box>

        <Footer />
      </Box>

      <Box className="no-print"><EvaluationWidget /></Box>
      <Box className="no-print"><AlertsDrawerHost /></Box>
      <ScreenWatermark />
      <CopyDeterrent />
    </Box>
  );
}
