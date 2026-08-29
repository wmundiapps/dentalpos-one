import type { MouseEvent } from "react";
import { Box, Chip, Paper, Typography } from "@mui/material";
import type { IntegratedAppointment } from "../types/operationsHub";
import { patientFinancialSummary } from "../services/FinanceHubService";

type View = "day" | "week" | "month";

type AppointmentPrefill = {
  dateISO: string;
  time?: string;
  professionalName?: string;
};

interface Props {
  view: View;
  dateISO: string;
  items: IntegratedAppointment[];
  professional: string;
  onDateChange: (dateISO: string) => void;
  onAppointmentClick: (appointment: IntegratedAppointment) => void;
  onNew: (prefill: AppointmentPrefill) => void;
}

const START_MINUTES = 7 * 60;
const END_MINUTES = 21 * 60;
const TOTAL_MINUTES = END_MINUTES - START_MINUTES;
const GRID_HEIGHT = 756;

function iso(date: Date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function minuteOfDay(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(value: number) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, value));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function endTime(appointment: IntegratedAppointment) {
  return timeFromMinutes(minuteOfDay(appointment.time) + (appointment.durationMinutes || 30));
}

function weekDates(dateISO: string) {
  const base = new Date(`${dateISO}T12:00:00`);
  const weekday = base.getDay() || 7;
  base.setDate(base.getDate() - weekday + 1);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(base);
    day.setDate(base.getDate() + index);
    return iso(day);
  });
}

