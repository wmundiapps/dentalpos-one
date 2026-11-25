import { useRef, useState, type ReactNode } from "react";
import { Box, Button, ButtonBase, IconButton, Popover, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import MenuIcon from "@mui/icons-material/Menu";
import AddIcon from "@mui/icons-material/Add";

export type AgendaView = "day" | "week" | "month";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export function compactDate(dateISO: string, view: AgendaView) {
  const d = new Date(`${dateISO}T12:00:00`);
  if (view === "month") return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export const professionalInitials = (name: string) => {
  const parts = name.replace(/^(dra?\.?)\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
};

interface Props {
  date: string;
  view: AgendaView;
  isToday: boolean;
  onStep: (kind: "small" | "big", direction: -1 | 1) => void;
  onDate: (dateISO: string) => void;
  onToday: () => void;
  onView: (view: AgendaView) => void;
  professionals: string[];
  colors: Map<string, string>;
  professional: string;
  onProfessional: (name: string) => void;
  onNewAppointment: () => void;
  onNewCommitment: () => void;
  moreOpen: boolean;
  onToggleMore: () => void;
  extra?: ReactNode;
}

// Barra enxuta da agenda no celular: só o dia no topo, setas (1 dia / 1 semana), menu de opções no canto e os dentistas só por cor.
export default function AgendaMobileBar({ date, view, isToday, onStep, onDate, onToday, onView, professionals, colors, professional, onProfessional, onNewAppointment, onNewCommitment, moreOpen, onToggleMore, extra }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const names = professionals.filter((n) => n !== "Todos");
  const arrow = { border: "1px solid", borderColor: "divider", borderRadius: 2, width: 40, height: 40 } as const;
  const run = (fn: () => void) => () => { setAnchor(null); fn(); };

  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <IconButton aria-label="Voltar 1 semana" onClick={() => onStep("big", -1)} sx={arrow}><KeyboardDoubleArrowLeftIcon /></IconButton>
        <IconButton aria-label="Voltar 1 dia" onClick={() => onStep("small", -1)} sx={arrow}><ChevronLeftIcon /></IconButton>
        <ButtonBase
          aria-label="Escolher a data"
          onClick={() => { try { pickerRef.current?.showPicker?.(); } catch { pickerRef.current?.focus(); } }}
          sx={{ flex: 1, minWidth: 0, height: 40, borderRadius: 2, border: "1px solid", borderColor: isToday ? "primary.main" : "divider", bgcolor: isToday ? "action.selected" : "transparent", position: "relative", px: 0.5 }}
        >
          <Typography noWrap sx={{ fontWeight: 900, fontSize: 15 }}>{compactDate(date, view)}</Typography>
          <input ref={pickerRef} type={view === "month" ? "month" : "date"} value={view === "month" ? date.slice(0, 7) : date} aria-hidden tabIndex={-1}
            onChange={(e) => { if (e.target.value) onDate(view === "month" ? `${e.target.value}-01` : e.target.value); }}
            style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
        </ButtonBase>
        <IconButton aria-label="Avançar 1 dia" onClick={() => onStep("small", 1)} sx={arrow}><ChevronRightIcon /></IconButton>
        <IconButton aria-label="Avançar 1 semana" onClick={() => onStep("big", 1)} sx={arrow}><KeyboardDoubleArrowRightIcon /></IconButton>
        <IconButton aria-label="Opções da agenda" onClick={(e) => setAnchor(e.currentTarget)} sx={{ ...arrow, bgcolor: "primary.main", color: "primary.contrastText", borderColor: "primary.main", "&:hover": { bgcolor: "primary.dark" } }}><MenuIcon /></IconButton>
      </Box>

      {names.length > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mt: 1, overflowX: "auto", pb: 0.3 }} role="group" aria-label="Dentistas">
          <ButtonBase onClick={() => onProfessional("Todos")} aria-pressed={professional === "Todos"} sx={{ flexShrink: 0, height: 34, px: 1.1, borderRadius: 1.5, border: "2px solid", borderColor: professional === "Todos" ? "text.primary" : "divider", fontWeight: 800, fontSize: 12.5, bgcolor: professional === "Todos" ? "action.selected" : "transparent" }}>Todos</ButtonBase>
          {names.map((name) => {
            const on = professional === name; const color = colors.get(name.trim()) || "#1976d2";
            return (
              <ButtonBase key={name} aria-label={name} title={name} aria-pressed={on} onClick={() => onProfessional(on ? "Todos" : name)}
                sx={{ flexShrink: 0, width: 34, height: 34, borderRadius: 1.5, bgcolor: color, color: "#fff", fontWeight: 900, fontSize: 12, opacity: professional === "Todos" || on ? 1 : 0.35, outline: on ? "3px solid" : "none", outlineColor: "text.primary", outlineOffset: 1 }}>
                {professionalInitials(name)}
              </ButtonBase>
            );
          })}
        </Box>
      )}

      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        <Box sx={{ p: 1.5, display: "grid", gap: 1, minWidth: 250 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={run(onNewAppointment)}>Novo agendamento</Button>
          <Button variant="outlined" onClick={run(onNewCommitment)}>Novo compromisso</Button>
          <ToggleButtonGroup exclusive fullWidth size="small" value={view} onChange={(_, v) => { if (v) { setAnchor(null); onView(v); } }}>
            <ToggleButton value="day">Dia</ToggleButton>
            <ToggleButton value="week">Semana</ToggleButton>
            <ToggleButton value="month">Mês</ToggleButton>
          </ToggleButtonGroup>
          <Button onClick={run(onToday)}>Ir para hoje</Button>
          {extra}
          <Button variant={moreOpen ? "contained" : "outlined"} onClick={run(onToggleMore)}>{moreOpen ? "Ocultar busca e filtros" : "Busca, filtros e pendências"}</Button>
        </Box>
      </Popover>
    </Box>
  );
}
