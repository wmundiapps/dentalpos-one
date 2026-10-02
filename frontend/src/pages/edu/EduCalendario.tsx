import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import MesTab from "../../edu/calendario/MesTab";
import GradeTab from "../../edu/calendario/GradeTab";
import GeradorTab from "../../edu/calendario/GeradorTab";
import ReservasTab from "../../edu/calendario/ReservasTab";
import ProvasTab from "../../edu/calendario/ProvasTab";
import PrazosTab from "../../edu/calendario/PrazosTab";
import OcupacaoTab from "../../edu/calendario/OcupacaoTab";
import IcalTab from "../../edu/calendario/IcalTab";
import CadastrosTab from "../../edu/calendario/CadastrosTab";

const ABAS = ["Calendário", "Grade horária", "Gerador", "Reservas", "Provas", "Prazos de notas", "Ocupação", "iCal", "Cadastros"];

export default function EduCalendario() {
  const [tab, setTab] = useState(() => { try { return Number(sessionStorage.getItem("edu.cal.tab")) || 0; } catch { return 0; } });
  const mudar = (v: number) => { setTab(v); try { sessionStorage.setItem("edu.cal.tab", String(v)); } catch { /* ignore */ } };
  return (
    <EduShell title="Calendário e Grade Horária" subtitle="Calendário acadêmico, grade horária, gerador de cronograma, reservas, provas e prazos.">
      <Tabs value={tab} onChange={(_, v) => mudar(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {ABAS.map((a) => <Tab key={a} label={a} />)}
      </Tabs>
      <Box>
        {tab === 0 && <MesTab />}
        {tab === 1 && <GradeTab />}
        {tab === 2 && <GeradorTab />}
        {tab === 3 && <ReservasTab />}
        {tab === 4 && <ProvasTab />}
        {tab === 5 && <PrazosTab />}
        {tab === 6 && <OcupacaoTab />}
        {tab === 7 && <IcalTab />}
        {tab === 8 && <CadastrosTab />}
      </Box>
    </EduShell>
  );
}
