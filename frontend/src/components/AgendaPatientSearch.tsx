import { useMemo, useState } from "react";
import { Autocomplete, Box, Button, Chip, Paper, TextField, Typography } from "@mui/material";
import type { BackendPatient } from "../services/PatientApi";
import type { IntegratedAppointment } from "../types/operationsHub";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digits = (s: string) => s.replace(/\D/g, "");
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

interface Props {
  patients: BackendPatient[];
  appointments: IntegratedAppointment[];
  onSchedule: (patient: BackendPatient) => void;
  onGoToDate: (dateISO: string) => void;
  onOpenFile: (patient: BackendPatient) => void;
}

// Busca de paciente no topo da agenda: ao tocar no campo já abre a lista; ao escolher, mostra as consultas dele e o atalho para agendar.
export default function AgendaPatientSearch({ patients, appointments, onSchedule, onGoToDate, onOpenFile }: Props) {
  const [selected, setSelected] = useState<BackendPatient | null>(null);
  const [input, setInput] = useState("");

  const mine = useMemo(() => {
    if (!selected) return [];
    const name = norm(selected.fullName);
    return appointments
      .filter((a) => (a.patientId ? a.patientId === selected.id : norm(a.patientName) === name) && a.status !== "Cancelado")
      .sort((a, b) => `${b.dateISO} ${b.time}`.localeCompare(`${a.dateISO} ${a.time}`));
  }, [selected, appointments]);

  const today = new Date().toISOString().slice(0, 10);
  const next = mine.filter((a) => a.dateISO >= today).reverse();
  const past = mine.filter((a) => a.dateISO < today).slice(0, 3);

  const filter = (options: BackendPatient[], state: { inputValue: string }) => {
    const q = norm(state.inputValue).trim();
    const d = digits(state.inputValue);
    const list = !q ? options : options.filter((p) => norm(p.fullName).includes(q) || (d.length >= 3 && (digits(p.phone || "").includes(d) || digits(p.cpf || "").includes(d))) || (p.recordNumber != null && String(p.recordNumber) === q));
    return list.slice(0, 40);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
      <Autocomplete
        options={patients}
        value={selected}
        onChange={(_, v) => setSelected(v)}
        inputValue={input}
        onInputChange={(_, v) => setInput(v)}
        openOnFocus
        autoHighlight
        filterOptions={filter}
        getOptionLabel={(p) => p.fullName}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText="Nenhum paciente encontrado. Use “Novo agendamento” para cadastrar."
        renderOption={(props, p) => (
          <li {...props} key={p.id}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{p.fullName}</Typography>
              <Typography variant="caption" color="text.secondary">{[p.phone, p.recordNumber != null ? `ficha ${p.recordNumber}` : ""].filter(Boolean).join(" · ")}</Typography>
            </Box>
          </li>
        )}
        renderInput={(params) => (
          <TextField {...params} size="small" label="Buscar paciente (nome, telefone, CPF ou nº da ficha)" placeholder="Toque aqui e digite para buscar" />
        )}
      />
      {selected && (
        <Box sx={{ mt: 2, display: "grid", gap: 1.2 }}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <Typography sx={{ fontWeight: 800 }}>{selected.fullName}</Typography>
            {selected.phone && <Chip size="small" label={selected.phone} />}
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" size="small" onClick={() => onSchedule(selected)}>Agendar para este paciente</Button>
            <Button variant="outlined" size="small" onClick={() => onOpenFile(selected)}>Abrir ficha</Button>
          </Box>
          {next.length > 0 ? (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Próximas consultas:</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {next.map((a) => <Chip key={a.id} color="primary" variant="outlined" onClick={() => onGoToDate(a.dateISO)} label={`${dmy(a.dateISO)} ${a.time} · ${a.procedure} · ${a.professionalName}`} />)}
              </Box>
            </Box>
          ) : <Typography variant="body2" color="text.secondary">Sem consulta futura marcada.</Typography>}
          {past.length > 0 && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Últimas consultas:</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {past.map((a) => <Chip key={a.id} variant="outlined" onClick={() => onGoToDate(a.dateISO)} label={`${dmy(a.dateISO)} ${a.time} · ${a.procedure}`} />)}
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
}
