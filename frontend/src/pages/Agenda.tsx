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
  MenuItem,
  Paper,
  TextField,
  ToggleButton,
  Switch,
  ToggleButtonGroup,
  Typography,

} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LinkIcon from "@mui/icons-material/Link";

import TuneIcon from "@mui/icons-material/Tune";

import PageHeader from "../components/PageHeader";
import AgendaCalendarBoard from "../components/AgendaCalendarBoard";
import ProcedurePicker from "../components/ProcedurePicker";
import SmartSchedulingAssistant from "../components/SmartSchedulingAssistant";
import SmartSchedulingSettingsDialog from "../components/SmartSchedulingSettingsDialog";
import AgendaAvailabilitySettingsDialog from "../components/AgendaAvailabilitySettingsDialog";
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

import { listPatients } from "../services/PatientClinicalService";
import { createBackendPatient, loadBackendPatients, type BackendPatient } from "../services/PatientApi";
import { createBackendAppointment, loadBackendAppointments, loadBackendDoctors, loadBackendAvailability, updateBackendAppointment, type BackendAppointment, type BackendDoctor } from "../services/AppointmentApi";
import { loadOnlineBookingSettings, saveOnlineBookingSettings, type OnlineBookingSettings } from "../services/PublicBookingApi";
import {
  loadAgendaBlocks,
  loadBackendSchedules,
  loadRecurringBreaks,
  type AgendaBlock,
  type BackendSchedule,
  type RecurringBreak,
} from "../services/ScheduleApi";
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
type Channel = "WhatsApp" | "SMS" | "Telegram" | "Manual";
type StatusFilter = "Todos" | AppointmentStatus;
type PatientMode = "registered" | "new";

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

function backendDoctorDisplayName(doctor: BackendDoctor) {
  return `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`.trim();
}
const onlineDays = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];
const onlineTimeOptions = Array.from({ length: 29 }, (_, index) => {
  const totalMinutes = 7 * 60 + index * 30;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
});

