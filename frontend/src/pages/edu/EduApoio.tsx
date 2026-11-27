import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import AtendimentosTab from "../../edu/apoio/AtendimentosTab";
import RiscoTab from "../../edu/apoio/RiscoTab";
import BolsasTab from "../../edu/apoio/BolsasTab";
import OuvidoriaTab from "../../edu/apoio/OuvidoriaTab";
import DocenteTab from "../../edu/apoio/DocenteTab";
import EgressosTab from "../../edu/apoio/EgressosTab";

const TABS = [
  { label: "Atendimentos", el: () => <AtendimentosTab /> },
  { label: "Risco de evasão", el: () => <RiscoTab /> },
  { label: "Bolsas", el: () => <BolsasTab /> },
  { label: "Ouvidoria", el: () => <OuvidoriaTab /> },
  { label: "Apoio docente", el: () => <DocenteTab /> },
  { label: "Egressos", el: () => <EgressosTab /> },
];

export default function EduApoio() {
  const [tab, setTab] = useState(0);
  return (
    <EduShell title="Apoio ao Estudante" subtitle="Atendimento NAE/NAPNE, permanência, bolsas, ouvidoria, apoio ao docente e acompanhamento de egressos.">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {TABS.map((t) => <Tab key={t.label} label={t.label} />)}
      </Tabs>
      <Box>{TABS[tab].el()}</Box>
    </EduShell>
  );
}
