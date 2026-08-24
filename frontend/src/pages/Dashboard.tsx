import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Typography,
} from "@mui/material";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import EventIcon from "@mui/icons-material/Event";
import PaymentsIcon from "@mui/icons-material/Payments";
import BiotechIcon from "@mui/icons-material/Biotech";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useNavigate } from "react-router-dom";
import DashboardCard from "../components/DashboardCard";
import RevenueChart from "../components/RevenueChart";
import {
  getAppointments,
  getLaboratoryWorks,
  getOperationalAlerts,
  subscribeOperations,
} from "../services/OperationsHubService";
import type { IntegratedAppointment, OperationalAlert } from "../types/operationsHub";

const todayISO = () => new Date().toISOString().slice(0, 10);

function severityColor(severity: OperationalAlert["severity"]) {
  if (severity === "error") return { bg: "rgba(239,68,68,.08)", text: "#991B1B" };
  if (severity === "warning") return { bg: "rgba(245,158,11,.10)", text: "#92400E" };
  if (severity === "success") return { bg: "rgba(34,197,94,.08)", text: "#166534" };
  return { bg: "rgba(59,130,246,.08)", text: "#1E40AF" };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<IntegratedAppointment[]>(getAppointments);
  const [alerts, setAlerts] = useState<OperationalAlert[]>(getOperationalAlerts);
  const [labCount, setLabCount] = useState(getLaboratoryWorks().filter((work) => !["Entregue", "Liberado"].includes(work.status)).length);

  useEffect(() => {
    const refresh = () => {
      setAppointments(getAppointments());
      setAlerts(getOperationalAlerts());
      setLabCount(getLaboratoryWorks().filter((work) => !["Entregue", "Liberado"].includes(work.status)).length);
    };
    const unsubscribe = subscribeOperations(refresh);
    window.addEventListener("dentalpos:finance-changed", refresh);
    return () => { unsubscribe(); window.removeEventListener("dentalpos:finance-changed", refresh); };
  }, []);

  const todayAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.dateISO === todayISO()).sort((a, b) => a.time.localeCompare(b.time)),
    [appointments],
  );

  const criticalAlerts = alerts.filter((alert) => alert.severity === "error").length;
  const financialAlerts = alerts.filter((alert) => alert.area === "Financeiro" || alert.area === "Pacientes").length;

  const cards = [
    { titulo: "Agenda hoje", valor: String(todayAppointments.length), descricao: "Consultas programadas", icone: <EventIcon />, path: "/agenda" },
    { titulo: "Laboratório ativo", valor: String(labCount), descricao: "Trabalhos em andamento", icone: <BiotechIcon />, path: "/laboratorio" },
    { titulo: "Financeiro / cobranças", valor: String(financialAlerts), descricao: "Avisos que exigem ação", icone: <PaymentsIcon />, path: "/financeiro" },
    { titulo: "Alertas críticos", valor: String(criticalAlerts), descricao: "Atenção imediata", icone: <WarningAmberIcon />, path: "/notificacoes" },
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>Dashboard</Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Visão operacional integrada do DentalPos One.
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }, gap: 3 }}>
        {cards.map((card) => <DashboardCard key={card.titulo} {...card} onClick={() => navigate(card.path)} />)}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.4fr 1fr" }, gap: 3, mt: 4 }}>
        <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>Central de alertas operacional</Typography>
              <Typography variant="body2" color="text.secondary">Laboratório, agenda, financeiro, pacientes e RH no mesmo lugar.</Typography>
            </Box>
            <Chip label={`${alerts.length} avisos`} color={criticalAlerts ? "error" : "primary"} />
          </Box>

          {alerts.length === 0 ? (
            <Typography color="text.secondary">Nenhum aviso crítico neste momento.</Typography>
          ) : alerts.slice(0, 10).map((alert, index) => {
            const palette = severityColor(alert.severity);
            return (
              <Box key={alert.id}>
                <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", py: 1.4 }}>
                  <Box sx={{ width: 38, height: 38, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: palette.bg, color: palette.text }}>
                    <WarningAmberIcon fontSize="small" />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                      <Typography sx={{ fontWeight: 800 }}>{alert.title}</Typography>
                      <Chip size="small" label={alert.area} />
                    </Box>
                    <Typography variant="body2" color="text.secondary">{alert.description}</Typography>
                  </Box>
                  <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(alert.route)}>Abrir</Button>
                </Box>
                {index < Math.min(alerts.length, 10) - 1 && <Divider />}
              </Box>
            );
          })}
        </Paper>

        <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Agenda de hoje</Typography>
          {todayAppointments.length === 0 ? (
            <Typography color="text.secondary">Nenhuma consulta para hoje.</Typography>
          ) : todayAppointments.slice(0, 6).map((appointment, index) => (
            <Box key={appointment.id}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.3 }}>
                <Avatar sx={{ width: 40, height: 40, bgcolor: "primary.main" }}>{appointment.patientName.charAt(0)}</Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 800 }}>{appointment.time} — {appointment.patientName}</Typography>
                  <Typography variant="body2" color="text.secondary">{appointment.procedure}</Typography>
                  <Typography variant="caption" color="primary.main">Próximo: {appointment.nextProcedure}</Typography>
                </Box>
                <Chip size="small" label={appointment.status} />
              </Box>
              {index < todayAppointments.length - 1 && <Divider />}
            </Box>
          ))}
          <Button fullWidth sx={{ mt: 2 }} endIcon={<ArrowForwardIcon />} onClick={() => navigate("/agenda")}>Abrir agenda</Button>
        </Paper>
      </Box>

      <Paper elevation={0} sx={{ mt: 3, p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <PeopleAltIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Faturamento e gestão</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">Indicadores financeiros atuais; integração bancária será conectada ao módulo financeiro.</Typography>
        <RevenueChart />
      </Paper>
    </Box>
  );
}