function appointmentRangeLabel(startTime: string, durationMinutes: number) {
  const [hour, minute] = startTime.split(":").map(Number);
  const start = hour * 60 + minute;
  const endInclusive = start + Math.max(1, durationMinutes) - 1;
  const endHour = Math.floor(endInclusive / 60);
  const endMinute = endInclusive % 60;
  return `${startTime}–${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
}

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

function backendRequestedBy(value: "Paciente" | "Clínica" | "Dentista" | "Outro") {
  return ({ Paciente: "PATIENT", Clínica: "CLINIC", Dentista: "DOCTOR", Outro: "OTHER" } as const)[value];
}

function backendChannel(value: Channel) {
  return ({ WhatsApp: "WHATSAPP", SMS: "SMS", Telegram: "TELEGRAM", Manual: "MANUAL" } as const)[value];
}

function historyAction(value: string): "Criado" | "Remarcado" | "Cancelado" | "Faltou" | "Alterado" {
  if (value === "RESCHEDULED") return "Remarcado";
  if (value === "CANCELLED") return "Cancelado";
  if (value === "NO_SHOW") return "Faltou";
  if (value === "CREATED" || value === "ONLINE_REQUEST") return "Criado";
  return "Alterado";
}

function historyRequestedBy(value?: string | null): "Paciente" | "Clínica" | "Dentista" | "Outro" | undefined {
  if (!value) return undefined;
  if (value === "PATIENT") return "Paciente";
  if (value === "CLINIC") return "Clínica";
  if (value === "DOCTOR") return "Dentista";
  return "Outro";
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
    patientId: appointment.patientId,
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
    durationMinutes: appointment.durationMinutes || 30,
    reminders: { onBooking: true, oneDayBefore: true, onDay: true },
    createdAtISO: appointment.scheduledAt,
    confirmation: appointment.confirmation || undefined,
    confirmChannel: appointment.confirmChannel || undefined,
    history: (appointment.history || []).map((event) => ({
      id: backendAppointmentId(event.id),
      atISO: event.createdAt,
      action: historyAction(event.action),
      requestedBy: historyRequestedBy(event.requestedBy),
      reason: event.reason || undefined,
      previousDateISO: event.previousScheduledAt ? iso(new Date(event.previousScheduledAt)) : undefined,
      previousTime: event.previousScheduledAt ? new Date(event.previousScheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }) : undefined,
      newDateISO: event.newScheduledAt ? iso(new Date(event.newScheduledAt)) : undefined,
      newTime: event.newScheduledAt ? new Date(event.newScheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }) : undefined,
    })),
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
  const [editReason, setEditReason] = useState("");
  const [editRequestedBy, setEditRequestedBy] = useState<"Paciente" | "Clínica" | "Dentista" | "Outro">("Paciente");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [availabilitySettingsOpen, setAvailabilitySettingsOpen] = useState(false);
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
  const [patientMode, setPatientMode] = useState<PatientMode>("registered");
  const [newPatient, setNewPatient] = useState({
    firstName: "",
    lastName: "",
    birthDate: "",
    phone: "",
    city: "",
  });
  const [backendPatients, setBackendPatients] = useState<BackendPatient[]>([]);
  const [backendDoctors, setBackendDoctors] = useState<BackendDoctor[]>([]);
  const [scheduleBlocks, setScheduleBlocks] = useState<BackendSchedule[]>([]);
  const [agendaBlocks, setAgendaBlocks] = useState<AgendaBlock[]>([]);
  const [recurringBreaks, setRecurringBreaks] = useState<RecurringBreak[]>([]);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [editAvailableTimes, setEditAvailableTimes] = useState<string[]>([]);
  const [editAvailabilityLoading, setEditAvailabilityLoading] = useState(false);
  const [editAvailabilityError, setEditAvailabilityError] = useState("");
  const [onlineSlotsOpen, setOnlineSlotsOpen] = useState(false);
  const [onlineSettings, setOnlineSettings] = useState<OnlineBookingSettings>({ enabled: false, slots: {} });
  const [onlineDoctorId, setOnlineDoctorId] = useState("");
  const [onlineDay, setOnlineDay] = useState(1);
  const [onlineSettingsLoading, setOnlineSettingsLoading] = useState(false);
  const [onlineSettingsSaving, setOnlineSettingsSaving] = useState(false);

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

  const refreshAgendaConfiguration = async () => {
    const [schedules, blocks, breaks] = await Promise.all([
      loadBackendSchedules(),
      loadAgendaBlocks(),
      loadRecurringBreaks(),
    ]);
    setScheduleBlocks(schedules);
    setAgendaBlocks(blocks);
    setRecurringBreaks(breaks);
  };

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadBackendSchedules(),
      loadAgendaBlocks(),
      loadRecurringBreaks(),
    ])
      .then(([schedules, blocks, breaks]) => {
        if (!active) return;
        setScheduleBlocks(schedules);
        setAgendaBlocks(blocks);
        setRecurringBreaks(breaks);
      })
      .catch(() => {
        if (!active) return;
        setScheduleBlocks([]);
        setAgendaBlocks([]);
        setRecurringBreaks([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setAvailableTimes([]);
      setAvailabilityError("");
      setAvailabilityLoading(false);
      return;
    }

    const normalizeName = (value: unknown) =>
      String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(dra?|dr)\.?\s*/g, "").trim();

    const backendDoctor = backendDoctors.find((doctor) => {
      const fullName = `${doctor.user.firstName} ${doctor.user.lastName}`.trim();
      const candidate = normalizeName(fullName);
      const target = normalizeName(form.professionalName);
      return candidate === target || candidate.includes(target) || target.includes(candidate);
    });

    if (!backendDoctor || !form.dateISO || !form.durationMinutes) {
      setAvailableTimes([]);
      setAvailabilityError(
        !backendDoctor && form.professionalName
          ? "Selecione um profissional cadastrado para consultar os horários."
          : "",
      );
      setAvailabilityLoading(false);
      return;
    }

    let active = true;
    setAvailabilityLoading(true);
    setAvailabilityError("");

    void loadBackendAvailability({
      doctorId: backendDoctor.id,
      dateISO: form.dateISO,
      durationMinutes: Number(form.durationMinutes || 30),
    })
      .then((slots) => {
        if (!active) return;
        setAvailableTimes(slots);
        setForm((current) => {
          const nextTime = slots.includes(current.time) ? current.time : slots[0] || "";
          return current.time === nextTime ? current : { ...current, time: nextTime };
        });
      })
      .catch((error) => {
        if (!active) return;
        setAvailableTimes([]);
        setAvailabilityError(
          error instanceof Error ? error.message : "Não foi possível consultar os horários disponíveis.",
        );
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, backendDoctors, form.professionalName, form.dateISO, form.durationMinutes]);

  useEffect(() => {
    if (!edit?.backendId) {
      setEditAvailableTimes([]);
      setEditAvailabilityError("");
      setEditAvailabilityLoading(false);
      return;
    }

    const normalizeName = (value: string) =>
      value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(dra?|dr)\.?\s*/g, "").trim();
    const doctor = backendDoctors.find((item) => {
      const fullName = `${item.user.firstName} ${item.user.lastName}`.trim();
      const candidate = normalizeName(fullName);
      const target = normalizeName(edit.professionalName);
      return candidate === target || candidate.includes(target) || target.includes(candidate);
    });

    if (!doctor || !edit.dateISO || !edit.durationMinutes) {
      setEditAvailableTimes([]);
      setEditAvailabilityError("Não foi possível identificar profissional, data ou duração.");
      return;
    }

    let active = true;
    setEditAvailabilityLoading(true);
    setEditAvailabilityError("");

    void loadBackendAvailability({
      doctorId: doctor.id,
      dateISO: edit.dateISO,
      durationMinutes: Number(edit.durationMinutes || 30),
      excludeAppointmentId: edit.backendId,
    })
      .then((slots) => {
        if (active) setEditAvailableTimes(slots);
      })
      .catch((error) => {
        if (!active) return;
        setEditAvailableTimes([]);
        setEditAvailabilityError(
          error instanceof Error ? error.message : "Não foi possível consultar os horários.",
        );
      })
      .finally(() => {
        if (active) setEditAvailabilityLoading(false);
      });

    return () => {
      active = false;
    };
  }, [edit?.backendId, edit?.dateISO, edit?.durationMinutes, edit?.professionalName, backendDoctors]);

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
        .filter((appointment) => appointment.status !== "Cancelado" && range.includes(appointment.dateISO) && (professional === "Todos" || appointment.professionalName === professional))
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
    () =>
      Array.from(
        new Set([
          ...defaultProfessionals,
          ...backendDoctors.map(backendDoctorDisplayName),
          ...items.map((appointment) => appointment.professionalName),
        ]),
      ),
    [items, backendDoctors],
  );
  const alerts = getOperationalAlerts().filter((alert) => ["Agenda", "Pacientes", "Laboratório", "Financeiro"].includes(alert.area)).slice(0, 12);
  const normalizeProfessionalName = (value: unknown) =>
    String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(dra?|dr)\.?\s*/g, "").trim();
  const selectedBackendDoctorId =
    professional === "Todos"
      ? undefined
      : backendDoctors.find((doctor) => {
          const fullName = `${doctor.user.firstName} ${doctor.user.lastName}`.trim();
          const candidate = normalizeProfessionalName(fullName);
          const target = normalizeProfessionalName(professional);
          return candidate === target || candidate.includes(target) || target.includes(candidate);
        })?.id;
  const normalizedPatientName = form.patientName.trim().toLowerCase();
  const selectedPatient =
    patientMode === "registered"
      ? backendPatients.find((patient) => patient.fullName.trim().toLowerCase() === normalizedPatientName) ||
        listPatients().find((patient) => patient.fullName.trim().toLowerCase() === normalizedPatientName)
      : undefined;

  const openNew = (prefill?: Partial<AppointmentForm>) => {
    setSmartSuggestion(null);
    setPatientMode("registered");
    setNewPatient({ firstName: "", lastName: "", birthDate: "", phone: "", city: "" });

    const cleanPrefill = Object.fromEntries(
      Object.entries(prefill || {}).filter(([, value]) => value !== undefined),
    ) as Partial<AppointmentForm>;
    const targetDate = prefill?.dateISO || date;

    setForm({
      ...initialForm(targetDate),
      ...cleanPrefill,
      dateISO: targetDate,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.procedure.trim()) return;

    const normalizeName = (value: string) =>
      value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(dra?|dr)\.?\s*/g, "").trim();
    const onlyDigits = (value: string) => value.replace(/\D/g, "");

    let backendPatient =
      patientMode === "registered"
        ? backendPatients.find(
            (patient) => normalizeName(patient.fullName) === normalizeName(form.patientName),
          )
        : undefined;

    let patientNameForAppointment = form.patientName.trim();
    let patientPhoneForAppointment = form.patientPhone.trim();

    if (patientMode === "new") {
      if (
        !newPatient.firstName.trim() ||
        !newPatient.lastName.trim() ||
        !newPatient.birthDate ||
        !newPatient.phone.trim() ||
        !newPatient.city.trim()
      ) {
        window.alert("Preencha nome, sobrenome, data de nascimento, telefone/WhatsApp e cidade.");
        return;
      }

      const existingByPhone = backendPatients.find(
        (patient) => onlyDigits(patient.phone) === onlyDigits(newPatient.phone),
      );
      if (existingByPhone) {
        setPatientMode("registered");
        setForm((current) => ({
          ...current,
          patientName: existingByPhone.fullName,
          patientPhone: existingByPhone.phone,
        }));
        window.alert("Este WhatsApp já pertence a um paciente cadastrado. O cadastro existente foi selecionado.");
        return;
      }

      const fullName = `${newPatient.firstName.trim()} ${newPatient.lastName.trim()}`.trim();
      const birthDate = new Date(`${newPatient.birthDate}T12:00:00-03:00`);
      if (Number.isNaN(birthDate.getTime()) || birthDate.getTime() > Date.now()) {
        window.alert("Informe uma data de nascimento válida.");
        return;
      }

      try {
        const createdPatient = await createBackendPatient({
          fullName,
          phone: newPatient.phone.trim(),
          birthDate: birthDate.toISOString(),
          city: newPatient.city.trim(),
        });
        backendPatient = createdPatient;
        patientNameForAppointment = createdPatient.fullName;
        patientPhoneForAppointment = createdPatient.phone;
        setBackendPatients((current) =>
          [...current.filter((patient) => patient.id !== createdPatient.id), createdPatient].sort((a, b) =>
            a.fullName.localeCompare(b.fullName),
          ),
        );
        setPatientMode("registered");
        setForm((current) => ({
          ...current,
          patientName: createdPatient.fullName,
          patientPhone: createdPatient.phone,
        }));
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Não foi possível cadastrar o novo paciente.");
        return;
      }
    } else if (!backendPatient) {
      window.alert("Selecione um paciente cadastrado ou escolha Novo paciente / 1º atendimento.");
      return;
    }

    const backendDoctor = backendDoctors.find((doctor) => {
      const fullName = `${doctor.user.firstName} ${doctor.user.lastName}`.trim();
      const candidate = normalizeName(fullName);
      const target = normalizeName(form.professionalName);
      return candidate === target || candidate.includes(target) || target.includes(candidate);
    });

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
        durationMinutes: Number(form.durationMinutes || 30),
        reminderChannel: backendChannel(channel),
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível salvar o agendamento.");
      return;
    }
    createAppointment({
      ...form,
      patientName: patientNameForAppointment,
      patientPhone: patientPhoneForAppointment,
      backendId: backendCreated.id,
      durationMinutes: Number(form.durationMinutes || 30),
      laboratoryName: form.laboratoryName || undefined,
      smartSchedule: smartScheduleSnapshot(smartSuggestion),
      status: "Agendado",
      source: "Interno",
      reminders: { onBooking: true, oneDayBefore: true, onDay: true },
    });
    setOpen(false);
    setItems(getAppointments());
  };

  const move = (delta: number) => {
    const next = new Date(`${date}T12:00:00`);
    if (view === "month") {
      next.setMonth(next.getMonth() + delta, 1);
    } else {
      next.setDate(next.getDate() + delta * (view === "day" ? 1 : 7));
    }
    setDate(iso(next));
  };

  const copyBooking = async () => {
    const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
    const url = `${window.location.origin}${import.meta.env.BASE_URL}agendamento-online?clinicId=${encodeURIComponent(clinicId)}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Link de agendamento online copiado.");
    } catch {
      prompt("Copie o link de agendamento online:", url);
    }
  };

  const openOnlineSlots = async () => {
    setOnlineSlotsOpen(true);
    setOnlineSettingsLoading(true);
    try {
      const settings = await loadOnlineBookingSettings();
      setOnlineSettings(settings);
      setOnlineDoctorId((current) => current || backendDoctors[0]?.id || "");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível carregar os horários online.");
    } finally {
      setOnlineSettingsLoading(false);
    }
  };

  const selectedOnlineTimes =
    (onlineDoctorId && onlineSettings.slots?.[onlineDoctorId]?.[String(onlineDay)]) || [];

  const toggleOnlineTime = (time: string) => {
    if (!onlineDoctorId) return;
    setOnlineSettings((current) => {
      const doctorSlots = { ...(current.slots[onlineDoctorId] || {}) };
      const currentTimes = doctorSlots[String(onlineDay)] || [];
      doctorSlots[String(onlineDay)] = currentTimes.includes(time)
        ? currentTimes.filter((item) => item !== time)
        : [...currentTimes, time].sort();
      return {
        ...current,
        slots: {
          ...current.slots,
          [onlineDoctorId]: doctorSlots,
        },
      };
    });
  };

  const saveOnlineSlots = async () => {
    setOnlineSettingsSaving(true);
    try {
      const saved = await saveOnlineBookingSettings(onlineSettings);
      setOnlineSettings(saved);
      window.alert("Horários do agendamento online salvos.");
      setOnlineSlotsOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível salvar os horários online.");
    } finally {
      setOnlineSettingsSaving(false);
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
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(220px,1fr) auto minmax(220px,1fr)" },
            gap: 1.5,
            alignItems: "center",
          }}
        >
          <TextField
            size="small"
            select
            label="Agenda"
            value={professional}
            onChange={(event) => setProfessional(event.target.value)}
            sx={{ minWidth: 220, maxWidth: 320 }}
          >
            {professionals.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
          </TextField>

          <ToggleButtonGroup
            exclusive
            value={view}
            onChange={(_, value) => {
              if (!value) return;
              setView(value);
            }}
            size="small"
            sx={{ justifySelf: { lg: "center" } }}
          >
            <ToggleButton value="day">Dia</ToggleButton>
            <ToggleButton value="week">Semana</ToggleButton>
            <ToggleButton value="month">Mês</ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ display: "flex", gap: 1, justifyContent: { lg: "flex-end" }, flexWrap: "wrap" }}>
            <Button startIcon={<LinkIcon />} onClick={copyBooking}>Agendamento online</Button>
            <Button onClick={() => void openOnlineSlots()}>Horários online</Button>
            <Button onClick={() => setAvailabilitySettingsOpen(true)}>Jornada / bloqueios</Button>
            <Button startIcon={<TuneIcon />} onClick={() => setSettingsOpen(true)}>Inteligência</Button>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            onClick={() => move(-1)}
            aria-label="Período anterior"
            sx={{ minWidth: 44, fontSize: 24, lineHeight: 1 }}
          >
            ‹
          </Button>
          <TextField
            size="small"
            type={view === "month" ? "month" : "date"}
            value={view === "month" ? date.slice(0, 7) : date}
            onChange={(event) => setDate(view === "month" ? `${event.target.value}-01` : event.target.value)}
            sx={{ minWidth: view === "month" ? 170 : 180 }}
          />
          <Button
            variant="outlined"
            onClick={() => move(1)}
            aria-label="Próximo período"
            sx={{ minWidth: 44, fontSize: 24, lineHeight: 1 }}
          >
            ›
          </Button>
          <Button variant="contained" onClick={() => setDate(today())}>Hoje</Button>
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
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
      </Paper>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns:
            view === "day"
              ? "minmax(0,1fr)"
              : { xs: "1fr", lg: "minmax(0,2.2fr) minmax(320px,1fr)" },
          gap: view === "day" ? 0 : 2,
          width: "100%",
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            borderRadius: 3,
            overflow: "hidden",
            minWidth: 0,
            width: "100%",
            bgcolor: "background.paper",
          }}
        >
          <Box
            sx={{
              px: 2,
              py: 1.25,
              bgcolor: "action.hover",
              borderBottom: 1,
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              position: view === "day" ? "sticky" : "static",
              top: 0,
              zIndex: view === "day" ? 2 : "auto",
            }}
          >
            <Typography sx={{ fontWeight: 900 }}>
              {view === "month"
                ? new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
                : `${dateLabel(range[0])}${view === "week" ? ` a ${dateLabel(range[range.length - 1])}` : ""}`}
            </Typography>
            {view === "day" ? (
              <Button
                variant="contained"
                onClick={() => setView("week")}
              >
                ← Voltar para semana
              </Button>
            ) : null}
          </Box>
          <AgendaCalendarBoard
            view={view}
            dateISO={date}
            items={filtered}
            professional={professional}
            professionalId={selectedBackendDoctorId}
            scheduleBlocks={scheduleBlocks}
            agendaBlocks={agendaBlocks}
            recurringBreaks={recurringBreaks}
            onDateChange={setDate}
            onDayOpen={(dayISO) => {
              setDate(dayISO);
              setView("day");
            }}
            onAppointmentClick={(appointment) => {
              setEdit(appointment);
              setEditReason("");
              setEditRequestedBy("Paciente");
              setEditSmartSuggestion(null);
            }}
            onNew={(prefill) => openNew(prefill)}
          />
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, display: view === "day" ? "none" : "block" }}>
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
          <Box sx={{ gridColumn: { md: "1/-1" } }}>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={patientMode}
              onChange={(_, value: PatientMode | null) => {
                if (!value) return;
                setPatientMode(value);
                setSmartSuggestion(null);
                if (value === "new") {
                  setForm((current) => ({ ...current, patientName: "", patientPhone: "" }));
                }
              }}
            >
              <ToggleButton value="registered">Paciente cadastrado</ToggleButton>
              <ToggleButton value="new">Novo paciente / 1º atendimento</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {patientMode === "registered" ? (
            <>
              <Autocomplete
                options={backendPatients.map((patient) => patient.fullName)}
                value={form.patientName || null}
                inputValue={form.patientName}
                onInputChange={(_, name, reason) => {
                  if (reason !== "input" && reason !== "clear") return;
                  setForm((current) => ({ ...current, patientName: name }));
                }}
                onChange={(_, name) => {
                  const patientName = typeof name === "string" ? name : "";
                  const normalized = patientName.trim().toLowerCase();
                  const patient = backendPatients.find(
                    (item) => item.fullName.trim().toLowerCase() === normalized,
                  );
                  setForm((current) => ({
                    ...current,
                    patientName,
                    patientPhone: patient?.phone || "",
                  }));
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Paciente cadastrado"
                    placeholder="Digite ou selecione o paciente"
                  />
                )}
              />
              <TextField
                label="Telefone / WhatsApp"
                value={form.patientPhone}
                slotProps={{ input: { readOnly: true } }}
              />
            </>
          ) : (
            <>
              <TextField
                required
                label="Nome"
                value={newPatient.firstName}
                onChange={(event) => setNewPatient({ ...newPatient, firstName: event.target.value })}
              />
              <TextField
                required
                label="Sobrenome"
                value={newPatient.lastName}
                onChange={(event) => setNewPatient({ ...newPatient, lastName: event.target.value })}
              />
              <TextField
                required
                type="date"
                label="Data de nascimento"
                value={newPatient.birthDate}
                onChange={(event) => setNewPatient({ ...newPatient, birthDate: event.target.value })}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today() } }}
              />
              <TextField
                required
                label="Telefone / WhatsApp"
                value={newPatient.phone}
                onChange={(event) => setNewPatient({ ...newPatient, phone: event.target.value })}
              />
              <TextField
                required
                label="Cidade"
                value={newPatient.city}
                onChange={(event) => setNewPatient({ ...newPatient, city: event.target.value })}
                sx={{ gridColumn: { md: "1/-1" } }}
              />
            </>
          )}
          <TextField select label="Avisos / confirmação" value={channel} onChange={(event) => setChannel(event.target.value as Channel)}>
            <MenuItem value="WhatsApp">WhatsApp • automático</MenuItem>
            <MenuItem value="SMS">SMS • automático</MenuItem>
            <MenuItem value="Telegram">Telegram • automático</MenuItem>
            <MenuItem value="Manual">Manual • recepção</MenuItem>
          </TextField>
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
          <TextField
            select
            label="Horários disponíveis"
            value={availableTimes.includes(form.time) ? form.time : ""}
            onChange={(event) => setForm({ ...form, time: event.target.value })}
            disabled={availabilityLoading}
            helperText={
              availabilityLoading
                ? "Consultando a agenda do profissional..."
                : availabilityError
                  ? availabilityError
                  : availableTimes.length
                    ? `${availableTimes.length} horário(s) livre(s) para esta data e duração.`
                    : "Nenhum horário disponível para esta data e duração."
            }
          >
            {availabilityLoading ? (
              <MenuItem value="" disabled>Consultando horários...</MenuItem>
            ) : availableTimes.length === 0 ? (
              <MenuItem value="" disabled>Nenhum horário disponível</MenuItem>
            ) : (
              availableTimes.map((time) => (
                <MenuItem key={time} value={time}>
                  {appointmentRangeLabel(time, Number(form.durationMinutes || 30))}
                </MenuItem>
              ))
            )}
          </TextField>
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
            {patientMode === "new" ? (
              <Alert severity="info">
                Novo paciente: o cadastro será criado no PostgreSQL junto com o primeiro agendamento. A Agenda Inteligente ainda não possui histórico deste paciente.
              </Alert>
            ) : (
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
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={save} disabled={!form.time || availabilityLoading}>Agendar e gerar lembretes</Button>
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
                  onChange={(event) => setEdit({ ...edit, status: event.target.value as AppointmentStatus })}
                >
                  {["Agendado", "Confirmado", "Aguardando", "Sala em preparação", "Em atendimento", "Finalizado", "Cancelado", "Faltou"].map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                </TextField>
                <TextField
                  type="number"
                  label="Tempo reservado (min)"
                  value={edit.durationMinutes || 30}
                  onChange={(event) => setEdit({ ...edit, durationMinutes: Math.max(10, Number(event.target.value || 30)) })}
                />
                <TextField
                  type="date"
                  label="Remarcar data"
                  value={edit.dateISO}
                  onChange={(event) => setEdit({ ...edit, dateISO: event.target.value })}
                />
                <TextField
                  select
                  label="Horários disponíveis para remarcação"
                  value={edit.time}
                  disabled={editAvailabilityLoading}
                  onChange={(event) => setEdit({ ...edit, time: event.target.value })}
                  helperText={
                    editAvailabilityLoading
                      ? "Consultando jornada, bloqueios e horários ocupados..."
                      : editAvailabilityError
                        ? editAvailabilityError
                        : editAvailableTimes.length
                          ? `${editAvailableTimes.length} horário(s) disponível(is) nesta data.`
                          : "Nenhum outro horário disponível nesta data."
                  }
                >
                  {!editAvailableTimes.includes(edit.time) ? (
                    <MenuItem value={edit.time}>
                      {appointmentRangeLabel(edit.time, Number(edit.durationMinutes || 30))} • horário atual
                    </MenuItem>
                  ) : null}
                  {editAvailableTimes.map((time) => (
                    <MenuItem key={time} value={time}>
                      {appointmentRangeLabel(time, Number(edit.durationMinutes || 30))}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Laboratório (se houver)"
                  value={edit.laboratoryName || ""}
                  onChange={(event) => setEdit({ ...edit, laboratoryName: event.target.value })}
                  sx={{ gridColumn: { md: "1/-1" } }}
                />
                <TextField
                  select
                  label="Alteração solicitada por"
                  value={editRequestedBy}
                  onChange={(event) => setEditRequestedBy(event.target.value as "Paciente" | "Clínica" | "Dentista" | "Outro")}
                >
                  {["Paciente", "Clínica", "Dentista", "Outro"].map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                </TextField>
                <TextField
                  required
                  label="Motivo da alteração"
                  placeholder="Ex.: paciente solicitou mudança de horário"
                  value={editReason}
                  onChange={(event) => setEditReason(event.target.value)}
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
          {edit ? (
            <>
              <Button color="warning" onClick={() => setEdit({ ...edit, status: "Faltou" })}>Marcar falta</Button>
              <Button color="error" onClick={() => setEdit({ ...edit, status: "Cancelado" })}>Cancelar consulta</Button>
            </>
          ) : null}
          <Button onClick={() => setEdit(null)}>Fechar</Button>
          {edit ? (
            <Button
              variant="contained"
              onClick={async () => {
                if (edit.backendId) {
                  if (!editReason.trim()) {
                    window.alert("Informe o motivo da alteração, remarcação, cancelamento ou falta.");
                    return;
                  }
                  const scheduledAt = new Date(`${edit.dateISO}T${edit.time}:00`);
                  if (Number.isNaN(scheduledAt.getTime())) {
                    window.alert("Data ou horário inválido.");
                    return;
                  }
                  try {
                    await updateBackendAppointment(edit.backendId, {
                      scheduledAt: scheduledAt.toISOString(),
                      durationMinutes: Number(edit.durationMinutes || 30),
                      procedure: edit.procedure,
                      nextProcedure: edit.nextProcedure,
                      room: edit.room,
                      status: backendStatusValue(edit.status),
                      reason: editReason.trim(),
                      requestedBy: backendRequestedBy(editRequestedBy),
                      reminderChannel: backendChannel(channel),
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
                  status: edit.status,
                  requestedBy: editRequestedBy,
                  reason: editReason.trim(),
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

      <Dialog open={onlineSlotsOpen} onClose={() => setOnlineSlotsOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Horários disponíveis para agendamento online</DialogTitle>
        <DialogContent sx={{ pt: "12px!important", display: "grid", gap: 2 }}>
          <Alert severity="info">
            A equipe interna continua vendo todos os horários livres. Aqui você escolhe somente os horários que poderão aparecer para o paciente no agendamento online.
          </Alert>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Switch
              checked={onlineSettings.enabled}
              onChange={(event) =>
                setOnlineSettings((current) => ({ ...current, enabled: event.target.checked }))
              }
            />
            <Typography sx={{ fontWeight: 800 }}>
              Agendamento online {onlineSettings.enabled ? "ativo" : "desativado"}
            </Typography>
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <TextField
              select
              label="Profissional"
              value={onlineDoctorId}
              onChange={(event) => setOnlineDoctorId(event.target.value)}
              disabled={onlineSettingsLoading}
            >
              {backendDoctors.map((doctor) => (
                <MenuItem key={doctor.id} value={doctor.id}>
                  {"Dr(a). " + doctor.user.firstName + " " + doctor.user.lastName}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Dia da semana"
              value={String(onlineDay)}
              onChange={(event) => setOnlineDay(Number(event.target.value))}
              disabled={onlineSettingsLoading}
            >
              {onlineDays.map((day) => (
                <MenuItem key={day.value} value={String(day.value)}>{day.label}</MenuItem>
              ))}
            </TextField>
          </Box>

          <Box>
            <Typography sx={{ fontWeight: 900, mb: 1 }}>
              Selecione os horários que o paciente poderá escolher
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {onlineTimeOptions.map((time) => {
                const selected = selectedOnlineTimes.includes(time);
                return (
                  <Chip
                    key={time}
                    clickable
                    label={time}
                    color={selected ? "primary" : "default"}
                    variant={selected ? "filled" : "outlined"}
                    onClick={() => toggleOnlineTime(time)}
                  />
                );
              })}
            </Box>
          </Box>

          {!onlineDoctorId ? (
            <Alert severity="warning">Nenhum profissional cadastrado foi encontrado.</Alert>
          ) : selectedOnlineTimes.length === 0 ? (
            <Alert severity="warning">
              Nenhum horário foi liberado para este profissional neste dia. O paciente não verá horários online neste dia.
            </Alert>
          ) : (
            <Alert severity="success">
              {selectedOnlineTimes.length} horário(s) liberado(s) para este profissional neste dia.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOnlineSlotsOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={onlineSettingsLoading || onlineSettingsSaving || !onlineDoctorId}
            onClick={() => void saveOnlineSlots()}
          >
            {onlineSettingsSaving ? "Salvando..." : "Salvar horários online"}
          </Button>
        </DialogActions>
      </Dialog>

      <AgendaAvailabilitySettingsDialog
        open={availabilitySettingsOpen}
        onClose={() => {
          setAvailabilitySettingsOpen(false);
          void refreshAgendaConfiguration().catch(() => undefined);
        }}
        onChanged={(doctorId) => {
          void refreshAgendaConfiguration().catch(() => undefined);
          const doctor = backendDoctors.find((item) => item.id === doctorId);
          if (doctor) setProfessional(backendDoctorDisplayName(doctor));
        }}
        doctors={backendDoctors}
      />

      <SmartSchedulingSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Box>
  );
}
