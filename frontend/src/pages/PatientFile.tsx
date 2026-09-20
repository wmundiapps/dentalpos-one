import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import SummarizeIcon from "@mui/icons-material/Summarize";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import GridOnIcon from "@mui/icons-material/GridOn";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import ImageIcon from "@mui/icons-material/Image";
import DescriptionIcon from "@mui/icons-material/Description";
import PaymentsIcon from "@mui/icons-material/Payments";
import EventIcon from "@mui/icons-material/Event";
import type { ReactNode } from "react";
import PageHeader from "../components/PageHeader";
import PatientHeader, { type ClinicalAlerts } from "../components/patient/PatientHeader";
import MedicalHistoryTab from "../components/patient/MedicalHistoryTab";
import ClinicalRecord from "./ClinicalRecord";
import OdontogramPeriodontogram from "./OdontogramPeriodontogram";
import TreatmentPlanning from "./TreatmentPlanning";
import Financial from "./Financial";
import ClinicalFiles from "./ClinicalFiles";
import ClinicalDocuments from "./ClinicalDocuments";
import { loadBackendPatient, type BackendPatient } from "../services/PatientApi";
import { loadBackendAppointments, type BackendAppointment } from "../services/AppointmentApi";
import { getTreatmentPlan } from "../services/TreatmentPlanApi";
import { loadClinicalRecord } from "../services/ClinicalAnamnesisApi";
import type { ClinicalRecordData } from "../types/clinicalAnamnesis";

const STATUS_CONSULTA: Record<string, string> = { SCHEDULED: "Agendado", CONFIRMED: "Confirmado", WAITING: "Aguardando confirmação", IN_PROGRESS: "Em atendimento", COMPLETED: "Finalizado", FINALIZED: "Finalizado", CANCELLED: "Cancelado", NO_SHOW: "Faltou" };

