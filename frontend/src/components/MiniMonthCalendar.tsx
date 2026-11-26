import { useEffect, useMemo, useState } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (value: string) => new Date(`${value}T12:00:00`);

// Calendário do mês ao lado da agenda (como no Clinicorp): a semana mostrada fica destacada, hoje em laranja e dias com consulta ganham um ponto.
export default function MiniMonthCalendar({ dateISO, view, onSelect, markedDates }: { dateISO: string; view: "day" | "week" | "month"; onSelect: (dateISO: string) => void; markedDates?: Set<string> }) {
  const selected = parse(dateISO);
  const [cursor, setCursor] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  // Se a data mudar por fora (setas da agenda), o calendário acompanha o mês.
  useEffect(() => {
    const d = parse(dateISO);
    setCursor((cur) => (cur.getFullYear() === d.getFullYear() && cur.getMonth() === d.getMonth() ? cur : new Date(d.getFullYear(), d.getMonth(), 1)));
  }, [dateISO]);

  const todayISO = iso(new Date());
  const weekStart = useMemo(() => { const d = parse(dateISO); d.setDate(d.getDate() - d.getDay()); return iso(d); }, [dateISO]);
  const weekEnd = useMemo(() => { const d = parse(weekStart); d.setDate(d.getDate() + 6); return iso(d); }, [weekStart]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor]);
  const rows = cells[35].getMonth() === cursor.getMonth() ? 6 : 5;

  return (
    <Box sx={{ userSelect: "none" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <IconButton size="small" aria-label="Mês anterior" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeftIcon fontSize="small" /></IconButton>
        <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</Typography>
        <IconButton size="small" aria-label="Próximo mês" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRightIcon fontSize="small" /></IconButton>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 0.25 }}>
        {WEEKDAYS.map((w) => <Typography key={w} variant="caption" sx={{ textAlign: "center", color: "text.secondary", fontWeight: 700 }}>{w}</Typography>)}
        {cells.slice(0, rows * 7).map((d) => {
          const key = iso(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = key === todayISO;
          const inWeek = view !== "month" && key >= weekStart && key <= weekEnd;
          const isSelected = key === dateISO && view === "day";
          const marked = markedDates?.has(key);
          return (
            <Box
              key={key}
              role="button"
              tabIndex={0}
              aria-label={d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
              onClick={() => onSelect(key)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(key); } }}
              sx={{
                position: "relative", height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13,
                fontWeight: isToday || isSelected ? 900 : 500,
                color: isToday ? "#fff" : inMonth ? "text.primary" : "text.disabled",
                bgcolor: isToday ? "#f37021" : isSelected ? "rgba(243,112,33,.35)" : inWeek ? "rgba(243,112,33,.16)" : "transparent",
                borderRadius: isToday || isSelected ? 1.5 : 0,
                "&:hover": { bgcolor: isToday ? "#f37021" : "rgba(243,112,33,.28)" },
              }}
            >
              {d.getDate()}
              {marked && !isToday ? <Box sx={{ position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: "50%", bgcolor: "#f37021" }} /> : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
