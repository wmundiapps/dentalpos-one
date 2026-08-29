import { useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,

} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LinkIcon from "@mui/icons-material/Link";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import TuneIcon from "@mui/icons-material/Tune";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import PageHeader from "../components/PageHeader";
import ProcedurePicker from "../components/ProcedurePicker";
import SmartSchedulingAssistant from "../components/SmartSchedulingAssistant";
import SmartSchedulingSettingsDialog from "../components/SmartSchedulingSettingsDialog";
import { useNavigate } from "react-router-dom";
import {
  changeAppointmentWithHistory,
  createAppointment,
  getAppointments,
  saveAppointments,
  getOperationalAlerts,
  subscribeOperations,
  updateAppointment,
} from "../services/OperationsHubService";
import { patientFinancialSummary } from "../services/FinanceHubService";
import { listPatients } from "../services/PatientClinicalService";
import { loadBackendPatients } from "../services/PatientApi";
import { createBackendAppointment, loadBackendAppointments, loadBackendDoctors, updateBackendAppointment, type BackendAppointment, type BackendDoctor } from "../services/AppointmentApi";
import { enqueueAppointmentReminders } from "../services/RevahQueueService";
import type { SmartScheduleSuggestion } from "../services/SmartSchedulingService";
import type { IntegratedAppointment } from "../types/operationsHub";
import type { AppointmentStatus } from "../types/appointment";

const iso = (date: Date) => {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
};
const today = () => iso(new Date());
const KEY = "dentalpos.agenda.notification-settings.v1";

type View = "day" | "week" | "month";
type Channel = "WhatsApp" | "SMS";
type StatusFilter = "Todos" | AppointmentStatus;

type AppointmentForm = {
  patientName: string;
  patientPhone: string;
  professionalName: string;
  procedure: string;
  nextProcedure: string;
  dateISO: string;
  time: string;
  room: string;
  category: NonNullable<IntegratedAppointment["category"]>;
  durationMinutes: number;
  laboratoryName: string;
};

const defaultProfessionals = ["Todos", "Dr. Robson", "Dra. Cássia"];

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function backendAppointmentId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return -Math.abs(hash || 1);
}

function backendStatus(status: string): AppointmentStatus {
  const map: Record<string, AppointmentStatus> = {
    SCHEDULED: "Agendado",
    CONFIRMED: "Confirmado",
    WAITING: "Aguardando",
    ROOM_PREPARATION: "Sala em preparação",
    IN_PROGRESS: "Em atendimento",
    COMPLETED: "Finalizado",
    FINALIZED: "Finalizado",
    CANCELLED: "Cancelado",
    NO_SHOW: "Faltou",
  };
  return map[status] || "Agendado";
}

function backendStatusValue(status: AppointmentStatus): string {
  const map: Record<AppointmentStatus, string> = {
    "Agendado": "SCHEDULED",
    "Confirmado": "CONFIRMED",
    "Aguardando": "WAITING",
    "Sala em preparação": "ROOM_PREPARATION",
    "Em atendimento": "IN_PROGRESS",
    "Finalizado": "COMPLETED",
    "Cancelado": "CANCELLED",
    "Faltou": "NO_SHOW",
  };
  return map[status];
}
function mapBackendAppointment(appointment: BackendAppointment): IntegratedAppointment {
  const scheduled = new Date(appointment.scheduledAt);
  const doctorName = appointment.doctor?.user
    ? `Dr. ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`.trim()
    : "Profissional";

  return {
    id: backendAppointmentId(appointment.id),
    backendId: appointment.id,
    patientName: appointment.patient?.fullName || "Paciente",
    patientPhone: appointment.patient?.phone || "",
    professionalName: doctorName,
    procedure: appointment.procedure,
    nextProcedure: appointment.nextProcedure || "Definir após atendimento",
    dateISO: iso(scheduled),
    time: scheduled.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }),
    room: appointment.room || "A definir",
    status: backendStatus(appointment.status),
    source: "Interno",
    category: "1ª consulta",
    durationMinutes: 30,
    reminders: { onBooking: true, oneDayBefore: true, onDay: true },
    createdAtISO: appointment.scheduledAt,
  };
}
function smartScheduleSnapshot(suggestion: SmartScheduleSuggestion | null): IntegratedAppointment["smartSchedule"] {
  if (!suggestion) return undefined;
  return {
    recommendedDurationMinutes: suggestion.recommendedDurationMinutes,
    recommendedReturnDateISO: suggestion.recommendedReturnDateISO,
    returnWindowStartISO: suggestion.returnWindowStartISO,
    returnWindowEndISO: suggestion.returnWindowEndISO,
    preferredWeekday: suggestion.preferredWeekday,
    preferredWeekdayLabel: suggestion.preferredWeekdayLabel,
    financialCadenceDays: suggestion.financialCadenceDays,
    financialCadenceLabel: suggestion.financialCadenceLabel,
    financialAlternativeDateISO: suggestion.financialAlternativeDateISO,
    reasons: suggestion.reasons,
    warnings: suggestion.warnings,
  };
}

