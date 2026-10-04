import { Tab, Tabs } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import ConformidadeTab from "../../edu/modalidades/ConformidadeTab";
import EngajamentoTab from "../../edu/modalidades/EngajamentoTab";
import OfertasTab from "../../edu/modalidades/OfertasTab";
import PolosTab from "../../edu/modalidades/PolosTab";
import PosTab from "../../edu/modalidades/PosTab";
import TutoriaTab from "../../edu/modalidades/TutoriaTab";

export default function EduModalidades() {
  const [tab, setTab] = useState(0);
  return (
    <EduShell title="Modalidades" subtitle="Presencial, semipresencial, EAD e híbrido — conformidade, polos, tutoria, engajamento e pós-graduação.">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        <Tab label="Conformidade" /><Tab label="Ofertas e práticas" /><Tab label="Polos" /><Tab label="Tutoria" /><Tab label="Engajamento AVA" /><Tab label="Pós-graduação" />
      </Tabs>
      {tab === 0 && <ConformidadeTab />}
      {tab === 1 && <OfertasTab />}
      {tab === 2 && <PolosTab />}
      {tab === 3 && <TutoriaTab />}
      {tab === 4 && <EngajamentoTab />}
      {tab === 5 && <PosTab />}
    </EduShell>
  );
}
