import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import PainelTab from "../../edu/lgpd/PainelTab";
import SolicitacoesTab from "../../edu/lgpd/SolicitacoesTab";
import ConsentimentosTab from "../../edu/lgpd/ConsentimentosTab";
import RopaTab from "../../edu/lgpd/RopaTab";
import IncidentesTab from "../../edu/lgpd/IncidentesTab";
import RetencaoTab from "../../edu/lgpd/RetencaoTab";
import EncarregadoTab from "../../edu/lgpd/EncarregadoTab";

export default function EduLgpd() {
  const [tab, setTab] = useState(0);
  const TABS = [
    { label: "Painel", el: () => <PainelTab onGo={setTab} /> },
    { label: "Solicitações", el: () => <SolicitacoesTab /> },
    { label: "Consentimentos", el: () => <ConsentimentosTab /> },
    { label: "Inventário (ROPA)", el: () => <RopaTab /> },
    { label: "Incidentes", el: () => <IncidentesTab /> },
    { label: "Retenção", el: () => <RetencaoTab /> },
    { label: "Encarregado e sensíveis", el: () => <EncarregadoTab /> },
  ];
  return (
    <EduShell title="Central LGPD" subtitle="Direitos dos titulares, consentimentos, inventário de tratamento, retenção, incidentes e encarregado (DPO).">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {TABS.map((t) => <Tab key={t.label} label={t.label} />)}
      </Tabs>
      <Box>{TABS[tab].el()}</Box>
    </EduShell>
  );
}
