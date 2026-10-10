import { Box } from "@mui/material";
import { useEffect, type ReactNode } from "react";
import { useIdleLogout } from "../hooks/useIdleLogout";
import { syncProcedureDurations } from "../services/ProcedureDurations";

import DemoBanner from "./DemoBanner";
import ActionFeedbackHost from "./ActionFeedbackHost";
import FeedbackFab from "./FeedbackFab";
import EvaluationWidget from "./EvaluationWidget";
import Footer from "./Footer";
import Header from "./Header";
import PendingAlertsBar from "./PendingAlertsBar";
import PrintHeader from "./PrintHeader";
import Sidebar from "./Sidebar";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({
  children,
}: LayoutProps) {
  useIdleLogout();
  useEffect(() => { void syncProcedureDurations(); }, []);

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
          {children}
        </Box>

        <FeedbackFab />
        <ActionFeedbackHost />
        <Footer />
      </Box>

      <Box className="no-print"><EvaluationWidget /></Box>
    </Box>
  );
}