function doctorName(a: BackendAppointment) {
  if (!a.doctor) return "";
  return `Dr(a). ${a.doctor.user.firstName} ${a.doctor.user.lastName}`.trim();
}
function dataHora(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function Consultas({ rows, loading }: { rows: BackendAppointment[]; loading: boolean }) {
  if (loading) return <Box sx={{ display: "grid", placeItems: "center", minHeight: 200 }}><CircularProgress /></Box>;
  const agora = new Date().toISOString();
  const futuras = rows.filter((a) => a.scheduledAt >= agora && a.status !== "CANCELLED").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const passadas = rows.filter((a) => a.scheduledAt < agora || a.status === "CANCELLED").sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const lista = (itens: BackendAppointment[], vazio: string) => itens.length
    ? <Box sx={{ display: "grid", gap: 1, mb: 3 }}>{itens.map((a) => (
        <Paper key={a.id} variant="outlined" sx={{ p: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
            <Box>
              <Typography sx={{ fontWeight: 800 }}>{a.procedure}</Typography>
              <Typography variant="body2" color="text.secondary">{dataHora(a.scheduledAt)}{doctorName(a) ? ` • ${doctorName(a)}` : ""}</Typography>
            </Box>
            <Chip size="small" label={STATUS_CONSULTA[a.status] || a.status} />
          </Box>
        </Paper>))}
      </Box>
    : <Typography color="text.secondary" sx={{ mb: 3 }}>{vazio}</Typography>;
  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>{"Próximos atendimentos"}</Typography>
      {lista(futuras, "Nenhum atendimento futuro.")}
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>{"Atendimentos anteriores"}</Typography>
      {lista(passadas, "Nenhum atendimento anterior.")}
    </Box>
  );
}

function Resumo({ patient, plan, appts, ir }: { patient: BackendPatient; plan: { progress: number | null; pending: number | null }; appts: BackendAppointment[]; ir: (k: string) => void }) {
  const agora = new Date().toISOString();
  const proxima = appts.filter((a) => a.scheduledAt >= agora && a.status !== "CANCELLED").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  const ultima = appts.filter((a) => a.scheduledAt < agora).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0];
  const cards: Array<[string, string]> = [
    ["Execução do tratamento", plan.progress === null ? "—" : `${plan.progress}%`],
    ["Procedimentos pendentes", plan.pending === null ? "—" : String(plan.pending)],
    ["Próximo atendimento", proxima ? dataHora(proxima.scheduledAt) : "Nenhum agendado"],
    ["Último atendimento", ultima ? dataHora(ultima.scheduledAt) : "—"],
  ];
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" }, gap: 2 }}>
        {cards.map(([t, v]) => (
          <Paper key={t} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="body2" color="text.secondary">{t}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>{v}</Typography>
          </Paper>
        ))}
      </Box>
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography sx={{ fontWeight: 900, mb: 1 }}>Atalhos</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button variant="contained" startIcon={<ImageIcon />} onClick={() => ir("exames")}>Adicionar exame ou imagem</Button>
          <Button variant="outlined" startIcon={<AssignmentIndIcon />} onClick={() => ir("prontuario")}>{"Abrir prontuário"}</Button>
          <Button variant="outlined" startIcon={<GridOnIcon />} onClick={() => ir("odontograma")}>Odontograma</Button>
          <Button variant="outlined" startIcon={<RequestQuoteIcon />} onClick={() => ir("plano")}>{"Plano e orçamento"}</Button>
        </Box>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography sx={{ fontWeight: 900, mb: 1 }}>Dados cadastrais</Typography>
        <Typography><b>Telefone:</b> {patient.phone}</Typography>
        {patient.email && <Typography><b>E-mail:</b> {patient.email}</Typography>}
        {patient.cpf && <Typography><b>CPF:</b> {patient.cpf}</Typography>}
        {patient.birthDate && <Typography><b>Nascimento:</b> {new Date(patient.birthDate).toLocaleDateString("pt-BR")}</Typography>}
        {patient.city && <Typography><b>Cidade:</b> {patient.city}</Typography>}
        <Typography sx={{ mt: 1 }}><b>Tratamento principal:</b> {patient.treatment || "Não definido"}</Typography>
      </Paper>
    </Box>
  );
}

