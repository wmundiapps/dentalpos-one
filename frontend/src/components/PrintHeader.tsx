import { Box, Typography } from "@mui/material";
import { useLocation } from "react-router-dom";
import { navigationItems } from "../config/navigation";
import { readSessionUser } from "../services/DemoAccess";

// Cabeçalho que só aparece na folha impressa: clínica, tela, data/hora e quem imprimiu.
export default function PrintHeader() {
  const { pathname } = useLocation();
  const user = readSessionUser();
  const identity = (() => { try { return JSON.parse(localStorage.getItem("dentalpos.clinic.identity.v1") || "null") as { name?: string } | null; } catch { return null; } })();
  const clinic = user?.clinic?.displayName || user?.clinic?.name || identity?.name || "DentalPos One";
  const item = navigationItems.find((i) => i.path.split("?")[0] === pathname)
    || navigationItems.filter((i) => i.path !== "/" && pathname.startsWith(i.path.split("?")[0])).sort((a, b) => b.path.length - a.path.length)[0];
  const who = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "";

  return (
    <Box className="print-only" sx={{ borderBottom: "2px solid #1565C0", pb: 1, mb: 2 }}>
      <Typography sx={{ fontWeight: 900, fontSize: 18 }}>{clinic}</Typography>
      <Typography sx={{ fontSize: 13 }}>{item?.label || "Tela do sistema"}</Typography>
      <Typography sx={{ fontSize: 11, color: "#475569" }}>{`Impresso em ${new Date().toLocaleString("pt-BR")}${who ? ` por ${who}` : ""}`}</Typography>
    </Box>
  );
}