function shortDate(dateISO: string) {
  return new Date(`${dateISO}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function overdueInstallments(patientName: string) {
  try {
    const entries = JSON.parse(localStorage.getItem("dentalpos.financial.entries.v3") || "[]") as Array<{
      type?: string;
      personName?: string;
      status?: string;
    }>;
    return entries.filter(
      (entry) =>
        entry.type === "Receita" &&
        entry.personName?.toLowerCase() === patientName.toLowerCase() &&
        entry.status === "Vencido",
    ).length;
  } catch {
    return 0;
  }
}

function financialText(appointment: IntegratedAppointment) {
  const overdue = overdueInstallments(appointment.patientName);
  if (overdue) return `${overdue} parcela(s) em atraso`;
  return patientFinancialSummary(appointment.patientName).status === "Em dia" ? "Financeiro OK" : "Pendência";
}

function statusColor(status: IntegratedAppointment["status"]): "success" | "error" | "warning" | "default" {
  if (status === "Confirmado" || status === "Finalizado") return "success";
  if (status === "Faltou" || status === "Cancelado") return "error";
  if (status === "Aguardando" || status === "Em atendimento") return "warning";
  return "default";
}

function AppointmentCard({
  appointment,
  compact = false,
  onClick,
}: {
  appointment: IntegratedAppointment;
  compact?: boolean;
  onClick: () => void;
}) {
  const finance = financialText(appointment);
  const isOk = finance === "Financeiro OK";

  return (
    <Paper
      variant="outlined"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      sx={{
        p: compact ? 0.75 : 1,
        borderRadius: 2,
        cursor: "pointer",
        overflow: "hidden",
        bgcolor: "background.paper",
        "&:hover": { boxShadow: 2 },
      }}
    >
      <Typography variant={compact ? "caption" : "body2"} sx={{ fontWeight: 900, lineHeight: 1.2 }}>
        {appointment.time}–{endTime(appointment)} • {appointment.patientName}
      </Typography>
      {!compact ? (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {appointment.procedure}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {appointment.professionalName} • {appointment.room}
          </Typography>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.6 }}>
            <Chip size="small" label={finance} color={isOk ? "success" : "error"} />
            <Chip size="small" label={appointment.status} color={statusColor(appointment.status)} />
          </Box>
        </>
      ) : null}
    </Paper>
  );
}

function MonthView({ dateISO, items, onDateChange, onAppointmentClick, onNew }: Omit<Props, "view" | "professional">) {
  const base = new Date(`${dateISO}T12:00:00`);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstWeekday = new Date(year, month, 1, 12).getDay();
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  const selectedItems = items.filter((appointment) => appointment.dateISO === dateISO);
  const weekLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", borderBottom: 1, borderColor: "divider" }}>
        {weekLabels.map((label) => (
          <Box key={label} sx={{ p: 1, textAlign: "center", bgcolor: "action.hover" }}>
            <Typography variant="caption" sx={{ fontWeight: 900 }}>{label}</Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))" }}>
        {cells.map((day, index) => {
          if (!day) {
            return <Box key={`empty-${index}`} sx={{ minHeight: 126, borderRight: 1, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }} />;
          }
          const cellISO = iso(new Date(year, month, day, 12));
          const dayItems = items.filter((appointment) => appointment.dateISO === cellISO);
          const selected = cellISO === dateISO;
          return (
            <Box
              key={cellISO}
              onClick={() => onDateChange(cellISO)}
              onDoubleClick={() => onNew({ dateISO: cellISO })}
              sx={{
                minHeight: 126,
                p: 0.75,
                borderRight: 1,
                borderBottom: 1,
                borderColor: "divider",
                cursor: "pointer",
                bgcolor: selected ? "action.selected" : "background.paper",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Typography sx={{ fontWeight: selected ? 900 : 700, mb: 0.5 }}>{day}</Typography>
              <Box sx={{ display: "grid", gap: 0.5 }}>
                {dayItems.slice(0, 4).map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    compact
                    onClick={() => onAppointmentClick(appointment)}
                  />
                ))}
                {dayItems.length > 4 ? (
                  <Typography variant="caption" color="text.secondary">+ {dayItems.length - 4} agendamento(s)</Typography>
                ) : null}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 900, mb: 1 }}>
          {new Date(`${dateISO}T12:00:00`).toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </Typography>
        {selectedItems.length ? (
          <Box sx={{ display: "grid", gap: 1 }}>
            {selectedItems.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                onClick={() => onAppointmentClick(appointment)}
              />
            ))}
          </Box>
        ) : (
          <Typography
            color="text.secondary"
            onDoubleClick={() => onNew({ dateISO })}
            sx={{ py: 2, cursor: "pointer" }}
          >
            Nenhum agendamento. Duplo clique para agendar.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function TimeGridView({
  view,
  dateISO,
  items,
  professional,
  onAppointmentClick,
  onNew,
}: Omit<Props, "onDateChange">) {
  const dates = view === "day" ? [dateISO] : weekDates(dateISO);
  const hours = Array.from({ length: 15 }, (_, index) => 7 + index);
  const gridColumns = `68px repeat(${dates.length}, minmax(${view === "day" ? "620px" : "155px"},1fr))`;

  const handleEmptyClick = (event: MouseEvent<HTMLDivElement>, dayISO: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relative = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const rawMinutes = START_MINUTES + (relative / rect.height) * TOTAL_MINUTES;
    const snapped = Math.min(END_MINUTES - 15, Math.round(rawMinutes / 15) * 15);
    onNew({
      dateISO: dayISO,
      time: timeFromMinutes(snapped),
      ...(professional !== "Todos" ? { professionalName: professional } : {}),
    });
  };

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box sx={{ minWidth: view === "week" ? 1240 : 760 }}>
        <Box sx={{ display: "grid", gridTemplateColumns }}>
          <Box sx={{ borderRight: 1, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }} />
          {dates.map((day) => (
            <Box key={day} sx={{ p: 1, textAlign: "center", borderRight: 1, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
              <Typography variant="body2" sx={{ fontWeight: 900 }}>{shortDate(day)}</Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns }}>
          <Box sx={{ height: GRID_HEIGHT, position: "relative", borderRight: 1, borderColor: "divider" }}>
            {hours.map((hour) => {
              const top = ((hour * 60 - START_MINUTES) / TOTAL_MINUTES) * 100;
              return (
                <Typography
                  key={hour}
                  variant="caption"
                  color="text.secondary"
                  sx={{ position: "absolute", right: 8, top: `${top}%`, transform: "translateY(-50%)" }}
                >
                  {String(hour).padStart(2, "0")}:00
                </Typography>
              );
            })}
          </Box>

          {dates.map((day) => {
            const dayItems = items.filter((appointment) => appointment.dateISO === day);
            return (
              <Box
                key={day}
                onClick={(event) => handleEmptyClick(event, day)}
                sx={{
                  height: GRID_HEIGHT,
                  position: "relative",
                  borderRight: 1,
                  borderColor: "divider",
                  cursor: "crosshair",
                  bgcolor: "background.paper",
                }}
              >
                {Array.from({ length: 29 }, (_, index) => (
                  <Box
                    key={index}
                    sx={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: `${(index / 28) * 100}%`,
                      borderTop: 1,
                      borderColor: index % 2 === 0 ? "divider" : "action.disabledBackground",
                      pointerEvents: "none",
                    }}
                  />
                ))}

                {dayItems.map((appointment) => {
                  const start = minuteOfDay(appointment.time);
                  const duration = appointment.durationMinutes || 30;
                  const topMinutes = Math.max(0, Math.min(TOTAL_MINUTES, start - START_MINUTES));
                  const visibleDuration = Math.max(15, Math.min(duration, TOTAL_MINUTES - topMinutes));
                  const top = (topMinutes / TOTAL_MINUTES) * 100;
                  const height = Math.max(4, (visibleDuration / TOTAL_MINUTES) * 100);
                  return (
                    <Box
                      key={appointment.id}
                      sx={{
                        position: "absolute",
                        left: 4,
                        right: 4,
                        top: `${top}%`,
                        height: `${height}%`,
                        minHeight: 34,
                        zIndex: 2,
                      }}
                    >
                      <AppointmentCard
                        appointment={appointment}
                        compact={view === "week" || visibleDuration < 45}
                        onClick={() => onAppointmentClick(appointment)}
                      />
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

export default function AgendaCalendarBoard(props: Props) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
      {props.view === "month" ? (
        <MonthView
          dateISO={props.dateISO}
          items={props.items}
          onDateChange={props.onDateChange}
          onAppointmentClick={props.onAppointmentClick}
          onNew={props.onNew}
        />
      ) : (
        <TimeGridView
          view={props.view}
          dateISO={props.dateISO}
          items={props.items}
          professional={props.professional}
          onAppointmentClick={props.onAppointmentClick}
          onNew={props.onNew}
        />
      )}
    </Paper>
  );
}