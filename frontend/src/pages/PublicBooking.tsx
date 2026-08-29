import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import ProcedurePicker from "../components/ProcedurePicker";
import {
  createPublicBooking,
  loadPublicAvailability,
  loadPublicBookingConfig,
  type PublicBookingConfig,
} from "../services/PublicBookingApi";

const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

export default function PublicBooking() {
  const clinicId = new URLSearchParams(window.location.search).get("clinicId") || "";
  const [config, setConfig] = useState<PublicBookingConfig | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    patientName: "",
    patientPhone: "",
    doctorId: "",
    procedure: "Consulta inicial / avaliação",
    dateISO: today(),
    time: "",
    durationMinutes: 30,
  });

  useEffect(() => {
    if (!clinicId) {
      setError("Link de agendamento inválido. Solicite um novo link à clínica.");
      setLoading(false);
      return;
    }
    loadPublicBookingConfig(clinicId)
      .then((data) => {
        setConfig(data);
        if (data.doctors[0]) setForm((current) => ({ ...current, doctorId: data.doctors[0].id }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível abrir o agendamento."))
      .finally(() => setLoading(false));
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId || !form.doctorId || !form.dateISO) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setError("");
    loadPublicAvailability({
      clinicId,
      doctorId: form.doctorId,
      dateISO: form.dateISO,
      durationMinutes: form.durationMinutes,
    })
      .then((available) => {
        setSlots(available);
        setForm((current) => ({ ...current, time: available.includes(current.time) ? current.time : available[0] || "" }));
      })
      .catch((err) => {
        setSlots([]);
        setError(err instanceof Error ? err.message : "Não foi possível consultar os horários.");
      })
      .finally(() => setLoadingSlots(false));
  }, [clinicId, form.doctorId, form.dateISO, form.durationMinutes]);

  const save = async () => {
    if (!form.patientName.trim() || !form.patientPhone.trim() || !form.doctorId || !form.time) return;
    setError("");
    try {
      await createPublicBooking({
        clinicId,
        ...form,
        reminderChannel: "WHATSAPP",
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar o agendamento.");
    }
  };

  if (loading) {
    return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f6f8fb", display: "grid", placeItems: "center", p: 2 }}>
      <Paper sx={{ maxWidth: 760, width: "100%", p: { xs: 3, md: 5 }, borderRadius: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 900 }}>
          {config?.clinic.name || "DentalPos"} • Agendamento online
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Os horários exibidos são consultados diretamente na agenda da clínica.
        </Typography>

        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

        {sent ? (
          <Alert
            severity="success"
            action={<Button onClick={() => setSent(false)}>Novo agendamento</Button>}
          >
            Solicitação registrada na agenda da clínica. A confirmação será enviada automaticamente por WhatsApp.
          </Alert>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <TextField
              required
              label="Nome"
              value={form.patientName}
              onChange={(event) => setForm({ ...form, patientName: event.target.value })}
            />
            <TextField
              required
              label="Celular / WhatsApp"
              value={form.patientPhone}
              onChange={(event) => setForm({ ...form, patientPhone: event.target.value })}
            />
            <TextField
              select
              label="Profissional"
              value={form.doctorId}
              onChange={(event) => setForm({ ...form, doctorId: event.target.value })}
            >
              {(config?.doctors || []).map((doctor) => (
                <MenuItem key={doctor.id} value={doctor.id}>
                  {doctor.name}{doctor.specialty ? ` • ${doctor.specialty}` : ""}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              label="Data"
              value={form.dateISO}
              onChange={(event) => setForm({ ...form, dateISO: event.target.value })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today() } }}
            />
            <Box sx={{ gridColumn: { md: "1/-1" } }}>
              <ProcedurePicker
                value={form.procedure}
                onChange={(name) => setForm({ ...form, procedure: name })}
              />
            </Box>
            <TextField
              select
              label={loadingSlots ? "Consultando horários..." : "Horário disponível"}
              value={form.time}
              disabled={loadingSlots || slots.length === 0}
              onChange={(event) => setForm({ ...form, time: event.target.value })}
            >
              {slots.map((slot) => <MenuItem key={slot} value={slot}>{slot}</MenuItem>)}
            </TextField>
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <Button
                fullWidth
                size="large"
                variant="contained"
                startIcon={<EventAvailableIcon />}
                disabled={!form.time || loadingSlots}
                onClick={save}
              >
                Solicitar agendamento
              </Button>
            </Box>
            {!loadingSlots && slots.length === 0 && form.doctorId ? (
              <Alert severity="info" sx={{ gridColumn: { md: "1/-1" } }}>
                Não há horário livre nessa data para o tempo reservado. Escolha outra data.
              </Alert>
            ) : null}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
