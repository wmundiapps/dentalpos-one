import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import ProcedurePicker from "./ProcedurePicker";
import DurationSelect from "./DurationSelect";
import PatientSearchField, { formatPhoneBR, isValidPhoneBR, onlyDigits, type PatientChoice } from "./PatientSearchField";
import { createBackendPatient, loadBackendPatients, type BackendPatient } from "../services/PatientApi";
import {
  createBackendAppointment,
  loadBackendAvailability,
  loadBackendDoctors,
  type BackendDoctor,
  type ReminderSelection,
} from "../services/AppointmentApi";
import { loadRecurringBreaks, type RecurringBreak } from "../services/ScheduleApi";
import { suggestDuration } from "../services/ProcedureDurations";

const isoDay = (date: Date) => {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
};
const toMinutes = (value: string) => {
  const [h, m] = String(value || "").split(":").map(Number);
  return h * 60 + m;
};
const weekday = (dateISO: string) => {
  const [y, mo, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 12)).getUTCDay();
};
function rangeLabel(time: string, duration: number) {
  const end = toMinutes(time) + duration;
  return `${time}–${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}
function doctorLabel(doctor: BackendDoctor) {
  return `Dr(a). ${doctor.user.firstName} ${doctor.user.lastName}`.trim();
}

export interface QuickSchedulePrefill {
  dateISO?: string;
  time?: string;
  doctorId?: string;
  procedure?: string;
  durationMinutes?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  fixedPatient?: BackendPatient | null;
  prefill?: QuickSchedulePrefill;
}

const DEFAULT_PROCEDURE = "Consulta inicial / avaliação";

export default function QuickScheduleDialog({ open, onClose, onSaved, fixedPatient, prefill }: Props) {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<BackendPatient[]>([]);
  const [doctors, setDoctors] = useState<BackendDoctor[]>([]);
  const [breaks, setBreaks] = useState<RecurringBreak[]>([]);
  const [choice, setChoice] = useState<PatientChoice>(null);
  const [procedure, setProcedure] = useState(DEFAULT_PROCEDURE);
  const [duration, setDuration] = useState(30);
  const [doctorId, setDoctorId] = useState("");
  const [dateISO, setDateISO] = useState(isoDay(new Date()));
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [reminders, setReminders] = useState<ReminderSelection>({ onBooking: true, oneDayBefore: true, onDay: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setDone("");
    const startProcedure = prefill?.procedure || DEFAULT_PROCEDURE;
    setProcedure(startProcedure);
    setDuration(prefill?.durationMinutes || suggestDuration(startProcedure));
    setDateISO(prefill?.dateISO || isoDay(new Date()));
    setTime(prefill?.time || "");
    setChoice(fixedPatient ? { mode: "registered", patient: fixedPatient } : null);
    setReminders({ onBooking: true, oneDayBefore: true, onDay: true });
    if (!fixedPatient) loadBackendPatients().then(setPatients).catch(() => setPatients([]));
    loadBackendDoctors()
      .then((rows) => {
        setDoctors(rows);
        setDoctorId((current) => prefill?.doctorId || (rows.some((d) => d.id === current) ? current : rows[0]?.id || ""));
      })
      .catch(() => setDoctors([]));
    loadRecurringBreaks().then(setBreaks).catch(() => setBreaks([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !doctorId || !dateISO || !duration) {
      setSlots([]);
      return;
    }
    let active = true;
    setSlotsLoading(true);
    setSlotsError("");
    loadBackendAvailability({ doctorId, dateISO, durationMinutes: duration })
      .then((rows) => {
        if (!active) return;
        const day = weekday(dateISO);
        const free = rows.filter((slot) => {
          const start = toMinutes(slot);
          const end = start + duration;
          return !breaks.some((b) => b.doctorId === doctorId && b.dayOfWeek === day && toMinutes(b.startTime) < end && toMinutes(b.endTime) > start);
        });
        setSlots(free);
        setTime((current) => (free.includes(current) ? current : free[0] || ""));
      })
      .catch((e) => {
        if (!active) return;
        setSlots([]);
        setSlotsError(e instanceof Error ? e.message : "Não foi possível consultar os horários.");
      })
      .finally(() => active && setSlotsLoading(false));
    return () => {
      active = false;
    };
  }, [open, doctorId, dateISO, duration, breaks]);

  const patientReady = useMemo(() => {
    if (!choice) return false;
    if (choice.mode === "registered") return true;
    return choice.fullName.trim().length >= 3 && isValidPhoneBR(choice.phone);
  }, [choice]);

  const save = async () => {
    if (!choice || !patientReady) {
      setError("Informe o paciente (para paciente novo: nome e telefone com DDD).");
      return;
    }
    if (!doctorId || !time) {
      setError("Escolha o profissional e um horário disponível.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let patient: BackendPatient;
      if (choice.mode === "registered") {
        patient = choice.patient;
      } else {
        const existing = patients.find((p) => onlyDigits(p.phone) === onlyDigits(choice.phone));
        patient = existing
          ? existing
          : await createBackendPatient({ fullName: choice.fullName.trim(), phone: formatPhoneBR(choice.phone) } as Parameters<typeof createBackendPatient>[0]);
      }
      const scheduledAt = new Date(`${dateISO}T${time}:00`);
      await createBackendAppointment({
        patientId: patient.id,
        doctorId,
        procedure: procedure.trim() || DEFAULT_PROCEDURE,
        nextProcedure: "Definir após atendimento",
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: duration,
        reminderChannel: "WHATSAPP",
        reminders,
      });
      setDone(`${patient.fullName} agendado(a) em ${new Date(`${dateISO}T12:00:00`).toLocaleDateString("pt-BR")} às ${time}.`);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível agendar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 900 }}>Agendar paciente</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
        {done ? (
          <Alert severity="success">{done} Os lembretes pelo WhatsApp foram programados.</Alert>
        ) : (
          <>
            {fixedPatient ? (
              <Box>
                <Typography sx={{ fontWeight: 800 }}>{fixedPatient.fullName}</Typography>
                <Typography variant="body2" color="text.secondary">{formatPhoneBR(fixedPatient.phone) || fixedPatient.phone}</Typography>
              </Box>
            ) : (
              <PatientSearchField patients={patients} value={choice} onChange={setChoice} autoFocus />
            )}

            <ProcedurePicker
              value={procedure}
              onChange={(name) => {
                setProcedure(name);
                setDuration(suggestDuration(name, duration));
              }}
            />

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
              <DurationSelect value={duration} onChange={setDuration} procedure={procedure} />
              <TextField select label="Profissional" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}
                helperText={!doctors.length ? "Nenhum profissional cadastrado." : undefined}>
                {doctors.map((doctor) => (
                  <MenuItem key={doctor.id} value={doctor.id}>{doctorLabel(doctor)}</MenuItem>
                ))}
              </TextField>
              <TextField type="date" label="Data" value={dateISO} onChange={(e) => setDateISO(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }} />
              <TextField select label="Horário" value={slots.includes(time) ? time : ""} onChange={(e) => setTime(e.target.value)}
                disabled={slotsLoading}
                helperText={slotsLoading ? "Consultando agenda..." : slotsError || (slots.length ? `${slots.length} horário(s) livre(s)` : "Nenhum horário livre nesta data")}>
                {slots.map((slot) => (
                  <MenuItem key={slot} value={slot}>{rangeLabel(slot, duration)}</MenuItem>
                ))}
              </TextField>
            </Box>

            {slotsLoading ? <Box sx={{ display: "flex", justifyContent: "center" }}><CircularProgress size={20} /></Box> : null}
            {!slotsLoading && slots.length > 0 ? (
              <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                {slots.slice(0, 24).map((slot) => (
                  <Chip key={slot} label={slot} clickable color={slot === time ? "primary" : "default"} onClick={() => setTime(slot)} />
                ))}
              </Box>
            ) : null}

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>Lembretes pelo WhatsApp</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <FormControlLabel control={<Checkbox size="small" checked={reminders.onBooking} onChange={(e) => setReminders((r) => ({ ...r, onBooking: e.target.checked }))} />} label="Ao agendar" />
                <FormControlLabel control={<Checkbox size="small" checked={reminders.oneDayBefore} onChange={(e) => setReminders((r) => ({ ...r, oneDayBefore: e.target.checked }))} />} label="1 dia antes" />
                <FormControlLabel control={<Checkbox size="small" checked={reminders.onDay} onChange={(e) => setReminders((r) => ({ ...r, onDay: e.target.checked }))} />} label="No dia" />
              </Box>
            </Box>

            {error ? <Alert severity="error">{error}</Alert> : null}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
        <Button onClick={() => { onClose(); navigate("/agenda"); }}>Abrir agenda completa</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{done ? "Fechar" : "Cancelar"}</Button>
        {!done ? (
          <Button variant="contained" disabled={saving || !patientReady || !time} onClick={() => void save()}>
            {saving ? "Agendando..." : "Agendar"}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
