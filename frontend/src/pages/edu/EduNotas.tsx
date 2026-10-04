import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import AlunoTab from "../../edu/notas/AlunoTab";
import DiarioTab from "../../edu/notas/DiarioTab";
import GestaoTab from "../../edu/notas/GestaoTab";
import RegrasTab from "../../edu/notas/RegrasTab";
import RevisoesTab from "../../edu/notas/RevisoesTab";

const ABAS = ["Diário e lançamento", "Boletim e histórico", "Revisões de nota", "Gestão e risco", "Regras de avaliação"];

export default function EduNotas() {
  const [tab, setTab] = useState(0);
  return (
    <EduShell title="Notas e Diário" subtitle="Regras de avaliação, lançamento de notas, diário, boletim, histórico, revisões e acompanhamento de risco.">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>{ABAS.map((a) => <Tab key={a} label={a} />)}</Tabs>
      <Box>
        {tab === 0 && <DiarioTab />}{tab === 1 && <AlunoTab />}{tab === 2 && <RevisoesTab />}{tab === 3 && <GestaoTab />}{tab === 4 && <RegrasTab />}
      </Box>
    </EduShell>
  );
}
