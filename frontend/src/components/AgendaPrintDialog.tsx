import { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import type { IntegratedAppointment } from "../types/operationsHub";
import { agendaPrintItems, agendaRange, printAgenda, type AgendaPrintView } from "../utils/agendaPrint";

// Imprimir a agenda: escolhe dia, semana ou mês (a partir da data que está na tela) e o profissional.
export default function AgendaPrintDialog({ open, onClose, items, professionals, defaultView, dateISO, defaultProfessional }: { open: boolean; onClose: () => void; items: IntegratedAppointment[]; professionals: string[]; defaultView: AgendaPrintView; dateISO: string; defaultProfessional: string }) {
  const [view, setView] = useState<AgendaPrintView>(defaultView);
  const [professional, setProfessional] = useState(defaultProfessional);
  const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const [from, setFrom] = useState(dateISO);
  const [to, setTo] = useState(addDays(dateISO, 6));
  useEffect(() => { if (open) { setView(defaultView); setProfessional(defaultProfessional); setFrom(dateISO); setTo(addDays(dateISO, 6)); } }, [open, defaultView, defaultProfessional, dateISO]);

  const baseISO = view === "range" ? from : dateISO;
  const days = agendaRange(view, baseISO, to);
  const count = agendaPrintItems(items, days, professional).length;
  const dmy = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 800 }}>Imprimir agenda</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
        <ToggleButtonGroup exclusive fullWidth size="small" value={view} onChange={(_, v) => { if (v) setView(v); }}>
          <ToggleButton value="day">Dia</ToggleButton>
          <ToggleButton value="week">Semana</ToggleButton>
          <ToggleButton value="month">Mês</ToggleButton>
          <ToggleButton value="range">Período</ToggleButton>
        </ToggleButtonGroup>
        {view === "range" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <TextField size="small" type="date" label="De" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="Até" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from } }} error={to < from} />
          </div>
        ) : null}
        <TextField select size="small" label="Profissional" value={professional} onChange={(e) => setProfessional(e.target.value)}>
          {professionals.map((name) => <MenuItem key={name} value={name}>{name === "Todos" ? "Todos os profissionais" : name}</MenuItem>)}
        </TextField>
        <Typography variant="body2" color="text.secondary">
          {view === "day" ? dmy(days[0]) : `${dmy(days[0])} a ${dmy(days[days.length - 1])}`}: <b>{count}</b> agendamento(s). Sai o nome do paciente, o dia, o horário e o procedimento. Para outra data, mude a data na agenda antes de imprimir.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={view === "range" && (!from || !to || to < from)} startIcon={<PrintOutlinedIcon />} onClick={() => { printAgenda({ items, view, dateISO: baseISO, endISO: view === "range" ? to : undefined, professional }); onClose(); }}>Imprimir</Button>
      </DialogActions>
    </Dialog>
  );
}
