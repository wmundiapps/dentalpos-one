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
    firstName: "",
    lastName: "",
    birthDate: "",
    patientPhone: "",
    city: "",
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
    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.birthDate ||
      !form.patientPhone.trim() ||
      !form.city.trim() ||
      !form.doctorId ||
      !form.time
    ) {
      setError("Preencha nome, sobrenome, data de nascimento, WhatsApp, cidade, profissional e horário.");
      return;
    }

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
      <Paper sx={{ maxWidth: 820, width: "100%", p: { xs: 3, md: 5 }, borderRadius: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 900 }}>
          {config?.clinic.name || "DentalPos"} • Agendamento online
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          Escolha um dos horários disponibilizados pela clínica.
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
          Se este WhatsApp já estiver cadastrado, o agendamento será vinculado automaticamente ao cadastro existente.
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
              value={form.firstName}
              onChange={(event) => setForm({ ...form, firstName: event.target.value })}
            />
            <TextField
              required
              label="Sobrenome"
              value={form.lastName}
              onChange={(event) => setForm({ ...form, lastName: event.target.value })}
            />
            <TextField
              required
              type="date"
              label="Data de nascimento"
              value={form.birthDate}
              onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today() } }}
            />
            <TextField
              required
              label="Telefone / WhatsApp"
              value={form.patientPhone}
              onChange={(event) => setForm({ ...form, patientPhone: event.target.value })}
            />
            <TextField
              required
              label="Cidade"
              value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
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
              label="Data da consulta"
              value={form.dateISO}
              onChange={(event) => setForm({ ...form, dateISO: event.target.value })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today() } }}
            />
            <TextField
              select
              label={loadingSlots ? "Consultando horários..." : "Horário disponível"}
              value={form.time}
              disabled={loadingSlots || slots.length === 0}
              onChange={(event) => setForm({ ...form, time: event.target.value })}
            >
              {slots.map((slot) => <MenuItem key={slot} value={slot}>{slot}</MenuItem>)}
            </TextField>
            <Box sx={{ gridColumn: { md: "1/-1" } }}>
              <ProcedurePicker
                value={form.procedure}
                onChange={(name) => setForm({ ...form, procedure: name })}
              />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gridColumn: { md: "1/-1" } }}>
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
                Não há horário online disponível nessa data. Escolha outra data.
              </Alert>
            ) : null}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
