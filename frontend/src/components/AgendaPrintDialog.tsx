import { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import type { IntegratedAppointment } from "../types/operationsHub";
import { agendaPrintItems, agendaRange, printAgenda, type AgendaPrintView } from "../utils/agendaPrint";

// Imprimir a agenda: escolhe dia, semana ou mês (a partir da data que está na tela) e o profissional.
export default function AgendaPrintDialog({ open, onClose, items, professionals, defaultView, dateISO, defaultProfessional }: { open: boolean; onClose: () => void; items: IntegratedAppointment[]; professionals: string[]; defaultView: AgendaPrintView; dateISO: string; defaultProfessional: string }) {
  const [view, setView] = useState<AgendaPrintView>(defaultView);
  const [professional, setProfessional] = useState(defaultProfessional);
  useEffect(() => { if (open) { setView(defaultView); setProfessional(defaultProfessional); } }, [open, defaultView, defaultProfessional]);

  const days = agendaRange(view, dateISO);
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
        </ToggleButtonGroup>
        <TextField select size="small" label="Profissional" value={professional} onChange={(e) => setProfessional(e.target.value)}>
          {professionals.map((name) => <MenuItem key={name} value={name}>{name === "Todos" ? "Todos os profissionais" : name}</MenuItem>)}
        </TextField>
        <Typography variant="body2" color="text.secondary">
          {view === "day" ? dmy(days[0]) : `${dmy(days[0])} a ${dmy(days[days.length - 1])}`}: <b>{count}</b> agendamento(s). Sai o nome do paciente, o dia, o horário e o procedimento. Para outra data, mude a data na agenda antes de imprimir.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={() => { printAgenda({ items, view, dateISO, professional }); onClose(); }}>Imprimir</Button>
      </DialogActions>
    </Dialog>
  );
}