function initialForm(dateISO: string): AppointmentForm {
  return {
    patientName: "",
    patientPhone: "",
    professionalName: "Dr. Robson",
    procedure: "Consulta inicial / avaliação",
    nextProcedure: "Definir após atendimento",
    dateISO,
    time: "09:00",
    room: "Consultório 1",
    category: "1ª consulta",
    durationMinutes: 30,
    laboratoryName: "",
  };
}

export default function Agenda() {
  const navigate = useNavigate();
  const [items, setItems] = useState<IntegratedAppointment[]>(getAppointments);
  const [view, setView] = useState<View>("week");
  const [date, setDate] = useState(today());
  const [professional, setProfessional] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Todos");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<IntegratedAppointment | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [smartSuggestion, setSmartSuggestion] = useState<SmartScheduleSuggestion | null>(null);
  const [editSmartSuggestion, setEditSmartSuggestion] = useState<SmartScheduleSuggestion | null>(null);
  const [channel, setChannel] = useState<Channel>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}")?.channel || "WhatsApp";
    } catch {
      return "WhatsApp";
    }
  });
  const [form, setForm] = useState<AppointmentForm>(() => initialForm(date));
  const [backendPatients, setBackendPatients] = useState<Array<{ id: string; fullName: string; phone: string }>>([]);
  const [backendDoctors, setBackendDoctors] = useState<BackendDoctor[]>([]);

  useEffect(() => subscribeOperations(() => setItems(getAppointments())), []);
  useEffect(() => {
    let active = true;
    loadBackendPatients()
      .then((patients) => {
        if (active) setBackendPatients(patients);
      })
      .catch(() => {
        if (active) setBackendPatients([]);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    loadBackendDoctors().then(setBackendDoctors).catch(() => setBackendDoctors([]));
  }, []);

  useEffect(() => {
    let active = true;
    loadBackendAppointments()
      .then((appointments) => {
        if (!active) return;

        const backendItems = appointments.map(mapBackendAppointment);
        saveAppointments(backendItems);
        setItems(backendItems);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify({ channel, booking: true, oneDayBefore: true, onDay: true }));
  }, [channel]);

  const range = useMemo(() => {
    const base = new Date(`${date}T12:00:00`);
    if (view === "day") return [date];
    if (view === "week") {
      const day = base.getDay() || 7;
      base.setDate(base.getDate() - day + 1);
      return Array.from({ length: 7 }, (_, index) => {
        const next = new Date(base);
        next.setDate(base.getDate() + index);
        return iso(next);
      });
    }
    const year = base.getFullYear();
    const month = base.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: days }, (_, index) => iso(new Date(year, month, index + 1)));
  }, [date, view]);

  const baseFiltered = useMemo(
    () =>
      items
        .filter((appointment) => range.includes(appointment.dateISO) && (professional === "Todos" || appointment.professionalName === professional))
        .sort((a, b) => (a.dateISO + a.time).localeCompare(b.dateISO + b.time)),
    [items, professional, range],
  );

  const filtered = useMemo(
    () => baseFiltered.filter((appointment) => statusFilter === "Todos" || appointment.status === statusFilter),
    [baseFiltered, statusFilter],
  );

  const statusMetrics = useMemo(
    () => ({
      total: baseFiltered.length,
      confirmed: baseFiltered.filter((appointment) => appointment.status === "Confirmado").length,
      waiting: baseFiltered.filter((appointment) => appointment.status === "Aguardando").length,
      inCare: baseFiltered.filter((appointment) => appointment.status === "Em atendimento").length,
      noShow: baseFiltered.filter((appointment) => appointment.status === "Faltou").length,
    }),
    [baseFiltered],
  );

  const professionals = useMemo(
    () => Array.from(new Set([...defaultProfessionals, ...items.map((appointment) => appointment.professionalName)])),
    [items],
  );
  const alerts = getOperationalAlerts().filter((alert) => ["Agenda", "Pacientes", "Laboratório", "Financeiro"].includes(alert.area)).slice(0, 12);
  const normalizedPatientName = form.patientName.trim().toLowerCase();
  const selectedPatient =
    backendPatients.find((patient) => patient.fullName.trim().toLowerCase() === normalizedPatientName) ||
    listPatients().find((patient) => patient.fullName.trim().toLowerCase() === normalizedPatientName);

  const openNew = (prefill?: Partial<AppointmentForm>) => {
    setSmartSuggestion(null);
    setForm({ ...initialForm(date), ...prefill, dateISO: prefill?.dateISO || date });
    setOpen(true);
  };

  const save = async () => {
    if (!form.patientName.trim() || !form.procedure.trim()) return;

    const normalizeName = (value: string) =>
      value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(dra?|dr)\.?\s*/g, "").trim();

    const backendPatient = backendPatients.find(
      (patient) => normalizeName(patient.fullName) === normalizeName(form.patientName),
    );

    const backendDoctor = backendDoctors.find((doctor) => {
      const fullName = `${doctor.user.firstName} ${doctor.user.lastName}`.trim();
      const candidate = normalizeName(fullName);
      const target = normalizeName(form.professionalName);
      return candidate === target || candidate.includes(target) || target.includes(candidate);
    });

    if (!backendPatient) {
      window.alert("Selecione um paciente cadastrado no sistema.");
      return;
    }

    if (!backendDoctor) {
      window.alert("Profissional não encontrado no cadastro do sistema.");
      return;
    }

    const scheduledAt = new Date(`${form.dateISO}T${form.time}:00`);
    if (Number.isNaN(scheduledAt.getTime())) {
      window.alert("Data ou horário inválido.");
      return;
    }

    let backendCreated: BackendAppointment;
    try {
      backendCreated = await createBackendAppointment({
        patientId: backendPatient.id,
        doctorId: backendDoctor.id,
        procedure: form.procedure,
        nextProcedure: form.nextProcedure || undefined,
        room: form.room || undefined,
        scheduledAt: scheduledAt.toISOString(),
        reminderChannel: channel === "SMS" ? "SMS" : "WHATSAPP",
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível salvar o agendamento.");
      return;
    }
    const appointment = createAppointment({
      ...form,
      backendId: backendCreated.id,
      durationMinutes: Number(form.durationMinutes || 30),
      laboratoryName: form.laboratoryName || undefined,
      smartSchedule: smartScheduleSnapshot(smartSuggestion),
      status: "Agendado",
      source: "Interno",
      reminders: { onBooking: true, oneDayBefore: true, onDay: true },
    });
    enqueueAppointmentReminders({
      appointmentId: appointment.id,
      patientName: appointment.patientName,
      phone: appointment.patientPhone,
      dateISO: appointment.dateISO,
      time: appointment.time,
      channel,
    });
    setOpen(false);
    setItems(getAppointments());
  };

  const move = (delta: number) => {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + delta * (view === "day" ? 1 : view === "week" ? 7 : 30));
    setDate(iso(next));
  };

  const copyBooking = async () => {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}agendamento-online`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Link de agendamento online copiado.");
    } catch {
      prompt("Copie o link de agendamento online:", url);
    }
  };

  const scheduleNextReturn = (appointment: IntegratedAppointment, returnDateISO: string) => {
    const patient = listPatients().find((item) => item.fullName.toLowerCase() === appointment.patientName.toLowerCase());
    setEdit(null);
    setEditSmartSuggestion(null);
    openNew({
      patientName: appointment.patientName,
      patientPhone: patient?.phone || appointment.patientPhone || "",
      professionalName: appointment.professionalName,
      procedure: appointment.nextProcedure || appointment.procedure,
      nextProcedure: "Definir após atendimento",
      dateISO: returnDateISO,
      time: appointment.time,
      room: appointment.room,
      category: "Retorno",
      durationMinutes: appointment.smartSchedule?.recommendedDurationMinutes || appointment.durationMinutes || 30,
      laboratoryName: appointment.laboratoryName || "",
    });
  };

  return (
    <Box>
      <PageHeader
        title="Agenda inteligente"
        description="Tempo clínico, retorno, laboratório, plano financeiro e dia habitual do paciente em uma única agenda."
        actionLabel="Novo agendamento"
        actionIcon={<AddIcon />}
        onAction={() => openNew({ dateISO: date })}
      />

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <ToggleButtonGroup exclusive value={view} onChange={(_, value) => value && setView(value)} size="small">
            <ToggleButton value="day">Dia</ToggleButton>
            <ToggleButton value="week">Semana</ToggleButton>
            <ToggleButton value="month">Mês</ToggleButton>
          </ToggleButtonGroup>
          <TextField size="small" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <TextField size="small" select label="Agenda" value={professional} onChange={(event) => setProfessional(event.target.value)} sx={{ minWidth: 220 }}>
            {professionals.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
          </TextField>
          <Button onClick={() => move(-1)}>Anterior</Button>
          <Button onClick={() => setDate(today())}>Hoje</Button>
          <Button onClick={() => move(1)}>Próximo</Button>
          <Button startIcon={<LinkIcon />} onClick={copyBooking}>Agendamento online</Button>
          <Button startIcon={<TuneIcon />} onClick={() => setSettingsOpen(true)}>Configurar inteligência</Button>
          <TextField size="small" select label="Avisos ao paciente" value={channel} onChange={(event) => setChannel(event.target.value as Channel)} sx={{ minWidth: 180 }}>
            <MenuItem value="WhatsApp">WhatsApp</MenuItem>
            <MenuItem value="SMS">SMS</MenuItem>
          </TextField>
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5, mb: 1 }}>
          {([
            ["Todos", statusMetrics.total],
            ["Confirmado", statusMetrics.confirmed],
            ["Aguardando", statusMetrics.waiting],
            ["Em atendimento", statusMetrics.inCare],
            ["Faltou", statusMetrics.noShow],
          ] as Array<[StatusFilter, number]>).map(([label, count]) => (
            <Chip
              key={label}
              clickable
              onClick={() => setStatusFilter(label)}
              variant={statusFilter === label ? "filled" : "outlined"}
              color={label === "Faltou" ? "error" : label === "Confirmado" ? "success" : "default"}
              label={`${label} • ${count}`}
            />
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary">
          <NotificationsActiveIcon sx={{ fontSize: 14, verticalAlign: "middle" }} /> Confirmação no agendamento + 1 dia antes + no dia. Canal escolhido pela clínica: {channel}.
        </Typography>
      </Paper>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,2.2fr) minmax(320px,1fr)" }, gap: 2 }}>
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <Box sx={{ p: 2, bgcolor: "action.hover" }}>
            <Typography sx={{ fontWeight: 900 }}>
              {view === "month"
                ? new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
                : `${dateLabel(range[0])}${view === "week" ? ` a ${dateLabel(range[range.length - 1])}` : ""}`}
            </Typography>
          </Box>
          {filtered.length === 0 ? (
            <Box sx={{ p: 5, textAlign: "center" }}><Typography color="text.secondary" sx={{ mb: 2 }}>Nenhuma consulta no período.</Typography><Button variant="contained" startIcon={<AddIcon />} onClick={() => openNew({ dateISO: date })}>Novo agendamento</Button></Box>
          ) : filtered.map((appointment) => {
            const financial = patientFinancialSummary(appointment.patientName);
            const overdueCount = (() => {
              try {
                return JSON.parse(localStorage.getItem("dentalpos.financial.entries.v3") || "[]").filter(
                  (entry: any) => entry.type === "Receita" && entry.personName?.toLowerCase() === appointment.patientName.toLowerCase() && entry.status === "Vencido",
                ).length;
              } catch {
                return 0;
              }
            })();
            const smartWarnings = appointment.smartSchedule?.warnings?.filter((warning) => warning.severity !== "info").length || 0;
            return (
              <Box key={appointment.id}>
                <Box
                  sx={{ p: 2, display: "grid", gridTemplateColumns: { xs: "1fr", md: "120px 1fr auto" }, gap: 2, alignItems: "center", cursor: "pointer" }}
                  onClick={() => {
                    setEdit(appointment);
                    setEditSmartSuggestion(null);
                  }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 900 }}>{dateLabel(appointment.dateISO)}</Typography>
                    <Typography color="text.secondary">{appointment.time} • {appointment.durationMinutes || 30} min</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 900 }}>
                      {appointment.patientName}{" "}
                      <Chip
                        size="small"
                        color={financial.status === "Em dia" ? "success" : "error"}
                        label={overdueCount ? `${overdueCount} parcela(s) em atraso` : financial.status === "Em dia" ? "Financeiro OK" : "Pendência"}
                      />
                    </Typography>
                    <Typography color="text.secondary">
                      {appointment.professionalName} • {appointment.category || "Consulta"} • {appointment.procedure} • {appointment.room}
                    </Typography>
                    {appointment.smartSchedule?.recommendedReturnDateISO ? (
                      <Typography variant="caption" color="text.secondary">
                        Próximo retorno sugerido: {dateLabel(appointment.smartSchedule.recommendedReturnDateISO)}
                      </Typography>
                    ) : null}
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: { md: "flex-end" } }}>
                    {smartWarnings ? <Chip size="small" color="warning" icon={<WarningAmberIcon />} label={`${smartWarnings} alerta(s)`} /> : null}<Button size="small" startIcon={<AddIcon />} onClick={(event) => { event.stopPropagation(); openNew({ patientName: appointment.patientName, patientPhone: appointment.patientPhone || "", professionalName: appointment.professionalName, room: appointment.room, dateISO: date }); }}>Agendar novo</Button>
                    <Chip
                      label={appointment.status}
                      color={appointment.status === "Confirmado" || appointment.status === "Finalizado" ? "success" : appointment.status === "Faltou" || appointment.status === "Cancelado" ? "error" : "default"}
                    />
                  </Box>
                </Box>
                <Divider />
              </Box>
            );
          })}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 900, mb: 1 }}>Pendências até resolver</Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>Financeiro, faltas, laboratório e agenda ficam visíveis para a equipe.</Typography>
          {alerts.length === 0 ? <Alert severity="success">Nenhuma pendência crítica agora.</Alert> : alerts.map((alert) => (
            <Alert key={alert.id} severity={alert.severity} sx={{ mb: 1 }}><b>{alert.title}</b><br />{alert.description}</Alert>
          ))}
        </Paper>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Novo agendamento</DialogTitle>
        <DialogContent sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, pt: "12px!important" }}>
          <Autocomplete
            freeSolo
            options={backendPatients.map((patient) => patient.fullName)}
            value={form.patientName || null}
            inputValue={form.patientName}
            onInputChange={(_, name, reason) => {
              if (reason !== "input" && reason !== "clear") return;
              const normalized = name.trim().toLowerCase();
              const patient =
                backendPatients.find((item) => item.fullName.trim().toLowerCase() === normalized) ||
                listPatients().find((item) => item.fullName.trim().toLowerCase() === normalized);
              setForm((current) => ({
                ...current,
                patientName: name,
                patientPhone: patient?.phone || current.patientPhone,
              }));
            }}
            onChange={(_, name) => {
              const patientName = typeof name === "string" ? name : "";
              const normalized = patientName.trim().toLowerCase();
              const patient =
                backendPatients.find((item) => item.fullName.trim().toLowerCase() === normalized) ||
                listPatients().find((item) => item.fullName.trim().toLowerCase() === normalized);
              setForm((current) => ({
                ...current,
                patientName,
                patientPhone: patient?.phone || current.patientPhone,
              }));
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Paciente"
                placeholder="Digite ou selecione o paciente"
              />
            )}
          />
          <TextField label="Celular" value={form.patientPhone} onChange={(event) => setForm({ ...form, patientPhone: event.target.value })} />
          <TextField label="Profissional" value={form.professionalName} onChange={(event) => setForm({ ...form, professionalName: event.target.value })} />
          <TextField label="Sala" value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} />
          <TextField
            select
            label="Categoria"
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value as NonNullable<IntegratedAppointment["category"]> })}
          >
            {["1ª consulta", "Em tratamento", "Retorno", "Pagamento", "Periódico", "Marketing", "Indicação", "Urgência", "Outro"].map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
          </TextField>
          <TextField
            type="number"
            label="Tempo reservado (min)"
            value={form.durationMinutes}
            onChange={(event) => setForm({ ...form, durationMinutes: Math.max(10, Number(event.target.value || 30)) })}
          />
          <Box sx={{ gridColumn: { md: "1/-1" } }}>
            <ProcedurePicker value={form.procedure} onChange={(name) => setForm({ ...form, procedure: name })} />
          </Box>
          <TextField type="date" label="Data" slotProps={{ inputLabel: { shrink: true } }} value={form.dateISO} onChange={(event) => setForm({ ...form, dateISO: event.target.value })} />
          <TextField type="time" label="Horário" slotProps={{ inputLabel: { shrink: true } }} value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} />
          <TextField
            label="Laboratório (se houver)"
            placeholder="Ex.: Laboratório X"
            value={form.laboratoryName}
            onChange={(event) => setForm({ ...form, laboratoryName: event.target.value })}
            sx={{ gridColumn: { md: "1/-1" } }}
          />
          <Box sx={{ gridColumn: { md: "1/-1" } }}>
            <ProcedurePicker label="Próximo procedimento sugerido" value={form.nextProcedure} onChange={(name) => setForm({ ...form, nextProcedure: name })} />
          </Box>
          <Box sx={{ gridColumn: { md: "1/-1" } }}>
            <SmartSchedulingAssistant
              patientId={selectedPatient?.id}
              patientName={form.patientName}
              procedure={form.procedure}
              category={form.category}
              currentAppointmentDateISO={form.dateISO}
              selectedDurationMinutes={form.durationMinutes}
              laboratoryName={form.laboratoryName}
              onApplyDuration={(minutes) => setForm((current) => ({ ...current, durationMinutes: minutes }))}
              onSuggestion={setSmartSuggestion}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={save}>Agendar e gerar lembretes</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} fullWidth maxWidth="md">
        <DialogTitle>{edit?.patientName}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {edit ? (
            <>
              <Typography><b>{edit.dateISO} às {edit.time}</b> • {edit.professionalName}</Typography>
              <Typography>{edit.procedure}</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                <TextField
                  select
                  label="Status"
                  value={edit.status}
                  onChange={async (event) => {
                    const status = event.target.value as AppointmentStatus;
                    if (edit.backendId) {
                      try {
                        const updated = await updateBackendAppointment(edit.backendId, {
                          status: backendStatusValue(status),
                          reason: "Atualização pela agenda",
                          requestedBy: "CLINIC",
                          reminderChannel: channel === "SMS" ? "SMS" : "WHATSAPP",
                        });
                        const mapped = mapBackendAppointment(updated);
                        const refreshed = (await loadBackendAppointments()).map(mapBackendAppointment);
                        saveAppointments(refreshed);
                        setItems(refreshed);
                        setEdit(mapped);
                      } catch (error) {
                        window.alert(error instanceof Error ? error.message : "Não foi possível atualizar o status.");
                      }
                      return;
                    }
                    changeAppointmentWithHistory(edit.id, { status, requestedBy: "Clínica", reason: "Atualização pela agenda" });
                    setItems(getAppointments());
                    setEdit({ ...edit, status });
                  }}
                >
                  {["Agendado", "Confirmado", "Aguardando", "Sala em preparação", "Em atendimento", "Finalizado", "Cancelado", "Faltou"].map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                </TextField>
                <TextField
                  type="number"
                  label="Tempo reservado (min)"
                  value={edit.durationMinutes || 30}
                  onChange={(event) => setEdit({ ...edit, durationMinutes: Math.max(10, Number(event.target.value || 30)) })}
                />
                <TextField type="date" label="Remarcar data" value={edit.dateISO} onChange={(event) => setEdit({ ...edit, dateISO: event.target.value })} />
                <TextField type="time" label="Remarcar horário" value={edit.time} onChange={(event) => setEdit({ ...edit, time: event.target.value })} />
                <TextField
                  label="Laboratório (se houver)"
                  value={edit.laboratoryName || ""}
                  onChange={(event) => setEdit({ ...edit, laboratoryName: event.target.value })}
                  sx={{ gridColumn: { md: "1/-1" } }}
                />
              </Box>

              <SmartSchedulingAssistant
                patientId={backendPatients.find((patient) => patient.fullName.toLowerCase() === edit.patientName.toLowerCase())?.id || listPatients().find((patient) => patient.fullName.toLowerCase() === edit.patientName.toLowerCase())?.id}
                patientName={edit.patientName}
                procedure={edit.procedure}
                category={edit.category}
                currentAppointmentDateISO={edit.dateISO}
                selectedDurationMinutes={edit.durationMinutes || 30}
                laboratoryName={edit.laboratoryName}
                onApplyDuration={(minutes) => setEdit((current) => current ? { ...current, durationMinutes: minutes } : current)}
                onApplyReturnDate={(returnDateISO) => scheduleNextReturn(edit, returnDateISO)}
                onSuggestion={setEditSmartSuggestion}
              />
            </>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {edit ? (() => {
            const patient = listPatients().find((item) => item.fullName.toLowerCase() === edit.patientName.toLowerCase());
            return (
              <>
                <Button disabled={!patient} onClick={() => patient && navigate(`/prontuario?patientId=${encodeURIComponent(patient.id)}`)}>Prontuário</Button>
                <Button onClick={() => navigate(`/financeiro?paciente=${encodeURIComponent(edit.patientName)}`)}>Financeiro</Button><Button startIcon={<AddIcon />} onClick={() => { const current = edit; setEdit(null); if (current) openNew({ patientName: current.patientName, patientPhone: current.patientPhone || "", professionalName: current.professionalName, dateISO: date }); }}>Agendar novo</Button>
              </>
            );
          })() : null}
          <Button onClick={() => setEdit(null)}>Fechar</Button>
          {edit ? (
            <Button
              variant="contained"
              onClick={async () => {
                if (edit.backendId) {
                  const scheduledAt = new Date(`${edit.dateISO}T${edit.time}:00`);
                  if (Number.isNaN(scheduledAt.getTime())) {
                    window.alert("Data ou horário inválido.");
                    return;
                  }
                  try {
                    await updateBackendAppointment(edit.backendId, {
                      scheduledAt: scheduledAt.toISOString(),
                      procedure: edit.procedure,
                      nextProcedure: edit.nextProcedure,
                      room: edit.room,
                      reason: "Remarcação pela agenda",
                      requestedBy: "CLINIC",
                      reminderChannel: channel === "SMS" ? "SMS" : "WHATSAPP",
                    });
                    const refreshed = (await loadBackendAppointments()).map(mapBackendAppointment);
                    saveAppointments(refreshed);
                    setItems(refreshed);
                    setEdit(null);
                  } catch (error) {
                    window.alert(error instanceof Error ? error.message : "Não foi possível salvar as alterações.");
                  }
                  return;
                }
                changeAppointmentWithHistory(edit.id, {
                  dateISO: edit.dateISO,
                  time: edit.time,
                  requestedBy: "Clínica",
                  reason: "Remarcação pela agenda",
                });
                updateAppointment(edit.id, {
                  durationMinutes: edit.durationMinutes || 30,
                  laboratoryName: edit.laboratoryName,
                  smartSchedule: smartScheduleSnapshot(editSmartSuggestion),
                });
                setItems(getAppointments());
                setEdit(null);
              }}
            >
              Salvar alterações
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>

      <SmartSchedulingSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Box>
  );
}
