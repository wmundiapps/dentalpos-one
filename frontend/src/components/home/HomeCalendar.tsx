import { useMemo, useState } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { IntegratedAppointment } from "../../types/operationsHub";

const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const todayISO = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };

interface Props {
  /** Consultas já filtradas pelo dentista escolhido: só marca o dia se houver consulta dele. */
  appointments: IntegratedAppointment[];
  selected: string;
  onSelect: (dateISO: string) => void;
}

// Calendário limpo: um pontinho no dia que tem alguma consulta marcada.
export default function HomeCalendar({ appointments, selected, onSelect }: Props) {
  const base = new Date(`${selected}T12:00:00`);
  const [cursor, setCursor] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const marked = useMemo(() => new Set(appointments.filter((a) => a.status !== "Cancelado").map((a) => a.dateISO)), [appointments]);

  const first = new Date(cursor.y, cursor.m, 1).getDay();
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: Array<number | null> = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const rawTitle = new Date(cursor.y, cursor.m, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
  const move = (delta: number) => setCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const today = todayISO();

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <IconButton size="small" onClick={() => move(-1)} aria-label="Mês anterior"><ChevronLeftIcon /></IconButton>
        <Typography sx={{ fontWeight: 800 }}>{title}</Typography>
        <IconButton size="small" onClick={() => move(1)} aria-label="Próximo mês"><ChevronRightIcon /></IconButton>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.3, textAlign: "center" }}>
        {WEEK.map((w, i) => <Typography key={i} variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{w}</Typography>)}
        {cells.map((d, i) => {
          if (!d) return <Box key={`e${i}`} />;
          const key = iso(cursor.y, cursor.m, d);
          const isSel = key === selected;
          return (
            <Box
              key={key}
              role="button"
              tabIndex={0}
              aria-label={`${d} de ${title}${marked.has(key) ? ", com consulta marcada" : ""}`}
              onClick={() => onSelect(key)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(key); } }}
              sx={{
                cursor: "pointer", borderRadius: 2, py: 0.6, minHeight: 42, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.3,
                bgcolor: isSel ? "primary.main" : "transparent", color: isSel ? "primary.contrastText" : "text.primary",
                border: "1px solid", borderColor: key === today && !isSel ? "primary.main" : "transparent",
                "&:hover": { bgcolor: isSel ? "primary.dark" : "action.hover" },
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: isSel || key === today ? 800 : 500, lineHeight: 1 }}>{d}</Typography>
              <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: marked.has(key) ? (isSel ? "primary.contrastText" : "primary.main") : "transparent" }} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
