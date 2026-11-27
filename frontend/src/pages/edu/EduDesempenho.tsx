import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import ExamesTab from "../../edu/desempenho/ExamesTab";
import QuestoesTab from "../../edu/desempenho/QuestoesTab";
import SimuladosTab from "../../edu/desempenho/SimuladosTab";
import AtividadesTab from "../../edu/desempenho/AtividadesTab";
import TrilhasTab from "../../edu/desempenho/TrilhasTab";
import PainelTab from "../../edu/desempenho/PainelTab";

const TABS = [
  { label: "Painel analítico", el: () => <PainelTab /> },
  { label: "Exames e inscrições", el: () => <ExamesTab /> },
  { label: "Banco de questões", el: () => <QuestoesTab /> },
  { label: "Simulados", el: () => <SimuladosTab /> },
  { label: "Atividades dos professores", el: () => <AtividadesTab /> },
  { label: "Trilhas de preparação", el: () => <TrilhasTab /> },
];

export default function EduDesempenho() {
  const [tab, setTab] = useState(0);
  return (
    <EduShell title="Desempenho" subtitle="ENADE, OAB, ENAMED e demais exames: preparação, simulados e acompanhamento por curso.">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {TABS.map((t) => <Tab key={t.label} label={t.label} />)}
      </Tabs>
      <Box>{TABS[tab].el()}</Box>
    </EduShell>
  );
}