export default function PatientFile() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const patientId = searchParams.get("patientId") || "";
  const [patient, setPatient] = useState<BackendPatient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("resumo");
  const [record, setRecord] = useState<ClinicalRecordData | null>(null);
  const [recordLoading, setRecordLoading] = useState(true);
  const [appts, setAppts] = useState<BackendAppointment[]>([]);
  const [apptsLoading, setApptsLoading] = useState(true);
  const [plan, setPlan] = useState<{ progress: number | null; pending: number | null }>({ progress: null, pending: null });

  useEffect(() => {
    let active = true;
    if (!patientId) { setError("Selecione um paciente para abrir a ficha."); setLoading(false); return; }
    setLoading(true); setError(""); setTab("resumo");
    loadBackendPatient(patientId)
      .then((d) => { if (active) setPatient(d); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Erro ao carregar paciente."); })
      .finally(() => { if (active) setLoading(false); });
    setRecordLoading(true);
    loadClinicalRecord(patientId)
      .then((b) => { if (active) setRecord(b.record.data); })
      .catch(() => { if (active) setRecord(null); })
      .finally(() => { if (active) setRecordLoading(false); });
    setApptsLoading(true);
    loadBackendAppointments()
      .then((rows) => { if (active) setAppts(rows.filter((a) => a.patientId === patientId)); })
      .catch(() => undefined)
      .finally(() => { if (active) setApptsLoading(false); });
    getTreatmentPlan(patientId)
      .then((p) => { if (active) setPlan({ progress: p.progressPercent, pending: p.items.filter((i) => i.status !== "COMPLETED" && i.status !== "CANCELLED").length }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [patientId]);

  const nome = patient?.fullName || "";
  useEffect(() => {
    if (!patient) return;
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (next.get("patient") !== nome) { next.set("patient", nome); changed = true; }
    if (next.get("paciente") !== nome) { next.set("paciente", nome); changed = true; }
    if (changed) navigate(`/ficha-paciente?${next.toString()}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient]);

  const alerts: ClinicalAlerts = useMemo(() => ({
    allergies: record?.allergies?.length ? record.allergies : (patient?.allergies ? [patient.allergies] : []),
    diseases: record?.systemicDiseases || [],
    medications: record?.medications?.length ? record.medications : (patient?.medications ? [patient.medications] : []),
    alerts: [...(record?.clinicalAlerts || []), ...(record?.riskConditions || [])],
  }), [record, patient]);

  const ir = useCallback((k: string) => setTab(k), []);

  const abas: Array<{ key: string; label: string; icon: ReactNode }> = [
    { key: "resumo", label: "Resumo", icon: <SummarizeIcon /> },
    { key: "historico", label: "Histórico Médico", icon: <MonitorHeartIcon /> },
    { key: "prontuario", label: "Prontuário", icon: <AssignmentIndIcon /> },
    { key: "odontograma", label: "Odontograma", icon: <GridOnIcon /> },
    { key: "plano", label: "Plano e Orçamento", icon: <RequestQuoteIcon /> },
    { key: "exames", label: "Exames e Imagens", icon: <ImageIcon /> },
    { key: "documentos", label: "Documentos", icon: <DescriptionIcon /> },
    { key: "financeiro", label: "Financeiro", icon: <PaymentsIcon /> },
    { key: "atendimentos", label: "Atendimentos", icon: <EventIcon /> },
  ];

  if (loading) return <Box sx={{ display: "grid", placeItems: "center", minHeight: 320 }}><CircularProgress /></Box>;
  if (error || !patient) {
    return (
      <Box>
        <PageHeader title="Ficha do paciente" description={"Cadastro, histórico, prontuário, exames, orçamento e atendimentos em um só lugar."} />
        <Alert severity="error">{error || "Paciente não encontrado."}</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <PatientHeader patient={patient} alerts={alerts} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(3,1fr)", sm: "repeat(5,1fr)", lg: "repeat(9,1fr)" }, gap: 1, mb: 2 }}>
        {abas.map((a) => {
          const ativo = tab === a.key;
          return (
            <Paper key={a.key} variant="outlined" onClick={() => setTab(a.key)}
              sx={{ p: 1.2, borderRadius: 2, cursor: "pointer", textAlign: "center", borderColor: ativo ? "primary.main" : "divider", bgcolor: ativo ? "primary.main" : "background.paper", color: ativo ? "#fff" : "text.primary", "&:hover": { borderColor: "primary.main" } }}>
              <Box sx={{ display: "flex", justifyContent: "center", mb: 0.3 }}>{a.icon}</Box>
              <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.1, display: "block" }}>{a.label}</Typography>
            </Paper>
          );
        })}
      </Box>
      <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 2, md: 3 } }}>
        {tab === "resumo" && <Resumo patient={patient} plan={plan} appts={appts} ir={ir} />}
        {tab === "historico" && <MedicalHistoryTab patient={patient} data={record} loading={recordLoading} />}
        {tab === "prontuario" && <ClinicalRecord />}
        {tab === "odontograma" && <OdontogramPeriodontogram />}
        {tab === "plano" && <TreatmentPlanning initialPatientId={patient.id} />}
        {tab === "exames" && <ClinicalFiles fixedPatientId={patient.id} />}
        {tab === "documentos" && <ClinicalDocuments fixedPatientId={patient.id} />}
        {tab === "financeiro" && <Financial />}
        {tab === "atendimentos" && <Consultas rows={appts} loading={apptsLoading} />}
      </Paper>
    </Box>
  );
}