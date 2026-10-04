import { Box, Paper, Tab, Tabs } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import BuildIcon from "@mui/icons-material/Build";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import EngineeringIcon from "@mui/icons-material/Engineering";
import LocalParkingIcon from "@mui/icons-material/LocalParking";
import YardIcon from "@mui/icons-material/Yard";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import SchoolIcon from "@mui/icons-material/School";
import { useState, type ReactElement, type ReactNode } from "react";
import EduShell from "../../edu/EduShell";
import AdequacaoTab from "../../edu/infraestrutura/AdequacaoTab";
import ChamadosTab from "../../edu/infraestrutura/ChamadosTab";
import EnergiaTab from "../../edu/infraestrutura/EnergiaTab";
import EstacionamentoTab from "../../edu/infraestrutura/EstacionamentoTab";
import ManutencaoTab from "../../edu/infraestrutura/ManutencaoTab";
import MelhoriasTab from "../../edu/infraestrutura/MelhoriasTab";
import PainelTab from "../../edu/infraestrutura/PainelTab";
import PatioTab from "../../edu/infraestrutura/PatioTab";
import PatrimonioTab from "../../edu/infraestrutura/PatrimonioTab";

const TABS: Array<{ key: string; label: string; icon: ReactElement; render: () => ReactNode }> = [
  { key: "painel", label: "Painel", icon: <DashboardIcon />, render: () => <PainelTab /> },
  { key: "patrimonio", label: "Patrimônio", icon: <Inventory2Icon />, render: () => <PatrimonioTab /> },
  { key: "manutencao", label: "Manutenção e OS", icon: <BuildIcon />, render: () => <ManutencaoTab /> },
  { key: "chamados", label: "Chamados", icon: <ConfirmationNumberIcon />, render: () => <ChamadosTab /> },
  { key: "melhorias", label: "Melhorias 5W2H", icon: <EngineeringIcon />, render: () => <MelhoriasTab /> },
  { key: "estacionamento", label: "Estacionamento", icon: <LocalParkingIcon />, render: () => <EstacionamentoTab /> },
  { key: "patio", label: "Pátio e reservas", icon: <YardIcon />, render: () => <PatioTab /> },
  { key: "energia", label: "Iluminação e energia", icon: <LightbulbIcon />, render: () => <EnergiaTab /> },
  { key: "adequacao", label: "Adequação por curso", icon: <SchoolIcon />, render: () => <AdequacaoTab /> },
];

export default function EduInfraestrutura() {
  const [tab, setTab] = useState(0);
  return (
    <EduShell title="Infraestrutura" subtitle="Patrimônio, manutenção, chamados, melhorias, estacionamento, pátio, energia e adequação dos cursos.">
      <Paper variant="outlined" sx={{ borderRadius: 4, mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          {TABS.map((t) => <Tab key={t.key} label={t.label} icon={t.icon} iconPosition="start" sx={{ textTransform: "none", fontWeight: 700, minHeight: 56 }} />)}
        </Tabs>
      </Paper>
      <Box>{TABS[tab].render()}</Box>
    </EduShell>
  );
}
