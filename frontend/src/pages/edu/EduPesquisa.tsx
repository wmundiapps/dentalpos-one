import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import ProducaoTab from "../../edu/pesquisa/ProducaoTab";
import ProjetosTab from "../../edu/pesquisa/ProjetosTab";
import TccTab from "../../edu/pesquisa/TccTab";
import PeriodicoTab from "../../edu/pesquisa/PeriodicoTab";

const TABS = [
  { label: "Produção científica", el: () => <ProducaoTab /> },
  { label: "Projetos e bolsas", el: () => <ProjetosTab /> },
  { label: "TCC, dissertações e bancas", el: () => <TccTab /> },
  { label: "Periódico / revista", el: () => <PeriodicoTab /> },
];

export default function EduPesquisa() {
  const [tab, setTab] = useState(0);
  return (
    <EduShell title="Pesquisa" subtitle="Produção científica, projetos, trabalhos de conclusão e periódico institucional com revisão por pares.">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {TABS.map((t) => <Tab key={t.label} label={t.label} />)}
      </Tabs>
      <Box>{TABS[tab].el()}</Box>
    </EduShell>
  );
}
