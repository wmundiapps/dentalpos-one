import LockedUsersUnlock from "../components/LockedUsersUnlock";
import { loadFinancialDashboard, type FinancialDashboard } from "../services/FinancialApi";
import MobileHome from "../components/MobileHome";
import CashbacksmartButton from "../components/CashbacksmartButton";
import StockLowAlert from "../components/StockLowAlert";
import UnscheduledPatientsCard from "../components/UnscheduledPatientsCard";
import DueRemindersCard from "../components/DueRemindersCard";
import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  MenuItem,
  Paper,
  Typography,
  TextField,
  useMediaQuery,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import EventIcon from "@mui/icons-material/Event";
import PaymentsIcon from "@mui/icons-material/Payments";
import BiotechIcon from "@mui/icons-material/Biotech";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useNavigate } from "react-router-dom";
import DashboardCard from "../components/DashboardCard";
import RevenueChart from "../components/RevenueChart";
import {
  getAppointments,
  getLaboratoryWorks,
  getFinanceRowsForAlerts,
  subscribeOperations,
} from "../services/OperationsHubService";
import type { IntegratedAppointment } from "../types/operationsHub";
import HomeCalendar from "../components/home/HomeCalendar";
import DayAgenda from "../components/home/DayAgenda";
import { departmentOf } from "../components/home/AlertsPanel";
import { useCriticalAlerts } from "../hooks/useCriticalAlerts";
import { OPEN_ALERTS_EVENT } from "../components/alerts/AlertsMenu";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Dashboard() {
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width:700px)");
  const [fin, setFin] = useState<FinancialDashboard | null>(null);
  useEffect(() => { if (isMobile) loadFinancialDashboard().then(setFin).catch(() => setFin(null)); }, [isMobile]);
  const [appointments, setAppointments] = useState<IntegratedAppointment[]>(getAppointments);
  const { alerts } = useCriticalAlerts();
  const [labCount, setLabCount] = useState(getLaboratoryWorks().filter((work) => !["Entregue", "Liberado"].includes(work.status)).length);
  const [dentist, setDentist] = useState("Todos");
  const [selectedDay, setSelectedDay] = useState(todayISO());

  useEffect(() => {
    const handler = () => {
      setAppointments(getAppointments());
      setLabCount(getLaboratoryWorks().filter((work) => !["Entregue", "Liberado"].includes(work.status)).length);
    };
    return subscribeOperations(handler);
  }, []);

  const dentists = useMemo(() => Array.from(new Set(appointments.map((a) => a.professionalName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [appointments]);
  // O calendário só marca o dia se o dentista escolhido tiver consulta nele.
  const filtered = useMemo(() => (dentist === "Todos" ? appointments : appointments.filter((a) => a.professionalName === dentist)), [appointments, dentist]);
  const dayList = useMemo(() => filtered.filter((a) => a.dateISO === selectedDay && a.status !== "Cancelado").sort((a, b) => a.time.localeCompare(b.time)), [filtered, selectedDay]);
  const todayCount = appointments.filter((a) => a.dateISO === todayISO()).length;

  const criticalAlerts = alerts.filter((alert) => alert.severity === "error").length;
  const financialAlerts = alerts.filter((alert) => alert.area === "Financeiro" || alert.area === "Pacientes").length;

  const cards = [
    { titulo: "Agenda hoje", valor: String(todayCount), descricao: "Consultas programadas", icone: <EventIcon />, path: "/agenda" },
    { titulo: "Laboratório ativo", valor: String(labCount), descricao: "Trabalhos em andamento", icone: <BiotechIcon />, path: "/laboratorio?filtro=ativos" },
    { titulo: "Financeiro / cobranças", valor: String(financialAlerts), descricao: "Avisos que exigem ação", icone: <PaymentsIcon />, path: "#FIN" },
    { titulo: "Alertas críticos", valor: String(criticalAlerts), descricao: "Atenção imediata", icone: <WarningAmberIcon />, path: "#CRIT" },
  ];

  const openAlerts = (dept: string | null) => window.dispatchEvent(new CustomEvent(OPEN_ALERTS_EVENT, { detail: dept }));
  const openCard = (path: string) => {
    if (path === "#FIN") openAlerts("Contas a receber");
    else if (path === "#CRIT") openAlerts(alerts.filter((a) => a.severity === "error").map(departmentOf)[0] || null);
    else navigate(path);
  };
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const finValue = (v?: number) => (fin ? brl(v || 0) : "…");
  const mobileCards = [
    { titulo: "A receber", valor: finValue(fin?.receivable), cor: "#1976D2", onClick: () => navigate("/financeiro?tipo=Receita") },
    { titulo: "Em atraso", valor: finValue(fin?.overdue), cor: "#C62828", onClick: () => navigate("/financeiro?tipo=Receita") },
    { titulo: "Recebido", valor: finValue(fin?.received), cor: "#4CAF50", onClick: () => navigate("/financeiro?tipo=Receita") },
    { titulo: "Agenda hoje", valor: String(todayCount), cor: "#EC6725", onClick: () => navigate("/agenda") },
    { titulo: "Alertas críticos", valor: String(criticalAlerts), cor: "#6D4C41", onClick: () => openCard("#CRIT") },
  ];

  const dayRaw = new Date(`${selectedDay}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const dayTitle = dayRaw.charAt(0).toUpperCase() + dayRaw.slice(1);

  return (
    <Box sx={{ textAlign: "left" }}>
      <LockedUsersUnlock />
      {isMobile && <Box sx={{ mb: 2 }}><MobileHome cards={mobileCards} onNavigate={navigate} /></Box>}
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 2, textAlign: "left" }}>Início</Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr" }}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 2 }}>
            <Typography sx={{ fontWeight: 900 }}>Agenda</Typography>
            <TextField select size="small" label="Dentista" value={dentist} onChange={(e) => setDentist(e.target.value)} sx={{ minWidth: 210 }}>
              <MenuItem value="Todos">Todos os dentistas</MenuItem>
              {dentists.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </TextField>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "320px minmax(0,1fr)" }, gap: 3 }}>
            <HomeCalendar appointments={filtered} selected={selectedDay} onSelect={setSelectedDay} />
            <Box>
              <Typography sx={{ fontWeight: 800, mb: 1, textAlign: "left" }}>{dayTitle}</Typography>
              <DayAgenda appointments={dayList} finance={getFinanceRowsForAlerts()} works={getLaboratoryWorks()} />
              <Button size="small" sx={{ mt: 1 }} onClick={() => navigate("/agenda")}>Abrir agenda completa</Button>
            </Box>
          </Box>
        </Paper>

      </Box>

      <Accordion disableGutters elevation={0} slotProps={{ transition: { unmountOnExit: true } }} sx={{ mt: 3, border: "1px solid", borderColor: "divider", borderRadius: "12px !important", "&:before": { display: "none" } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography sx={{ fontWeight: 800 }}>Mais informações e indicadores</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ display: "grid", gap: 3 }}>
          <StockLowAlert />
          <Box><CashbacksmartButton audience="gestor" /></Box>
          <DueRemindersCard />
          <Box sx={{ display: isMobile ? "none" : "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }, gap: 3 }}>
            {cards.map((card) => <DashboardCard key={card.titulo} {...card} onClick={() => openCard(card.path)} />)}
          </Box>
          <UnscheduledPatientsCard />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Faturamento e gestão</Typography>
            <Typography variant="body2" color="text.secondary">Indicadores financeiros atuais; integração bancária será conectada ao módulo financeiro.</Typography>
            <RevenueChart />
          </Box>
        </AccordionDetails>
      </Accordion>

    </Box>
  );
}
