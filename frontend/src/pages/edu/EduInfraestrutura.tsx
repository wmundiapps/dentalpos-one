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
import EventNoteIcon from "@mui/icons-material/EventNote";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import SecurityIcon from "@mui/icons-material/Security";
import BadgeIcon from "@mui/icons-material/Badge";
import { type ReactElement, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
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
import AgendaTab from "../../edu/infraestrutura/AgendaTab";
import SolicitacoesTab from "../../edu/infraestrutura/SolicitacoesTab";
import FrotaTab from "../../edu/infraestrutura/FrotaTab";
import SegurancaTab from "../../edu/infraestrutura/SegurancaTab";
import IndicadoresPessoasTab from "../../edu/infraestrutura/IndicadoresPessoasTab";
import EtiquetasTab from "../../edu/infraestrutura/EtiquetasTab";
import TransferenciasTab from "../../edu/infraestrutura/TransferenciasTab";
import InventarioQrTab from "../../edu/infraestrutura/InventarioQrTab";
import LabelIcon from "@mui/icons-material/QrCode2";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import FactCheckIcon from "@mui/icons-material/FactCheck";

const TABS: Array<{ key: string; label: string; icon: ReactElement; render: () => ReactNode }> = [
  { key: "painel", label: "Painel", icon: <DashboardIcon />, render: () => <PainelTab /> },
  { key: "agenda", label: "Agenda", icon: <EventNoteIcon />, render: () => <AgendaTab /> },
  { key: "solicitacoes", label: "Solicitações e OS", icon: <ReportProblemIcon />, render: () => <SolicitacoesTab /> },
  { key: "frota", label: "Frota", icon: <DirectionsCarIcon />, render: () => <FrotaTab /> },
  { key: "seguranca", label: "Segurança patrimonial", icon: <SecurityIcon />, render: () => <SegurancaTab /> },
  { key: "pessoas", label: "Indicadores de pessoas", icon: <BadgeIcon />, render: () => <IndicadoresPessoasTab /> },
  { key: "patrimonio", label: "Patrimônio", icon: <Inventory2Icon />, render: () => <PatrimonioTab /> },
  { key: "etiquetas", label: "Etiquetas", icon: <LabelIcon />, render: () => <EtiquetasTab /> },
  { key: "transferencias", label: "Transferências", icon: <SwapHorizIcon />, render: () => <TransferenciasTab /> },
  { key: "inventarioqr", label: "Inventário (QR)", icon: <FactCheckIcon />, render: () => <InventarioQrTab /> },
  { key: "manutencao", label: "Manutenção e OS", icon: <BuildIcon />, render: () => <ManutencaoTab /> },
  { key: "chamados", label: "Chamados", icon: <ConfirmationNumberIcon />, render: () => <ChamadosTab /> },
  { key: "melhorias", label: "Melhorias 5W2H", icon: <EngineeringIcon />, render: () => <MelhoriasTab /> },
  { key: "estacionamento", label: "Estacionamento", icon: <LocalParkingIcon />, render: () => <EstacionamentoTab /> },
  { key: "patio", label: "Pátio e reservas", icon: <YardIcon />, render: () => <PatioTab /> },
  { key: "energia", label: "Iluminação e energia", icon: <LightbulbIcon />, render: () => <EnergiaTab /> },
  { key: "adequacao", label: "Adequação por curso", icon: <SchoolIcon />, render: () => <AdequacaoTab /> },
];

export default function EduInfraestrutura() {
  const [params, setParams] = useSearchParams();
  const idx = Math.max(0, TABS.findIndex((t) => t.key === params.get("secao")));
  const tab = idx;
  const setTab = (v: number) => { const p = new URLSearchParams(params); p.set("secao", TABS[v].key); p.delete("qr"); setParams(p, { replace: true }); };
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
