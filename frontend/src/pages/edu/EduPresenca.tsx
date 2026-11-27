import { Box, Paper, Tab, Tabs } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import AssessmentIcon from "@mui/icons-material/Assessment";
import FaceIcon from "@mui/icons-material/Face";
import SettingsIcon from "@mui/icons-material/Settings";
import { useState, type ReactElement, type ReactNode } from "react";
import EduShell from "../../edu/EduShell";
import AcessoTab from "../../edu/presenca/AcessoTab";
import BiometriaAdmin from "../../edu/presenca/BiometriaAdmin";
import ChamadaTab from "../../edu/presenca/ChamadaTab";
import ConfigPresenca from "../../edu/presenca/ConfigPresenca";
import EmprestimosTab from "../../edu/presenca/EmprestimosTab";
import FrequenciaTab from "../../edu/presenca/FrequenciaTab";
import PainelPresenca from "../../edu/presenca/PainelPresenca";

const TABS: Array<{ label: string; icon: ReactElement; render: () => ReactNode }> = [
  { label: "Painel", icon: <DashboardIcon />, render: () => <PainelPresenca /> },
  { label: "Chamada", icon: <FactCheckIcon />, render: () => <ChamadaTab /> },
  { label: "Acesso e ocupação", icon: <MeetingRoomIcon />, render: () => <AcessoTab /> },
  { label: "Empréstimos", icon: <SwapHorizIcon />, render: () => <EmprestimosTab /> },
  { label: "Frequência", icon: <AssessmentIcon />, render: () => <FrequenciaTab /> },
  { label: "Biometria (LGPD)", icon: <FaceIcon />, render: () => <BiometriaAdmin /> },
  { label: "Configuração", icon: <SettingsIcon />, render: () => <ConfigPresenca /> },
];

export default function EduPresenca() {
  const [tab, setTab] = useState(0);
  return (
    <EduShell title="Presença e acesso" subtitle="Chamada por reconhecimento facial (com QR e lista manual), controle de entrada e saída de espaços e empréstimos de materiais e equipamentos.">
      <Paper variant="outlined" sx={{ borderRadius: 4, mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          {TABS.map((t) => <Tab key={t.label} label={t.label} icon={t.icon} iconPosition="start" sx={{ textTransform: "none", fontWeight: 700, minHeight: 56 }} />)}
        </Tabs>
      </Paper>
      <Box>{TABS[tab].render()}</Box>
    </EduShell>
  );
}
