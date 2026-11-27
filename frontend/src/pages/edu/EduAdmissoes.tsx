import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import BolsasTab from "../../edu/admissoes/BolsasTab";
import CampanhasTab from "../../edu/admissoes/CampanhasTab";
import ClassificacaoTab from "../../edu/admissoes/ClassificacaoTab";
import FunilTab from "../../edu/admissoes/FunilTab";
import MatriculaTab from "../../edu/admissoes/MatriculaTab";
import PainelTab from "../../edu/admissoes/PainelTab";
import ProcessosTab from "../../edu/admissoes/ProcessosTab";
import RematriculaTab from "../../edu/admissoes/RematriculaTab";
import { useToast } from "../../edu/admissoes/common";

const ABAS = ["Painel", "Processos e ofertas", "Campanhas e ROI", "Funil de candidatos", "Classificação e chamadas", "Matrícula", "Bolsas", "Rematrícula"];

export default function EduAdmissoes() {
  const [tab, setTab] = useState(() => {
    try { return Number(localStorage.getItem("edu.admissoes.tab")) || 0; } catch { return 0; }
  });
  const { setMsg, node } = useToast();
  function go(v: number) { setTab(v); try { localStorage.setItem("edu.admissoes.tab", String(v)); } catch { /* sem armazenamento */ } }

  return (
    <EduShell title="Admissões" subtitle="Captação, processos seletivos, matrícula e rematrícula.">
      <Tabs value={Math.min(tab, ABAS.length - 1)} onChange={(_, v) => go(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {ABAS.map((a) => <Tab key={a} label={a} />)}
      </Tabs>
      <Box>
        {tab === 0 && <PainelTab toast={setMsg} />}
        {tab === 1 && <ProcessosTab />}
        {tab === 2 && <CampanhasTab />}
        {tab === 3 && <FunilTab toast={setMsg} />}
        {tab === 4 && <ClassificacaoTab toast={setMsg} />}
        {tab === 5 && <MatriculaTab toast={setMsg} />}
        {tab === 6 && <BolsasTab toast={setMsg} />}
        {tab === 7 && <RematriculaTab toast={setMsg} />}
      </Box>
      {node}
    </EduShell>
  );
}
