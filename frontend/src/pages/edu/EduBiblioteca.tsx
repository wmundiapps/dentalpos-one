import { Box, Paper, Tab, Tabs } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import SchoolIcon from "@mui/icons-material/School";
import CloudIcon from "@mui/icons-material/Cloud";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import SettingsIcon from "@mui/icons-material/Settings";
import { useState, type ReactElement, type ReactNode } from "react";
import EduShell from "../../edu/EduShell";
import AcervoTab from "../../edu/biblioteca/AcervoTab";
import AdequacaoTabBib from "../../edu/biblioteca/AdequacaoTabBib";
import CirculacaoTab from "../../edu/biblioteca/CirculacaoTab";
import ConfigBib from "../../edu/biblioteca/ConfigBib";
import PainelBib from "../../edu/biblioteca/PainelBib";
import RepositorioTab from "../../edu/biblioteca/RepositorioTab";
import VirtualTab from "../../edu/biblioteca/VirtualTab";

const TABS: Array<{ label: string; icon: ReactElement; render: () => ReactNode }> = [
  { label: "Painel", icon: <DashboardIcon />, render: () => <PainelBib /> },
  { label: "Acervo", icon: <MenuBookIcon />, render: () => <AcervoTab /> },
  { label: "Circulação", icon: <SwapHorizIcon />, render: () => <CirculacaoTab /> },
  { label: "Adequação", icon: <SchoolIcon />, render: () => <AdequacaoTabBib /> },
  { label: "Biblioteca virtual", icon: <CloudIcon />, render: () => <VirtualTab /> },
  { label: "Repositório", icon: <AccountBalanceIcon />, render: () => <RepositorioTab /> },
  { label: "Configuração", icon: <SettingsIcon />, render: () => <ConfigBib /> },
];

export default function EduBiblioteca() {
  const [tab, setTab] = useState(0);
  return (
    <EduShell title="Biblioteca" subtitle="Acervo, circulação, reservas, adequação da bibliografia, biblioteca virtual e repositório institucional.">
      <Paper variant="outlined" sx={{ borderRadius: 4, mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          {TABS.map((t) => <Tab key={t.label} label={t.label} icon={t.icon} iconPosition="start" sx={{ textTransform: "none", fontWeight: 700, minHeight: 56 }} />)}
        </Tabs>
      </Paper>
      <Box>{TABS[tab].render()}</Box>
    </EduShell>
  );
}
