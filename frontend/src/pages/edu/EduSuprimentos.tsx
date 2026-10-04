import { Box, Paper, Tab, Tabs } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import StoreIcon from "@mui/icons-material/Store";
import AssignmentIcon from "@mui/icons-material/Assignment";
import GavelIcon from "@mui/icons-material/Gavel";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import InventoryIcon from "@mui/icons-material/Inventory";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import { useState, type ReactElement, type ReactNode } from "react";
import EduShell from "../../edu/EduShell";
import CatalogoTab from "../../edu/suprimentos/CatalogoTab";
import CotacoesTab from "../../edu/suprimentos/CotacoesTab";
import EstoqueTab from "../../edu/suprimentos/EstoqueTab";
import FornecedoresTab from "../../edu/suprimentos/FornecedoresTab";
import PainelSup from "../../edu/suprimentos/PainelSup";
import PedidosTab from "../../edu/suprimentos/PedidosTab";
import RequisicoesTab from "../../edu/suprimentos/RequisicoesTab";
import VendasTab from "../../edu/suprimentos/VendasTab";

const TABS: Array<{ label: string; icon: ReactElement; render: () => ReactNode }> = [
  { label: "Painel", icon: <DashboardIcon />, render: () => <PainelSup /> },
  { label: "Fornecedores", icon: <StoreIcon />, render: () => <FornecedoresTab /> },
  { label: "Requisições", icon: <AssignmentIcon />, render: () => <RequisicoesTab /> },
  { label: "Cotações", icon: <GavelIcon />, render: () => <CotacoesTab /> },
  { label: "Pedidos", icon: <ShoppingCartIcon />, render: () => <PedidosTab /> },
  { label: "Estoque", icon: <InventoryIcon />, render: () => <EstoqueTab /> },
  { label: "Vendas e PDV", icon: <PointOfSaleIcon />, render: () => <VendasTab /> },
  { label: "Catálogo", icon: <LibraryBooksIcon />, render: () => <CatalogoTab /> },
];

export default function EduSuprimentos() {
  const [tab, setTab] = useState(0);
  return (
    <EduShell title="Suprimentos" subtitle="Compras, cotações, estoque, contratos e vendas da instituição.">
      <Paper variant="outlined" sx={{ borderRadius: 4, mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          {TABS.map((t) => <Tab key={t.label} label={t.label} icon={t.icon} iconPosition="start" sx={{ textTransform: "none", fontWeight: 700, minHeight: 56 }} />)}
        </Tabs>
      </Paper>
      <Box>{TABS[tab].render()}</Box>
    </EduShell>
  );
}
