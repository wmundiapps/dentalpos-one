import { Box } from "@mui/material";
import type { ReactNode } from "react";

import DemoBanner from "./DemoBanner";
import Footer from "./Footer";
import Header from "./Header";
import Sidebar from "./Sidebar";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({
  children,
}: LayoutProps) {
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
        <DemoBanner />

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
          {children}
        </Box>

        <Footer />
      </Box>
    </Box>
  );
}
