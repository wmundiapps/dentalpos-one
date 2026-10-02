import { Tab, Tabs } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import DiagramaTab from "../../edu/jornadas/DiagramaTab";
import InstanciasTab from "../../edu/jornadas/InstanciasTab";
import PainelTab from "../../edu/jornadas/PainelTab";
import PersonaBar, { type Tpl } from "../../edu/jornadas/PersonaBar";

export default function EduJornadas() {
  const [tab, setTab] = useState(0);
  const [persona, setPersona] = useState("ALUNO");
  const [templateId, setTemplateId] = useState("");
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const chave = tpls.find((t) => t.id === templateId)?.chave;
  return (
    <EduShell title="Jornadas" subtitle="Fluxogramas por persona, jornadas em andamento e gargalos — nada cai no esquecimento.">
      <PersonaBar persona={persona} setPersona={setPersona} templateId={templateId} setTemplateId={setTemplateId} onTemplates={setTpls} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        <Tab label="Fluxograma" /><Tab label="Jornadas por pessoa" /><Tab label="Gargalos e atrasos" />
      </Tabs>
      {tab === 0 && <DiagramaTab templateId={templateId} />}
      {tab === 1 && <InstanciasTab persona={persona} templateId={templateId} templateChave={chave} />}
      {tab === 2 && <PainelTab templateId={templateId} />}
    </EduShell>
  );
}
