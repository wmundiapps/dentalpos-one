import { Box, ButtonBase, Paper, Typography } from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import FaceIcon from "@mui/icons-material/Face";
import BarChartIcon from "@mui/icons-material/BarChart";
import GroupsIcon from "@mui/icons-material/Groups";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import BiotechIcon from "@mui/icons-material/Biotech";
import type { ReactNode } from "react";

export interface MobileCard { titulo: string; valor: string; cor: string; onClick: () => void }

const MENU: { label: string; path: string; icon: ReactNode }[] = [
  { label: "Agenda hoje", path: "/agenda", icon: <CalendarMonthIcon /> },
  { label: "Pacientes", path: "/pacientes", icon: <FaceIcon /> },
  { label: "Financeiro", path: "/financeiro", icon: <BarChartIcon /> },
  { label: "Recebíveis", path: "/pagamentos", icon: <AttachMoneyIcon /> },
  { label: "Laboratório", path: "/laboratorio", icon: <BiotechIcon /> },
  { label: "Profissionais", path: "/corpo-clinico", icon: <GroupsIcon /> },
];

// Tela de entrada no celular: cartões grandes e coloridos, um por assunto, e atalhos em lista.
export default function MobileHome({ cards, onNavigate }: { cards: MobileCard[]; onNavigate: (path: string) => void }) {
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {cards.map((c) => (
        <ButtonBase key={c.titulo} onClick={c.onClick} sx={{ display: "block", textAlign: "center", bgcolor: c.cor, color: "#fff", borderRadius: 3, py: 4, px: 2, boxShadow: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 22 }}>{c.titulo}</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: 46, mt: 2, opacity: 0.9 }}>{c.valor}</Typography>
        </ButtonBase>
      ))}
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        {MENU.map((m, i) => (
          <ButtonBase key={m.path} onClick={() => onNavigate(m.path)} sx={{ display: "flex", justifyContent: "flex-start", gap: 2, width: "100%", px: 2.5, py: 2, borderTop: i ? "1px solid" : 0, borderColor: "divider", color: "text.secondary" }}>
            {m.icon}
            <Typography sx={{ color: "text.primary", fontSize: 17 }}>{m.label}</Typography>
          </ButtonBase>
        ))}
      </Paper>
    </Box>
  );
}
