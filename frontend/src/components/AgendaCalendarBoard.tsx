import { MarkerDots } from "../contexts/AgendaMarkers";
import { Box, Chip, Paper, Typography, useMediaQuery } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import type { IntegratedAppointment } from "../types/operationsHub";
import type { AgendaBlock, BackendSchedule, RecurringBreak } from "../services/ScheduleApi";
import { getLaboratoryWorks } from "../services/OperationsHubService";

type View = "day" | "week" | "month";
type BadgeTone = "success" | "error" | "warning" | "info" | "default";

type AppointmentPrefill = {
  dateISO: string;
  time?: string;
  professionalName?: string;
  durationMinutes?: number;
};

interface Props {
  view: View;
  dateISO: string;
  items: IntegratedAppointment[];
  professional: string;
  professionalId?: string;
  professionalNames?: string[];
  scheduleBlocks?: BackendSchedule[];
  agendaBlocks?: AgendaBlock[];
  recurringBreaks?: RecurringBreak[];
  onDateChange: (dateISO: string) => void;
  onDayOpen?: (dateISO: string) => void;
  onAppointmentClick: (appointment: IntegratedAppointment) => void;
  onNew: (prefill: AppointmentPrefill) => void;
  materialAlerts?: Map<string, string>;
  financialAlerts?: Map<string, { open: number; overdue: number }>;
}
const START_MINUTES = 7 * 60;
const END_MINUTES = 21 * 60;
const TOTAL_MINUTES = END_MINUTES - START_MINUTES;
const GRID_HEIGHT = 840;

function iso(date: Date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

const PROFESSIONAL_COLORS = ["#1976d2", "#2e7d32", "#ed6c02", "#9c27b0", "#d32f2f", "#00838f", "#6d4c41", "#c2185b", "#5e35b1", "#827717"];
// Cada dentista tem sempre a mesma cor: a posição dele na lista em ordem alfabética.
function professionalColorMap(names: string[]) {
  const sorted = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const map = new Map<string, string>();
  sorted.forEach((name, index) => map.set(name, PROFESSIONAL_COLORS[index % PROFESSIONAL_COLORS.length]));
  return map;
}

function minuteOfDay(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Atendimentos que se sobrepõem no mesmo dia ficam lado a lado (encaixe: até 2 por horário).
function computeLanes(list: IntegratedAppointment[]) {
  const lanes = new Map<string | number, { lane: number; count: number }>();
  const sorted = list
    .map((a) => ({ id: a.id as string | number, start: minuteOfDay(a.time), end: minuteOfDay(a.time) + Math.max(10, a.durationMinutes || 30) }))
    .sort((x, y) => x.start - y.start || x.end - y.end);
  let cluster: typeof sorted = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((e) => e <= it.start);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(it.end); } else laneEnds[lane] = it.end;
      lanes.set(it.id, { lane, count: 0 });
    }
    for (const it of cluster) lanes.get(it.id)!.count = laneEnds.length;
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return lanes;
}

