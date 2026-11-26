import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import { createAgendaBlock } from "../services/ScheduleApi";
import type { BackendDoctor } from "../services/AppointmentApi";
import { errorMessage, toast } from "../utils/toast";

// Fechar a agenda de um profissional (ou da clínica) por dias: férias, atendimento em outro local, compromisso externo...
// Não cancela consultas já marcadas: avisa quantas existem no período para a equipe remarcar.
const REASONS = ["Férias", "Atendendo em outro local", "Compromisso externo", "Curso / congresso", "Consulta médica", "Folga"];
const dmy = (iso: string) => iso.split("-").reverse().join("/");

export type CloseAgendaAppointment = { dateISO: string; professionalName: string; status: string };

export default function CloseAgendaDialog({ open, onClose, doctors, defaultDoctorId, defaultDate, appointments, onSaved }: {
  open: boolean; onClose: () => void; doctors: BackendDoctor[]; defaultDoctorId?: string; defaultDate: string;
  appointments: CloseAgendaAppointment[]; onSaved: () => void | Promise<void>;
}) {
  const [target, setTarget] = useState("");
  const [from, setFrom] = useState(defaultDate);
  const [to, setTo] = useState(defaultDate);
  const [reason, setReason] = useState("Férias");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTarget(defaultDoctorId || "");
    setFrom(defaultDate); setTo(defaultDate); setReason("Férias"); setNote("");
  }, [open, defaultDoctorId, defaultDate]);

  const nameOf = (d: BackendDoctor) => `${d.user.firstName} ${d.user.lastName}`.trim();
  const targetName = target === "ALL" ? "" : doctors.find((d) => d.id === target) ? nameOf(doctors.find((d) => d.id === target)!) : "";
  const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(dra?|dr)\.?\s*/g, "").trim();
  const booked = useMemo(() => appointments.filter((a) =>
    a.dateISO >= from && a.dateISO <= to && !["Cancelado", "Desmarcado"].includes(a.status) &&
    (target === "ALL" || (targetName && (norm(a.professionalName) === norm(targetName) || norm(a.professionalName).includes(norm(targetName)) || norm(targetName).includes(norm(a.professionalName)))))
  ).length, [appointments, from, to, target, targetName]);

  const valid = !!target && !!from && !!to && to >= from;
  const days = valid ? Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000) + 1 : 0;

  const save = async () => {
    if (!valid) return;
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`); end.setDate(end.getDate() + 1);
    setSaving(true);
    try {
      await createAgendaBlock({ doctorId: target === "ALL" ? null : target, startAt: start.toISOString(), endAt: end.toISOString(), reason: [reason, note.trim()].filter(Boolean).join(" — ") });
      toast.success(`Agenda fechada${targetName ? ` de ${targetName}` : target === "ALL" ? " da clínica" : ""}: ${days === 1 ? dmy(from) : `${dmy(from)} a ${dmy(to)}`}.`);
      await onSaved();
      onClose();
    } catch (e) { toast.error(errorMessage(e, "Não foi possível fechar a agenda.")); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 900 }}>Fechar agenda</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
        <TextField select label="Profissional" value={target} onChange={(e) => setTarget(e.target.value)} required>
          <MenuItem value="ALL">Toda a clínica</MenuItem>
          {doctors.map((d) => <MenuItem key={d.id} value={d.id}>{nameOf(d)}</MenuItem>)}
        </TextField>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          <TextField type="date" label="Primeiro dia" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" label="Último dia" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from } }} />
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>Motivo</Typography>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
            {REASONS.map((r) => <Chip key={r} label={r} clickable color={reason === r ? "primary" : "default"} variant={reason === r ? "filled" : "outlined"} onClick={() => setReason(r)} />)}
          </Box>
        </Box>
        <TextField label="Observação (opcional)" placeholder="Ex.: atendendo na clínica de Sarandi" value={note} onChange={(e) => setNote(e.target.value)} />
        {valid && booked > 0 && <Alert severity="warning">Já existem <b>{booked}</b> consulta(s) marcada(s) neste período. Elas <b>não são canceladas</b>: remarque ou desmarque cada uma.</Alert>}
        {valid && booked === 0 && <Alert severity="info">Nenhum horário novo poderá ser marcado {days === 1 ? "nesse dia" : `nesses ${days} dias`}, nem pela agenda, nem pelo agendamento online.</Alert>}
        {to < from && <Alert severity="error">O último dia não pode ser antes do primeiro.</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="warning" disabled={!valid || saving} onClick={() => void save()}>Fechar agenda</Button>
      </DialogActions>
    </Dialog>
  );
}
