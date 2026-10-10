import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Paper, Tab, Tabs, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import EmployeesTab from "../components/hr/EmployeesTab";
import TimesheetTab from "../components/hr/TimesheetTab";
import RequestsTab from "../components/hr/RequestsTab";
import PayrollTab from "../components/hr/PayrollTab";
import RecordsTab from "../components/hr/RecordsTab";
import { HrApi, money, type Employee } from "../services/HrApi";

// RH, administração e gestor. O colaborador comum não chega aqui: ele usa "Meu ponto" e só vê os próprios dados.
export default function HumanResources() {
  const [tab, setTab] = useState(0);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    try {
      setEmployees(await HrApi.employees());
      setPending((await HrApi.requests("PENDENTE")).length);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar o RH."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const active = employees.filter((e) => e.status !== "TERMINATED");
  const cost = active.reduce((a, e) => a + Number(e.baseSalary || 0), 0);
  return (
    <Box>
      <PageHeader title="RH e Gestão de Pessoas" description="Colaboradores, ponto e banco de horas, justificativas, folha, férias, documentos e ocorrências." />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {pending > 0 && <Alert severity="warning" sx={{ mb: 2 }}>Há {pending} justificativa(s) de falta aguardando análise do RH ou do gestor.</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" }, gap: 2, mb: 2 }}>
        {[["Colaboradores ativos", String(active.length)], ["Em experiência", String(active.filter((e) => e.status === "EXPERIENCE").length)], ["Custo-base mensal", money(cost)], ["Justificativas em análise", String(pending)]].map(([t, v]) => (
          <Paper key={t} sx={{ p: 2.2, borderRadius: 3 }}><Typography color="text.secondary">{t}</Typography><Typography variant="h5" sx={{ fontWeight: 900 }}>{v}</Typography></Paper>
        ))}
      </Box>
      <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
          <Tab label="Colaboradores" /><Tab label="Ponto e banco de horas" /><Tab label={`Justificativas${pending ? ` (${pending})` : ""}`} /><Tab label="Folha" /><Tab label="Férias" /><Tab label="Documentos" /><Tab label="Ocorrências" />
        </Tabs>
        {tab === 0 && <EmployeesTab employees={employees} onChanged={() => void load()} />}
        {tab === 1 && <TimesheetTab employees={employees} canEdit />}
        {tab === 2 && <RequestsTab canDecide />}
        {tab === 3 && <PayrollTab employees={employees} />}
        {tab === 4 && <RecordsTab kind="vacations" employees={active} />}
        {tab === 5 && <RecordsTab kind="documents" employees={active} />}
        {tab === 6 && <RecordsTab kind="discipline" employees={active} />}
      </Paper>
    </Box>
  );
}
