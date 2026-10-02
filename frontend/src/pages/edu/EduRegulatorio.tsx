import { Box, Tab, Tabs } from "@mui/material";
import { useState, type ReactElement } from "react";
import EduShell from "../../edu/EduShell";
import PainelTab from "../../edu/regulatorio/PainelTab";
import ProcessosTab from "../../edu/regulatorio/ProcessosTab";
import AtosTab from "../../edu/regulatorio/AtosTab";
import ChecklistsTab from "../../edu/regulatorio/ChecklistsTab";
import DiligenciasTab from "../../edu/regulatorio/DiligenciasTab";
import IndicadoresTab from "../../edu/regulatorio/IndicadoresTab";
import SimuladorTab from "../../edu/regulatorio/SimuladorTab";
import AnaliseIaTab from "../../edu/regulatorio/AnaliseIaTab";

const TABS: Array<[string, () => ReactElement]> = [
  ["Painel regulatório", () => <PainelTab />],
  ["Processos MEC", () => <ProcessosTab />],
  ["Atos e portarias", () => <AtosTab />],
  ["Checklists", () => <ChecklistsTab />],
  ["Diligências", () => <DiligenciasTab />],
  ["Autoavaliação", () => <IndicadoresTab />],
  ["Simuladores CPC/CC", () => <SimuladorTab />],
  ["Análise por IA", () => <AnaliseIaTab />],
];

export default function EduRegulatorio() {
  const [tab, setTab] = useState(0);
  return (
    <EduShell title="Regulatório" subtitle="Atos, processos e-MEC, prazos, prontidão e simuladores de conceito.">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {TABS.map(([l]) => <Tab key={l} label={l} />)}
      </Tabs>
      <Box>{TABS[tab][1]()}</Box>
    </EduShell>
  );
}
