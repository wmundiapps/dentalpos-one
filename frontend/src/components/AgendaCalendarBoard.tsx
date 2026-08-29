import type { MouseEvent } from "react";
import { Box, Chip, Paper, Typography } from "@mui/material";
import type { IntegratedAppointment } from "../types/operationsHub";
import type { AgendaBlock, BackendSchedule, RecurringBreak } from "../services/ScheduleApi";
import { patientFinancialSummary } from "../services/FinanceHubService";
import { clinicalDocuments } from "../services/ClinicalDocumentService";
import { getLaboratoryWorks } from "../services/OperationsHubService";
import { listPatients, listTreatmentItems } from "../services/PatientClinicalService";

type View = "day" | "week" | "month";
type BadgeTone = "success" | "error" | "warning" | "info" | "default";

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
  professionalId?: string;
  scheduleBlocks?: BackendSchedule[];
  agendaBlocks?: AgendaBlock[];
  recurringBreaks?: RecurringBreak[];
  onDateChange: (dateISO: string) => void;
  onDayOpen?: (dateISO: string) => void;
  onAppointmentClick: (appointment: IntegratedAppointment) => void;
  onNew: (prefill: AppointmentPrefill) => void;
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

function minuteOfDay(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(value: number) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, value));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function endTime(appointment: IntegratedAppointment) {
  return timeFromMinutes(minuteOfDay(appointment.time) + Math.max(10, appointment.durationMinutes || 30));
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

function operationalBadges(appointment: IntegratedAppointment): Array<{ label: string; color: BadgeTone }> {
  const result: Array<{ label: string; color: BadgeTone }> = [];
  const name = appointment.patientName.trim().toLowerCase();

  try {
    const finance = patientFinancialSummary(appointment.patientName);
    if (finance.overdue > 0) result.push({ label: `Financeiro atraso ${money(finance.overdue)}`, color: "error" });
    else if (finance.open > 0) result.push({ label: `Financeiro pendente ${money(finance.open)}`, color: "warning" });
    else result.push({ label: "Financeiro OK", color: "success" });
  } catch {
    result.push({ label: "Financeiro", color: "default" });
  }

  const unsigned = clinicalDocuments.find(
    (document) =>
      document.patientName.trim().toLowerCase() === name &&
      (document.status !== "Assinado" || !document.digitallySigned) &&
      ["Termo de consentimento", "Garantia"].includes(document.documentType),
  );
  if (unsigned) result.push({ label: `Assinar: ${unsigned.title}`, color: "warning" });

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

  try {
    const patient = listPatients().find((item) => item.fullName.trim().toLowerCase() === name);
    if (patient) {
      const supply = listTreatmentItems(patient.id).find((item) => {
        const text = `${item.procedure}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const pending = !["Concluído", "COMPLETED"].includes(String(item.status));
        return pending && /(enxerto|membrana|biomaterial|componente|material|parafuso)/.test(text);
      });
      if (supply) result.push({ label: `Providenciar: ${supply.procedure}`, color: "warning" });
    }
  } catch {
    // Sem alerta de material se o plano ainda não estiver disponível.
  }

  return result.slice(0, 4);
}

function statusColor(status: IntegratedAppointment["status"]): "success" | "error" | "warning" | "default" {
  if (status === "Confirmado" || status === "Finalizado") return "success";
  if (status === "Faltou" || status === "Cancelado") return "error";
  if (status === "Aguardando" || status === "Em atendimento" || status === "Sala em preparação") return "warning";
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
  const badges = operationalBadges(appointment);
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
        bgcolor: "background.paper",
        "&:hover": { boxShadow: 2 },
      }}
    >
      <Typography variant={compact ? "caption" : "body2"} sx={{ fontWeight: 900, lineHeight: 1.2 }}>
        {appointment.time}–{endTime(appointment)} • {appointment.patientName}
      </Typography>
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
  onAppointmentClick,
  onNew,
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
              onClick={() => onDateChange(cellISO)}
              onDoubleClick={() => onNew({ dateISO: cellISO })}
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
                  <AppointmentCard key={appointment.id} appointment={appointment} compact onClick={() => onAppointmentClick(appointment)} />
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
              <AppointmentCard key={appointment.id} appointment={appointment} onClick={() => onAppointmentClick(appointment)} />
            ))}
          </Box>
        ) : (
          <Typography color="text.secondary" sx={{ py: 1.5 }}>
            Nenhum agendamento. Dê dois cliques no dia para agendar.
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
  scheduleBlocks = [],
  agendaBlocks = [],
  recurringBreaks = [],
  onDayOpen,
  onAppointmentClick,
  onNew,
}: Omit<Props, "onDateChange">) {
  const dates = view === "day" ? [dateISO] : weekDates(dateISO);
  const hours = Array.from({ length: 15 }, (_, index) => 7 + index);
  const gridTemplateColumns = `68px repeat(${dates.length}, minmax(${view === "day" ? "620px" : "155px"}, 1fr))`;

  const handleEmptyClick = (event: MouseEvent<HTMLDivElement>, dayISO: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relative = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const rawMinutes = START_MINUTES + (relative / rect.height) * TOTAL_MINUTES;
    const dayOfWeek = new Date(`${dayISO}T12:00:00`).getDay();

    const doctorSchedules = professionalId
      ? scheduleBlocks
          .filter((item) => item.doctorId === professionalId && item.dayOfWeek === dayOfWeek)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
      : [];

    const workingPeriods = doctorSchedules.length
      ? doctorSchedules.map((item) => ({
          start: minuteOfDay(item.startTime),
          end: minuteOfDay(item.endTime),
          step: Math.max(10, item.slotDuration || 30),
        }))
      : [{ start: 8 * 60, end: 18 * 60, step: 30 }];

    const period = workingPeriods.find(
      (item) => rawMinutes >= item.start && rawMinutes < item.end,
    );
    if (!period) return;

    const offset = rawMinutes - period.start;
    const snapped = Math.min(
      period.end - period.step,
      period.start + Math.round(offset / period.step) * period.step,
    );
    if (snapped < period.start || snapped >= period.end) return;

    const slotEnd = Math.min(period.end, snapped + period.step);

    if (professionalId) {
      const fixedBreak = recurringBreaks.some((item) => {
        if (item.doctorId !== professionalId || item.dayOfWeek !== dayOfWeek) return false;
        const breakStart = minuteOfDay(item.startTime);
        const breakEnd = minuteOfDay(item.endTime);
        return breakStart < slotEnd && breakEnd > snapped;
      });
      if (fixedBreak) return;

      const startDate = new Date(`${dayISO}T${timeFromMinutes(snapped)}:00`);
      const endDate = new Date(startDate.getTime() + (slotEnd - snapped) * 60000);
      const eventualBlock = agendaBlocks.some((item) => {
        if (item.doctorId && item.doctorId !== professionalId) return false;
        const blockStart = new Date(item.startAt).getTime();
        const blockEnd = new Date(item.endAt).getTime();
        return blockStart < endDate.getTime() && blockEnd > startDate.getTime();
      });
      if (eventualBlock) return;
    }

    onNew({
      dateISO: dayISO,
      time: timeFromMinutes(snapped),
      professionalName: professional === "Todos" ? undefined : professional,
    });
  };

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box sx={{ minWidth: view === "week" ? 1160 : 760 }}>
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
                {String(hour).padStart(2, "0")}:00
              </Typography>
            ))}
          </Box>

          {dates.map((dayISO) => {
            const dayItems = items
              .filter((appointment) => appointment.dateISO === dayISO && appointment.status !== "Cancelado")
              .sort((a, b) => a.time.localeCompare(b.time));
            return (
              <Box
                key={dayISO}
                onClick={(event) => handleEmptyClick(event, dayISO)}
                sx={{
                  position: "relative",
                  height: GRID_HEIGHT,
                  borderRight: 1,
                  borderColor: "divider",
                  cursor: "crosshair",
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 29px, rgba(0,0,0,.08) 30px)",
                }}
              >
                {dayItems.map((appointment) => {
                  const start = minuteOfDay(appointment.time);
                  const duration = Math.max(10, appointment.durationMinutes || 30);
                  if (start >= END_MINUTES || start + duration <= START_MINUTES) return null;
                  const visibleStart = Math.max(START_MINUTES, start);
                  const visibleEnd = Math.min(END_MINUTES, start + duration);
                  const top = ((visibleStart - START_MINUTES) / TOTAL_MINUTES) * GRID_HEIGHT;
                  const height = Math.max(28, ((visibleEnd - visibleStart) / TOTAL_MINUTES) * GRID_HEIGHT);
                  const badges = operationalBadges(appointment);
                  return (
                    <Box
                      key={appointment.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        onAppointmentClick(appointment);
                      }}
                      sx={{
                        position: "absolute",
                        top,
                        left: 4,
                        right: 4,
                        height,
                        p: 0.7,
                        border: 1,
                        borderColor: "primary.light",
                        borderRadius: 1.5,
                        bgcolor: "background.paper",
                        boxShadow: 1,
                        overflow: "hidden",
                        cursor: "pointer",
                        zIndex: 2,
                        "&:hover": { boxShadow: 3 },
                      }}
                    >
                      <Typography variant="caption" sx={{ display: "block", fontWeight: 900, lineHeight: 1.15 }}>
                        {appointment.time}–{endTime(appointment)} • {appointment.patientName}
                      </Typography>
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
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", p: 1 }}>
        Clique diretamente em uma linha livre para abrir o agendamento. A linha respeita a jornada, a grade configurada, intervalos fixos e bloqueios.
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
        onAppointmentClick={props.onAppointmentClick}
        onNew={props.onNew}
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
      scheduleBlocks={props.scheduleBlocks}
      agendaBlocks={props.agendaBlocks}
      recurringBreaks={props.recurringBreaks}
      onDayOpen={props.onDayOpen}
      onAppointmentClick={props.onAppointmentClick}
      onNew={props.onNew}
    />
  );
}