function timeFromMinutes(value: number) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, value));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function endTime(appointment: IntegratedAppointment) {
  return timeFromMinutes(minuteOfDay(appointment.time) + Math.max(10, appointment.durationMinutes || 30) - 1);
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

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function operationalBadges(
  appointment: IntegratedAppointment,
  materialAlerts?: Map<string, string>,
  financialAlerts?: Map<string, { open: number; overdue: number }>,
): Array<{ label: string; color: BadgeTone }> {
  const result: Array<{ label: string; color: BadgeTone }> = [];
  const name = appointment.patientName.trim().toLowerCase();

  const finance = financialAlerts?.get(name);
  if (finance && finance.overdue > 0) result.push({ label: `Financeiro atraso ${money(finance.overdue)}`, color: "error" });
  else if (finance && finance.open > 0) result.push({ label: `Financeiro pendente ${money(finance.open)}`, color: "warning" });
  else result.push({ label: "Financeiro OK", color: "success" });

  try {
    const lab = getLaboratoryWorks().find(
      (work) =>
        work.patientName.trim().toLowerCase() === name &&
        !["Entregue", "Liberado"].includes(work.status),
    );
    if (lab) result.push({ label: `Laboratório: ${lab.status}`, color: "info" });
  } catch {
    // Sem alerta de laboratório se a base ainda não estiver disponível.
  }

  const materialProcedure = materialAlerts?.get(name);
  if (materialProcedure) {
    result.push({ label: `Providenciar: ${materialProcedure}`, color: "warning" });
  }

  return result.slice(0, 4);
}

function statusColor(status: IntegratedAppointment["status"]): "success" | "error" | "warning" | "default" {
  if (status === "Confirmado" || status === "Finalizado") return "success";
  if (status === "Faltou" || status === "Cancelado" || status === "Desmarcado") return "error";
  if (status === "Aguardando" || status === "Em atendimento" || status === "Sala em preparação") return "warning";
  return "default";
}

const HOUR_GUTTER = 44;

function AppointmentCard({
  appointment,
  compact = false,
  onClick,
  materialAlerts,
  financialAlerts,
}: {
  appointment: IntegratedAppointment;
  compact?: boolean;
  onClick: () => void;
  materialAlerts?: Map<string, string>;
  financialAlerts?: Map<string, { open: number; overdue: number }>;
}) {
  const badges = operationalBadges(appointment, materialAlerts, financialAlerts);
  return (
    <Paper
      variant="outlined"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      sx={{
        p: compact ? 0.6 : 1,
        borderRadius: 1.5,
        cursor: "pointer",
        overflow: "hidden",
        bgcolor: appointment.status === "Desmarcado" ? "action.disabledBackground" : "background.paper",
        opacity: appointment.status === "Desmarcado" ? 0.8 : 1,
        "&:hover": { boxShadow: 2 },
      }}
    >
      <Typography variant={compact ? "caption" : "body2"} sx={{ fontWeight: 900, lineHeight: 1.2, ...(appointment.status === "Desmarcado" ? { color: "text.disabled", textDecoration: "line-through" } : {}) }}>
        {appointment.time}–{endTime(appointment)} • {appointment.patientName}<MarkerDots backendId={appointment.backendId} />
      </Typography>
      {appointment.status === "Desmarcado" ? <Typography variant="caption" sx={{ display: "block", fontWeight: 800, color: "text.secondary" }}>Desmarcou</Typography> : null}
      {!compact ? (
        <>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", my: 0.6 }}>
            {badges.map((badge) => (
              <Chip key={badge.label} size="small" label={badge.label} color={badge.color} />
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {appointment.procedure}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {appointment.professionalName} • {appointment.room}
          </Typography>
          <Chip size="small" sx={{ mt: 0.6 }} label={appointment.status} color={statusColor(appointment.status)} />
        </>
      ) : null}
    </Paper>
  );
}

function MonthView({
  dateISO,
  items,
  onDateChange,
  onDayOpen,
  onAppointmentClick,
  materialAlerts,
  financialAlerts,
}: Omit<Props, "view" | "professional">) {
  const base = new Date(`${dateISO}T12:00:00`);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstWeekday = new Date(year, month, 1, 12).getDay();
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const rows = Math.ceil((firstWeekday + daysInMonth) / 7);
  const cells = Array.from({ length: rows * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  const selectedItems = items
    .filter((appointment) => appointment.dateISO === dateISO && appointment.status !== "Cancelado")
    .sort((a, b) => a.time.localeCompare(b.time));
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
            return <Box key={`empty-${index}`} sx={{ minHeight: 118, borderRight: 1, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }} />;
          }
          const cellISO = iso(new Date(year, month, day, 12));
          const dayItems = items
            .filter((appointment) => appointment.dateISO === cellISO && appointment.status !== "Cancelado")
            .sort((a, b) => a.time.localeCompare(b.time));
          const selected = cellISO === dateISO;
          return (
            <Box
              key={cellISO}
              role="button"
              tabIndex={0}
              onClick={() => (onDayOpen ? onDayOpen(cellISO) : onDateChange(cellISO))}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                if (onDayOpen) onDayOpen(cellISO);
                else onDateChange(cellISO);
              }}
              sx={{
                minHeight: 118,
                p: 0.7,
                borderRight: 1,
                borderBottom: 1,
                borderColor: "divider",
                cursor: "pointer",
                bgcolor: selected ? "action.selected" : "background.paper",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Typography sx={{ fontWeight: selected ? 900 : 700, mb: 0.5 }}>{day}</Typography>
              <Box sx={{ display: "grid", gap: 0.45 }}>
                {dayItems.slice(0, 3).map((appointment) => (
                  <AppointmentCard key={appointment.id} appointment={appointment} compact onClick={() => onAppointmentClick(appointment)} materialAlerts={materialAlerts} financialAlerts={financialAlerts} />
                ))}
                {dayItems.length > 3 ? (
                  <Typography variant="caption" color="text.secondary">+ {dayItems.length - 3} consulta(s)</Typography>
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
              <AppointmentCard key={appointment.id} appointment={appointment} onClick={() => onAppointmentClick(appointment)} materialAlerts={materialAlerts} financialAlerts={financialAlerts} />
            ))}
          </Box>
        ) : (
          <Typography color="text.secondary" sx={{ py: 1.5 }}>
            Nenhum agendamento. Clique no dia para abrir a agenda diária.
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
  professionalId,
  professionalNames = [],
  scheduleBlocks = [],
  agendaBlocks = [],
  recurringBreaks = [],
  onDayOpen,
  onAppointmentClick,
  onNew,
  materialAlerts,
  financialAlerts,
}: Omit<Props, "onDateChange">) {
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down("md"));
  const colors = professionalColorMap([...professionalNames, ...items.map((item) => item.professionalName)]);
  const colorOf = (name: string) => colors.get(name.trim()) || "#1976d2";
  const weekAll = view === "day" ? [dateISO] : weekDates(dateISO);
  // No celular o domingo é sobreposto ao sábado, para os outros dias ganharem largura.
  const mergeSunday = view === "week" && isMobile;
  const dates = mergeSunday ? weekAll.slice(0, 6) : weekAll;
  const sundayISO = mergeSunday ? weekAll[6] : "";
  const hours = Array.from({ length: 15 }, (_, index) => 7 + index);
  const gridTemplateColumns = `${HOUR_GUTTER}px repeat(${dates.length}, minmax(${view === "day" ? "620px" : mergeSunday ? "168px" : "155px"}, 1fr))`;

  const slotRows = (dayISO: string, dayItems: IntegratedAppointment[]) => {
    const dayOfWeek = new Date(`${dayISO}T12:00:00`).getDay();

    const doctorSchedules = professionalId
      ? scheduleBlocks
          .filter((item) => item.doctorId === professionalId && item.dayOfWeek === dayOfWeek)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
      : [];

    const periods = doctorSchedules.length
      ? doctorSchedules.map((item) => ({
          start: minuteOfDay(item.startTime),
          end: minuteOfDay(item.endTime),
          step: Math.max(10, item.slotDuration || 30),
        }))
      : [{ start: 8 * 60, end: 18 * 60, step: 30 }];

    const rows: Array<{ start: number; end: number; step: number }> = [];

    for (const period of periods) {
      for (let cursor = period.start; cursor + period.step <= period.end; cursor += period.step) {
        const slotEnd = cursor + period.step;
        if (cursor < START_MINUTES || slotEnd > END_MINUTES) continue;

        const fixedBreak = recurringBreaks.some((item) => {
          if (item.dayOfWeek !== dayOfWeek) return false;
          if (professionalId && item.doctorId !== professionalId) return false;
          const breakStart = minuteOfDay(item.startTime);
          const breakEnd = minuteOfDay(item.endTime);
          return breakStart < slotEnd && breakEnd > cursor;
        });
        if (fixedBreak) continue;

        const startDate = new Date(`${dayISO}T${timeFromMinutes(cursor)}:00`);
        const endDate = new Date(startDate.getTime() + period.step * 60000);
        const eventualBlock = agendaBlocks.some((item) => {
          if (item.doctorId) {
            if (!professionalId || item.doctorId !== professionalId) return false;
          }
          const blockStart = new Date(item.startAt).getTime();
          const blockEnd = new Date(item.endAt).getTime();
          return blockStart < endDate.getTime() && blockEnd > startDate.getTime();
        });
        if (eventualBlock) continue;

        // Com um profissional selecionado cabem 2 atendimentos por horário (encaixe); em "Todos" segue 1.
        const overlapping = dayItems.filter((appointment) => {
          const appointmentStart = minuteOfDay(appointment.time);
          const appointmentEnd =
            appointmentStart + Math.max(10, appointment.durationMinutes || 30);
          return appointmentStart < slotEnd && appointmentEnd > cursor;
        }).length;
        if (overlapping >= (professionalId ? 2 : 1)) continue;

        rows.push({ start: cursor, end: slotEnd, step: period.step });
      }
    }

    return rows;
  };

  const breakRows = (dayISO: string) => {
    if (!professionalId) return [];
    const dayOfWeek = new Date(`${dayISO}T12:00:00`).getDay();

    return recurringBreaks
      .filter(
        (item) =>
          item.doctorId === professionalId &&
          item.dayOfWeek === dayOfWeek,
      )
      .map((item) => ({
        ...item,
        start: Math.max(START_MINUTES, minuteOfDay(item.startTime)),
        end: Math.min(END_MINUTES, minuteOfDay(item.endTime)),
      }))
      .filter((item) => item.end > item.start);
  };

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box sx={{ minWidth: view === "week" ? (mergeSunday ? HOUR_GUTTER + 6 * 168 : 1160) : 760 }}>
        <Box sx={{ display: "grid", gridTemplateColumns }}>
          <Box sx={{ borderRight: 1, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }} />
          {dates.map((dayISO) => (
            <Box
              key={dayISO}
              role={view === "week" ? "button" : undefined}
              tabIndex={view === "week" ? 0 : undefined}
              onClick={() => view === "week" && onDayOpen?.(dayISO)}
              onKeyDown={(event) => {
                if (view !== "week") return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onDayOpen?.(dayISO);
                }
              }}
              sx={{
                p: 1,
                textAlign: "center",
                borderRight: 1,
                borderBottom: 1,
                borderColor: "divider",
                bgcolor: "action.hover",
                cursor: view === "week" ? "pointer" : "default",
                transition: "background-color .15s ease",
                "&:hover": view === "week" ? { bgcolor: "action.selected" } : undefined,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 900 }}>
                {shortDate(dayISO)}
              </Typography>
              {mergeSunday && dayISO === weekAll[5] ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10 }}>
                  + {shortDate(sundayISO)} (tracejado)
                </Typography>
              ) : null}
              {view === "week" ? (
                <Typography variant="caption" color="primary.main" sx={{ display: "block", fontSize: 10 }}>
                  Clique para abrir o dia
                </Typography>
              ) : null}
            </Box>
          ))}
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns }}>
          <Box sx={{ position: "relative", height: GRID_HEIGHT, borderRight: 1, borderColor: "divider" }}>
            {hours.map((hour) => (
              <Typography
                key={hour}
                variant="caption"
                color="text.secondary"
                sx={{
                  position: "absolute",
                  top: `${((hour * 60 - START_MINUTES) / TOTAL_MINUTES) * 100}%`,
                  right: 8,
                  transform: "translateY(-50%)",
                }}
              >
                {hour}
              </Typography>
            ))}
          </Box>

          {dates.map((dayISO) => {
            // Desmarcados continuam visíveis (em cinza), mas não ocupam o horário: slots e capacidade usam só os ativos.
            const shownItems = items
              .filter((appointment) => appointment.dateISO === dayISO && appointment.status !== "Cancelado")
              .sort((a, b) => a.time.localeCompare(b.time));
            const dayItems = shownItems.filter((appointment) => appointment.status !== "Desmarcado");
            // A primeira coluna já fica junto da margem com as horas; nas demais a hora aparece ao lado do nome.
            const isFirstDay = dayISO === dates[0];
            const gutter = isFirstDay ? 4 : HOUR_GUTTER;
            const lanes = computeLanes(shownItems);
            return (
              <Box
                key={dayISO}
                sx={{
                  position: "relative",
                  height: GRID_HEIGHT,
                  borderRight: 1,
                  borderColor: "divider",
                  cursor: "default",
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 29px, rgba(0,0,0,.08) 30px)",
                }}
              >
                {!isFirstDay && hours.map((hour) => (
                  <Typography
                    key={`h-${dayISO}-${hour}`}
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      position: "absolute",
                      top: `${((hour * 60 - START_MINUTES) / TOTAL_MINUTES) * 100}%`,
                      left: 4,
                      width: HOUR_GUTTER - 6,
                      zIndex: 2,
                      fontWeight: 700,
                      fontSize: 11,
                      lineHeight: 1,
                      pointerEvents: "none",
                      transform: "translateY(-50%)",
                    }}
                  >
                    {hour}
                  </Typography>
                ))}

                {slotRows(dayISO, dayItems).map((slot) => {
                  const top = ((slot.start - START_MINUTES) / TOTAL_MINUTES) * GRID_HEIGHT;
                  const height = ((slot.end - slot.start) / TOTAL_MINUTES) * GRID_HEIGHT;
                  const startLabel = timeFromMinutes(slot.start);
                  const endLabel = timeFromMinutes(slot.end - 1);
                  return (
                    <Box
                      key={`free-${dayISO}-${slot.start}`}
                      role="button"
                      tabIndex={0}
                      title={`Novo agendamento • ${startLabel}–${endLabel}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onNew({
                          dateISO: dayISO,
                          time: startLabel,
                          durationMinutes: slot.step,
                          professionalName: professional === "Todos" ? undefined : professional,
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        onNew({
                          dateISO: dayISO,
                          time: startLabel,
                          durationMinutes: slot.step,
                          professionalName: professional === "Todos" ? undefined : professional,
                        });
                      }}
                      sx={{
                        position: "absolute",
                        top,
                        left: 0,
                        right: 0,
                        height,
                        zIndex: 1,
                        cursor: "pointer",
                        borderBottom: 1,
                        borderColor: "divider",
                        "&:hover": {
                          bgcolor: "action.hover",
                          outline: "1px solid",
                          outlineColor: "primary.light",
                          outlineOffset: "-1px",
                        },
                      }}
                    />
                  );
                })}

                {breakRows(dayISO).map((item) => {
                  const top = ((item.start - START_MINUTES) / TOTAL_MINUTES) * GRID_HEIGHT;
                  const height = Math.max(
                    30,
                    ((item.end - item.start) / TOTAL_MINUTES) * GRID_HEIGHT,
                  );
                  return (
                    <Box
                      key={`break-${dayISO}-${item.id}`}
                      title={`${item.reason} • ${item.startTime}–${item.endTime}`}
                      sx={{
                        position: "absolute",
                        top,
                        left: 2,
                        right: 2,
                        height,
                        zIndex: 3,
                        px: 1,
                        py: 0.5,
                        border: 1,
                        borderColor: "warning.main",
                        borderRadius: 1.25,
                        bgcolor: "action.disabledBackground",
                        cursor: "not-allowed",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 900,
                          lineHeight: 1.15,
                          textTransform: "uppercase",
                        }}
                      >
                        {item.reason} • {item.startTime}–{item.endTime}
                      </Typography>
                    </Box>
                  );
                })}

                {[
                  ...shownItems.map((appointment) => ({ appointment, sunday: false })),
                  ...(mergeSunday && dayISO === weekAll[5]
                    ? items
                        .filter((appointment) => appointment.dateISO === sundayISO && appointment.status !== "Cancelado")
                        .map((appointment) => ({ appointment, sunday: true }))
                    : []),
                ].map(({ appointment, sunday }) => {
                  const start = minuteOfDay(appointment.time);
                  const duration = Math.max(10, appointment.durationMinutes || 30);
                  if (start >= END_MINUTES || start + duration <= START_MINUTES) return null;
                  const visibleStart = Math.max(START_MINUTES, start);
                  const visibleEnd = Math.min(END_MINUTES, start + duration);
                  const top = ((visibleStart - START_MINUTES) / TOTAL_MINUTES) * GRID_HEIGHT;
                  const height = Math.max(28, ((visibleEnd - visibleStart) / TOTAL_MINUTES) * GRID_HEIGHT);
                  const badges = operationalBadges(appointment, materialAlerts, financialAlerts);
                  return (
                    <Box
                      key={`${sunday ? "dom-" : ""}${appointment.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onAppointmentClick(appointment);
                      }}
                      sx={{
                        position: "absolute",
                        top,
                        ...(sunday || !lanes.get(appointment.id) || lanes.get(appointment.id)!.count < 2
                          ? appointment.status === "Desmarcado" && !sunday
                            // Sozinho no horário: ocupa só parte da largura para o horário continuar livre para novo agendamento.
                            ? { left: gutter, width: `calc((100% - ${gutter + 4}px) * 0.58)` }
                            : { left: sunday ? gutter + 14 : gutter, right: sunday ? 0 : 4 }
                          : {
                              left: `calc(${gutter}px + (100% - ${gutter + 4}px) * ${lanes.get(appointment.id)!.lane} / ${lanes.get(appointment.id)!.count})`,
                              width: `calc((100% - ${gutter + 4}px) / ${lanes.get(appointment.id)!.count} - 2px)`,
                            }),
                        height,
                        p: 0.7,
                        border: sunday ? "1px dashed" : 1,
                        borderColor: appointment.status === "Desmarcado" ? "#9e9e9e" : colorOf(appointment.professionalName),
                        borderLeft: `6px solid ${appointment.status === "Desmarcado" ? "#9e9e9e" : colorOf(appointment.professionalName)}`,
                        borderStyle: appointment.status === "Desmarcado" ? "dashed" : undefined,
                        borderRadius: 1.5,
                        bgcolor: appointment.status === "Desmarcado" ? "action.disabledBackground" : `${colorOf(appointment.professionalName)}1f`,
                        opacity: appointment.status === "Desmarcado" ? 0.85 : 1,
                        boxShadow: 1,
                        overflow: "hidden",
                        cursor: "pointer",
                        zIndex: sunday ? 3 : 2,
                        "&:hover": { boxShadow: 3 },
                      }}
                    >
                      <Typography variant="caption" sx={{ display: "block", fontWeight: 900, lineHeight: 1.15, ...(appointment.status === "Desmarcado" ? { color: "text.disabled", textDecoration: "line-through" } : {}) }}>
                        {sunday ? "Dom · " : ""}{appointment.patientName}<MarkerDots backendId={appointment.backendId} />
                      </Typography>
                      {appointment.status === "Desmarcado" ? (
                        <Typography variant="caption" sx={{ display: "block", fontWeight: 800, lineHeight: 1.15, color: "text.secondary" }}>Desmarcou</Typography>
                      ) : null}
                      {height >= 48 && badges[0] ? (
                        <Chip size="small" label={badges[0].label} color={badges[0].color} sx={{ mt: 0.4, maxWidth: "100%" }} />
                      ) : null}
                      {height >= 72 ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.15, mt: 0.3 }}>
                          {appointment.procedure}
                        </Typography>
                      ) : null}
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.2, px: 1, pt: 1 }}>
        {Array.from(new Set(items.map((item) => item.professionalName.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")).map((name) => (
          <Box key={`cor-${name}`} sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: colorOf(name) }} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>{name}</Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", p: 1 }}>
        Toda a faixa livre é clicável na Semana e no Dia. Intervalos fixos aparecem bloqueados na grade com o motivo e horário. Em "Todos", selecione um profissional para visualizar os intervalos dele.
      </Typography>
    </Box>
  );
}

export default function AgendaCalendarBoard(props: Props) {
  if (props.view === "month") {
    return (
      <MonthView
        dateISO={props.dateISO}
        items={props.items}
        onDateChange={props.onDateChange}
        onDayOpen={props.onDayOpen}
        onAppointmentClick={props.onAppointmentClick}
        onNew={props.onNew}
        materialAlerts={props.materialAlerts}
        financialAlerts={props.financialAlerts}
      />
    );
  }

  return (
    <TimeGridView
      view={props.view}
      dateISO={props.dateISO}
      items={props.items}
      professional={props.professional}
      professionalId={props.professionalId}
      professionalNames={props.professionalNames}
      scheduleBlocks={props.scheduleBlocks}
      agendaBlocks={props.agendaBlocks}
      recurringBreaks={props.recurringBreaks}
      onDayOpen={props.onDayOpen}
      onAppointmentClick={props.onAppointmentClick}
      onNew={props.onNew}
      materialAlerts={props.materialAlerts}
      financialAlerts={props.financialAlerts}
    />
  );
}
