import { Alert, Box } from "@mui/material";
import { useLocation } from "react-router-dom";
import { pathAllowed, useMenuAccess } from "../config/menuAccess";
import { useEffect, type ReactNode } from "react";
import { syncProcedureDurations } from "../services/ProcedureDurations";

import DemoBanner from "./DemoBanner";
import EvaluationWidget from "./EvaluationWidget";
import Footer from "./Footer";
import Header from "./Header";
import PendingAlertsBar from "./PendingAlertsBar";
import ToastHost from "./ToastHost";
import PrintHeader from "./PrintHeader";
import Sidebar from "./Sidebar";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({
  children,
}: LayoutProps) {
  useEffect(() => { void syncProcedureDurations(); }, []);
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
        <Box className="no-print"><PendingAlertsBar /></Box>
        <ToastHost />

        <Box
          component="main"
          sx={{
            flex: 1,
            p: {
              xs: 2,
              md: 4,
            },
          }}
        >
          <PrintHeader />
          {blocked ? <Alert severity="warning" sx={{ maxWidth: 640 }}>Seu departamento não tem acesso a esta tela. Peça ao administrador ou ao gestor para liberar em Configurações &gt; Permissões.</Alert> : children}
        </Box>

        <Footer />
      </Box>

      <Box className="no-print"><EvaluationWidget /></Box>
    </Box>
  );
}
