import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import PageHeader from "../components/PageHeader";
import ClinicalRecord from "./ClinicalRecord";
import OdontogramPeriodontogram from "./OdontogramPeriodontogram";
import TreatmentPlanning from "./TreatmentPlanning";
import Financial from "./Financial";
import { loadBackendPatient, type BackendPatient } from "../services/PatientApi";
import { loadBackendAppointments, type BackendAppointment } from "../services/AppointmentApi";
import { getTreatmentPlan } from "../services/TreatmentPlanApi";

function doctorName(appointment: BackendAppointment) {
  if (!appointment.doctor) return "";
  return `Dr(a). ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`.trim();
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function AppointmentHistoryTab({ patientId }: { patientId: string }) {
  const [appointments, setAppointments] = useState<BackendAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadBackendAppointments()
      .then((rows) => {
        if (active) setAppointments(rows.filter((a) => a.patientId === patientId));
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Erro ao carregar agenda.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [patientId]);

  const now = new Date().toISOString();
  const upcoming = appointments
    .filter((a) => a.scheduledAt >= now && a.status !== "CANCELLED")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const past = appointments
    .filter((a) => a.scheduledAt < now || a.status === "CANCELLED")
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  if (loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: 200 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
        Próximos agendamentos
      </Typography>
      {upcoming.length ? (
        <Box sx={{ display: "grid", gap: 1, mb: 3 }}>
          {upcoming.map((a) => (
            <Paper key={a.id} variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                <Box>
                  <Typography sx={{ fontWeight: 800 }}>{a.procedure}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatDateTime(a.scheduledAt)} {doctorName(a) ? `• ${doctorName(a)}` : ""}
                  </Typography>
                </Box>
                <Chip size="small" label={a.status} />
              </Box>
            </Paper>
          ))}
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Nenhum agendamento futuro.
        </Typography>
      )}

      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
        Histórico
      </Typography>
      {past.length ? (
        <Box sx={{ display: "grid", gap: 1 }}>
          {past.map((a) => (
            <Paper key={a.id} variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                <Box>
                  <Typography sx={{ fontWeight: 800 }}>{a.procedure}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatDateTime(a.scheduledAt)} {doctorName(a) ? `• ${doctorName(a)}` : ""}
                  </Typography>
                </Box>
                <Chip size="small" variant="outlined" label={a.status} />
              </Box>
            </Paper>
          ))}
        </Box>
      ) : (
        <Typography color="text.secondary">Nenhum atendimento anterior registrado.</Typography>
      )}
    </Box>
  );
}

function OverviewTab({ patient }: { patient: BackendPatient }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getTreatmentPlan(patient.id)
      .then((plan) => {
        if (!active) return;
        setProgress(plan.progressPercent);
        setPendingCount(plan.items.filter((i) => i.status !== "COMPLETED" && i.status !== "CANCELLED").length);
      })
      .catch(() => {
        if (active) {
          setProgress(null);
          setPendingCount(null);
        }
      });
    return () => {
      active = false;
    };
  }, [patient.id]);

  return (
    <Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" },
          gap: 2,
          mb: 3,
        }}
      >
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Typography color="text.secondary">Status</Typography>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            {patient.status || "Ativo"}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Typography color="text.secondary">Execução do tratamento</Typography>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            {progress === null ? "—" : `${progress}%`}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Typography color="text.secondary">Procedimentos pendentes</Typography>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            {pendingCount === null ? "—" : pendingCount}
          </Typography>
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
        <Typography sx={{ fontWeight: 800, mb: 1 }}>Dados cadastrais</Typography>
        <Typography>
          <b>Telefone:</b> {patient.phone}
        </Typography>
        {patient.email && (
          <Typography>
            <b>E-mail:</b> {patient.email}
          </Typography>
        )}
        {patient.cpf && (
          <Typography>
            <b>CPF:</b> {patient.cpf}
          </Typography>
        )}
        {patient.birthDate && (
          <Typography>
            <b>Nascimento:</b> {new Date(patient.birthDate).toLocaleDateString("pt-BR")}
          </Typography>
        )}
        <Typography sx={{ mt: 1 }}>
          <b>Tratamento principal:</b> {patient.treatment || "Não definido"}
        </Typography>
      </Paper>

      {(patient.mainComplaint || patient.allergies || patient.medications || patient.medicalHistory || patient.notes) && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 800, mb: 1 }}>Informações clínicas cadastradas</Typography>
          {patient.mainComplaint && (
            <Typography sx={{ mb: 1 }}>
              <b>Queixa principal:</b> {patient.mainComplaint}
            </Typography>
          )}
          {patient.allergies && (
            <Typography sx={{ mb: 1 }}>
              <b>Alergias:</b> {patient.allergies}
            </Typography>
          )}
          {patient.medications && (
            <Typography sx={{ mb: 1 }}>
              <b>Medicamentos:</b> {patient.medications}
            </Typography>
          )}
          {patient.medicalHistory && (
            <Typography sx={{ mb: 1 }}>
              <b>Histórico médico:</b> {patient.medicalHistory}
            </Typography>
          )}
          {patient.notes && (
            <Typography>
              <b>Observações:</b> {patient.notes}
            </Typography>
          )}
        </Paper>
      )}
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
  const [tab, setTab] = useState(0);

  useEffect(() => {
    let active = true;
    if (!patientId) {
      setError("Selecione um paciente para abrir a ficha.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    loadBackendPatient(patientId)
      .then((data) => {
        if (active) setPatient(data);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Erro ao carregar paciente.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [patientId]);

  useEffect(() => {
    setTab(0);
  }, [patientId]);

  // Garante que o restante da ficha (Odontograma, que lê window.location.search
  // diretamente) sempre encontre patientId/patient/paciente na URL desta tela.
  const patientNameParam = patient?.fullName || "";
  useEffect(() => {
    if (!patient) return;
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (next.get("patient") !== patientNameParam) {
      next.set("patient", patientNameParam);
      changed = true;
    }
    if (next.get("paciente") !== patientNameParam) {
      next.set("paciente", patientNameParam);
      changed = true;
    }
    if (changed) {
      navigate(`/ficha-paciente?${next.toString()}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient]);

  const tabs = useMemo(
    () => ["Visão Geral", "Prontuário", "Odontograma", "Orçamento", "Financeiro", "Agenda"],
    [],
  );

  if (loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: 320 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !patient) {
    return (
      <Box>
        <PageHeader title="Ficha do paciente" description="Cadastro, prontuário, odontograma, orçamento, financeiro e agenda em um só lugar." />
        <Alert severity="error">{error || "Paciente não encontrado."}</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title={`Ficha • ${patient.fullName}`}
        description={`${patient.phone}${patient.cpf ? ` • CPF ${patient.cpf}` : ""}`}
      />

      <Paper variant="outlined" sx={{ borderRadius: 3, mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 2, borderBottom: "1px solid", borderColor: "divider" }}
        >
          {tabs.map((label) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>

        <Box key={patient.id} sx={{ p: { xs: 2, md: 3 } }}>
          {tab === 0 && <OverviewTab patient={patient} />}
          {tab === 1 && <ClinicalRecord />}
          {tab === 2 && <OdontogramPeriodontogram />}
          {tab === 3 && <TreatmentPlanning initialPatientId={patient.id} />}
          {tab === 4 && <Financial />}
          {tab === 5 && <AppointmentHistoryTab patientId={patient.id} />}
        </Box>
      </Paper>
    </Box>
  );
}
