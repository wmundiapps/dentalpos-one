import { MarkerDots } from "../contexts/AgendaMarkers";
import { useEffect, useRef, useState } from "react";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import { Box, Chip, Paper, Tooltip, Typography, useMediaQuery } from "@mui/material";
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
  // Arrastar a borda de baixo do agendamento muda a duração (como no Clinicorp). Deve lançar erro se não puder salvar.
  onResize?: (appointment: IntegratedAppointment, durationMinutes: number) => Promise<void> | void;
  // Arrastar o agendamento para outro dia/horário (pede o motivo e confirma na tela de quem usa).
  onMove?: (appointment: IntegratedAppointment, dateISO: string, time: string) => void;
  // Altura máxima da área rolável (o cabeçalho dos dias fica fixo no topo enquanto a grade rola).
  maxHeight?: string | number;
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

// Balão ao passar o mouse (como no Clinicorp): nome completo, horário de início e fim e procedimento, mesmo quando o card é pequeno.
function appointmentTip(appointment: IntegratedAppointment) {
  const start = minuteOfDay(appointment.time);
  const end = timeFromMinutes(start + Math.max(10, appointment.durationMinutes || 30));
  return (
    <Box sx={{ py: 0.2 }}>
      <Typography sx={{ fontWeight: 900, fontSize: 13, lineHeight: 1.25 }}>{appointment.patientName}</Typography>
      <Typography sx={{ fontSize: 12, lineHeight: 1.25 }}>{appointment.time} - {end}</Typography>
      {appointment.procedure ? <Typography sx={{ fontSize: 12, lineHeight: 1.25, opacity: 0.9 }}>{appointment.procedure}</Typography> : null}
    </Box>
  );
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
    <Tooltip title={appointmentTip(appointment)} arrow enterDelay={150} placement="top">
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
    </Tooltip>
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
  onResize,
  onMove,
  maxHeight,
  materialAlerts,
  financialAlerts,
}: Omit<Props, "onDateChange">) {
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down("md"));
  // Redimensionando: duração provisória enquanto o dedo/mouse arrasta a borda de baixo.
  const [resizing, setResizing] = useState<{ id: string | number; duration: number } | null>(null);
  const drag = useRef<{ id: string | number; grabY: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ dayISO: string; top: number; label: string } | null>(null);
  // Linha vermelha do horário de agora: desce sozinha com o passar do tempo.
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);
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

  // Dia fechado para todos os profissionais (feriado ou bloqueio de agenda inteira): mostra faixa com o motivo.
  const closedDay = (dayISO: string) => {
    const start = new Date(`${dayISO}T00:00:00`).getTime();
    const end = start + 86400000 - 60000;
    return agendaBlocks.find((item) => !item.doctorId && new Date(item.startAt).getTime() <= start + 60000 && new Date(item.endAt).getTime() >= end) || null;
  };

  const breakRows = (dayISO: string) => {
    const dayOfWeek = new Date(`${dayISO}T12:00:00`).getDay();
    // Com "Todos" os profissionais, mostra o almoço (e demais intervalos) uma vez por horário, mesmo que valha para vários.
    const wanted = professionalId
      ? recurringBreaks.filter((item) => item.doctorId === professionalId && item.dayOfWeek === dayOfWeek)
      : Array.from(
          new Map(
            recurringBreaks
              .filter((item) => item.dayOfWeek === dayOfWeek)
              .map((item) => [`${item.startTime}-${item.endTime}-${item.reason}`, item] as const),
          ).values(),
        );

    return wanted
      .map((item) => ({
        ...item,
        start: Math.max(START_MINUTES, minuteOfDay(item.startTime)),
        end: Math.min(END_MINUTES, minuteOfDay(item.endTime)),
      }))
      .filter((item) => item.end > item.start);
  };

  // Almoço (intervalo longo recorrente) ocupa pouco espaço na grade, desde que não haja agendamento dentro dele.
  const SQUEEZE = 0.3;
  const lunchWin = (() => {
    const wins = recurringBreaks.map((b) => ({ s: Math.max(START_MINUTES, minuteOfDay(b.startTime)), e: Math.min(END_MINUTES, minuteOfDay(b.endTime)) })).filter((w) => w.e - w.s >= 60).sort((a, b) => b.e - b.s - (a.e - a.s));
    const w = wins[0];
    if (!w) return null;
    const busy = items.some((a) => dates.includes(a.dateISO) && a.status !== "Cancelado" && minuteOfDay(a.time) < w.e && minuteOfDay(a.time) + Math.max(10, a.durationMinutes || 30) > w.s);
    return busy ? null : w;
  })();
  const Y = (m: number) => {
    const p = GRID_HEIGHT / TOTAL_MINUTES;
    if (!lunchWin || m <= lunchWin.s) return (m - START_MINUTES) * p;
    if (m >= lunchWin.e) return ((lunchWin.s - START_MINUTES) + (lunchWin.e - lunchWin.s) * SQUEEZE + (m - lunchWin.e)) * p;
    return ((lunchWin.s - START_MINUTES) + (m - lunchWin.s) * SQUEEZE) * p;
  };
  const gridH = Y(END_MINUTES);
  const invY = (y: number) => {
    const p = GRID_HEIGHT / TOTAL_MINUTES;
    let m = START_MINUTES + y / p;
    if (lunchWin) {
      const sq = (lunchWin.e - lunchWin.s) * SQUEEZE;
      const yS = (lunchWin.s - START_MINUTES) * p;
      if (y > yS + sq * p) m = lunchWin.e + (y - yS - sq * p) / p;
      else if (y > yS) m = lunchWin.s + (y - yS) / (p * SQUEEZE);
    }
    return m;
  };
  const dropMinute = (event: { clientY: number; currentTarget: HTMLElement }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const raw = invY(event.clientY - rect.top - (drag.current?.grabY ?? 0));
    return Math.min(END_MINUTES - 15, Math.max(START_MINUTES, Math.round(raw / 15) * 15));
  };

  return (
    <Box sx={{ overflow: "auto", maxHeight: maxHeight ?? "calc(100vh - 230px)" }}>
      <Box sx={{ minWidth: view === "week" ? (mergeSunday ? HOUR_GUTTER + 6 * 168 : 1160) : 760 }}>
        <Box sx={{ display: "grid", gridTemplateColumns, position: "sticky", top: 0, zIndex: 8, bgcolor: "background.paper", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
          <Box sx={{ borderBottom: "1px solid #e8edf2" }} />
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
                py: 1,
                px: 0.5,
                textAlign: "center",
                borderLeft: "1px solid #eef1f5",
                borderBottom: "1px solid #e8edf2",
                bgcolor: "background.paper",
                cursor: view === "week" ? "pointer" : "default",
                transition: "background-color .15s ease",
                "&:hover": view === "week" ? { bgcolor: "#f4f8fc" } : undefined,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 13, color: "text.primary", textTransform: "capitalize" }}>
                {shortDate(dayISO)}
              </Typography>
              <Typography variant="caption" sx={{ display: "block", fontSize: 11, color: "text.secondary" }}>
                Pacientes: {items.filter((a) => a.dateISO === dayISO && a.status !== "Cancelado" && a.status !== "Desmarcado").length}
              </Typography>
              {mergeSunday && dayISO === weekAll[5] ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10 }}>
                  + {shortDate(sundayISO)} (tracejado)
                </Typography>
              ) : null}
              {closedDay(dayISO) ? (
                <Typography variant="caption" sx={{ display: "block", fontSize: 10, fontWeight: 900, color: "warning.dark" }}>
                  {closedDay(dayISO)!.reason}
                </Typography>
              ) : null}
            </Box>
          ))}
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns, position: "relative" }}>
          {(() => {
            const nowISO = `${nowTick.getFullYear()}-${String(nowTick.getMonth() + 1).padStart(2, "0")}-${String(nowTick.getDate()).padStart(2, "0")}`;
            const nowMinutes = nowTick.getHours() * 60 + nowTick.getMinutes();
            if (!dates.includes(nowISO) || nowMinutes < START_MINUTES || nowMinutes >= END_MINUTES) return null;
            const top = Y(nowMinutes);
            return (
              <Box aria-label={`Agora: ${timeFromMinutes(nowMinutes)}`} title={`Agora: ${timeFromMinutes(nowMinutes)}`} sx={{ position: "absolute", left: 0, right: 0, top, height: 0, borderTop: "2px solid #e53935", zIndex: 6, pointerEvents: "none" }}>
                <Box sx={{ position: "absolute", left: HOUR_GUTTER - 6, top: -6, width: 10, height: 10, borderRadius: "50%", bgcolor: "#e53935" }} />
              </Box>
            );
          })()}
          <Box sx={{ position: "relative", height: gridH, borderRight: 1, borderColor: "divider" }}>
            {hours.filter((hour) => !(lunchWin && hour * 60 > lunchWin.s && hour * 60 < lunchWin.e)).map((hour) => (
              <Typography
                key={hour}
                variant="caption"
                color="text.secondary"
                sx={{
                  position: "absolute",
                  top: `${Y(hour * 60)}px`,
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
                onDragOver={(event) => { if (!drag.current || !onMove) return; event.preventDefault(); const m = dropMinute(event); setDragOver((cur) => (cur && cur.dayISO === dayISO && cur.label === timeFromMinutes(m) ? cur : { dayISO, top: Y(m), label: timeFromMinutes(m) })); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null); }}
                onDrop={(event) => {
                  const d = drag.current; drag.current = null; setDragOver(null);
                  if (!d || !onMove) return;
                  event.preventDefault();
                  const target = items.find((a) => a.id === d.id);
                  if (target) onMove(target, dayISO, timeFromMinutes(dropMinute(event)));
                }}
                sx={{
                  position: "relative",
                  height: gridH,
                  borderLeft: "1px solid #eef1f5",
                  cursor: "default",
                  bgcolor: "rgba(66,165,245,.07)",
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 29px, rgba(100,130,160,.12) 30px)",
                }}
              >
                {closedDay(dayISO) ? (
                  <Box sx={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", bgcolor: "rgba(237,108,2,.07)", backgroundImage: "repeating-linear-gradient(135deg, transparent 0 14px, rgba(237,108,2,.16) 14px 16px)", display: "flex", justifyContent: "center", pt: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 900, textTransform: "uppercase", textAlign: "center", color: "warning.dark", bgcolor: "background.paper", borderRadius: 1, px: 1, py: 0.3, height: "fit-content", maxWidth: "92%" }}>
                      {closedDay(dayISO)!.reason} • agenda fechada
                    </Typography>
                  </Box>
                ) : null}
                {!isFirstDay && hours.filter((hour) => !(lunchWin && hour * 60 > lunchWin.s && hour * 60 < lunchWin.e)).map((hour) => (
                  <Typography
                    key={`h-${dayISO}-${hour}`}
                    variant="caption"
                    
                    sx={{
                      position: "absolute",
                      top: `${Y(hour * 60)}px`,
                      left: 4,
                      width: HOUR_GUTTER - 6,
                      zIndex: 2,
                      fontWeight: 400, color: "#9aa7b4",
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
                  const top = Y(slot.start);
                  const height = Y(slot.end) - Y(slot.start);
                  const startLabel = timeFromMinutes(slot.start);
                  const endLabel = timeFromMinutes(slot.end - 1);
                  return (
                    <Tooltip
                      key={`free-${dayISO}-${slot.start}`}
                      title={<Box><Typography sx={{ fontSize: 13, fontWeight: 800 }}>Clique para criar um agendamento</Typography><Typography sx={{ fontSize: 12 }}>{startLabel} - {endLabel}</Typography></Box>}
                      followCursor arrow enterDelay={200}
                    >
                    <Box
                      role="button"
                      tabIndex={0}
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
                        "&:hover .slot-time": { display: "flex" },
                      }}
                    >
                      <Box className="slot-time" sx={{ display: "none", position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", alignItems: "center", gap: 0.5, color: "#e8641b", fontWeight: 800, fontSize: 12, pointerEvents: "none" }}>
                        <EventAvailableIcon sx={{ fontSize: 16 }} />
                        {startLabel}
                      </Box>
                    </Box>
                    </Tooltip>
                  );
                })}

                {dragOver && dragOver.dayISO === dayISO ? (
                  <Box sx={{ position: "absolute", left: 0, right: 0, top: dragOver.top, height: 0, borderTop: "2px solid #1565c0", zIndex: 6, pointerEvents: "none" }}>
                    <Typography variant="caption" sx={{ position: "absolute", right: 4, top: -18, bgcolor: "#1565c0", color: "#fff", borderRadius: 1, px: 0.6, fontWeight: 700 }}>{dragOver.label}</Typography>
                  </Box>
                ) : null}
                {breakRows(dayISO).map((item) => {
                  const top = Y(item.start);
                  const height = Math.max(
                    30,
                    Y(item.end) - Y(item.start),
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
                  const savedDuration = Math.max(10, appointment.durationMinutes || 30);
                  const isResizing = resizing?.id === appointment.id;
                  const duration = isResizing ? resizing.duration : savedDuration;
                  const canResize = Boolean(onResize && appointment.backendId && !sunday && appointment.status !== "Desmarcado");
                  if (start >= END_MINUTES || start + duration <= START_MINUTES) return null;
                  const visibleStart = Math.max(START_MINUTES, start);
                  const visibleEnd = Math.min(END_MINUTES, start + duration);
                  const top = Y(visibleStart);
                  const height = Math.max(28, Y(visibleEnd) - Y(visibleStart));
                  const badges = operationalBadges(appointment, materialAlerts, financialAlerts);
                  return (
                    <Tooltip key={`${sunday ? "dom-" : ""}${appointment.id}`} title={appointmentTip({ ...appointment, durationMinutes: duration })} arrow enterDelay={150} placement="top">
                    <Box
                      onClick={(event) => {
                        event.stopPropagation();
                        onAppointmentClick(appointment);
                      }}
                      draggable={Boolean(onMove && appointment.backendId && !sunday && !resizing && !isMobile)}
                      onDragStart={(event) => { drag.current = { id: appointment.id, grabY: event.clientY - event.currentTarget.getBoundingClientRect().top }; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(appointment.id)); }}
                      onDragEnd={() => { drag.current = null; setDragOver(null); }}
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
                        p: 0.8,
                        border: sunday ? "1px dashed #b8c4d0" : "1px solid #dde4ec",
                        borderLeft: `3px solid ${appointment.status === "Desmarcado" ? "#bdbdbd" : colorOf(appointment.professionalName)}`,
                        borderStyle: appointment.status === "Desmarcado" ? "dashed" : undefined,
                        borderRadius: 1.25,
                        bgcolor: appointment.status === "Desmarcado" ? "#f3f4f6" : "#fff",
                        opacity: appointment.status === "Desmarcado" ? 0.85 : 1,
                        boxShadow: "0 1px 2px rgba(20,40,70,.08)",
                        overflow: "hidden",
                        cursor: "pointer",
                        zIndex: sunday ? 3 : 2,
                        "&:hover": { boxShadow: "0 3px 8px rgba(20,40,70,.18)" },
                      }}
                    >
                      <Typography variant="caption" sx={{ display: "block", fontWeight: 600, fontSize: 12, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...(appointment.status === "Desmarcado" ? { color: "text.disabled", textDecoration: "line-through" } : {}) }}>
                        {sunday ? "Dom · " : ""}{appointment.patientName}<MarkerDots backendId={appointment.backendId} />
                      </Typography>
                      {appointment.status === "Desmarcado" ? (
                        <Typography variant="caption" sx={{ display: "block", fontWeight: 800, lineHeight: 1.15, color: "text.secondary" }}>Desmarcou</Typography>
                      ) : null}
                      {height >= 32 ? (
                        <Typography variant="caption" sx={{ display: "block", lineHeight: 1.2, fontSize: 11, color: "text.secondary" }}>
                          {appointment.time.replace(":00", "")} - {timeFromMinutes(start + duration).replace(":00", "")}h
                        </Typography>
                      ) : null}
                      {height >= 52 ? (
                        <Typography variant="caption" sx={{ display: "block", lineHeight: 1.2, mt: 0.2, fontSize: 11, fontWeight: 400, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: height >= 80 ? "normal" : "nowrap" }}>
                          {appointment.procedure}
                        </Typography>
                      ) : null}
                      {height >= 48 && badges[0] && badges[0].label !== "Financeiro OK" ? (
                        <Chip size="small" label={badges[0].label} color={badges[0].color} sx={{ mt: 0.4, maxWidth: "100%" }} />
                      ) : null}
                      {isResizing ? (
                        <Typography variant="caption" sx={{ position: "absolute", right: 6, bottom: 8, fontWeight: 900, bgcolor: "primary.main", color: "primary.contrastText", borderRadius: 1, px: 0.6 }}>
                          {appointment.time} - {timeFromMinutes(start + duration)}
                        </Typography>
                      ) : null}
                      {canResize ? (
                        <Box
                          role="separator"
                          aria-label="Arraste para mudar a duração"
                          title="Arraste para mudar a duração"
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            const target = event.currentTarget;
                            target.setPointerCapture(event.pointerId);
                            const startY = event.clientY;
                            const pxPerMinute = GRID_HEIGHT / TOTAL_MINUTES;
                            const limit = END_MINUTES - start;
                            let latest = savedDuration;
                            setResizing({ id: appointment.id, duration: savedDuration });
                            const move = (e: PointerEvent) => {
                              const delta = Math.round((e.clientY - startY) / pxPerMinute / 15) * 15;
                              latest = Math.min(limit, Math.max(15, savedDuration + delta));
                              setResizing({ id: appointment.id, duration: latest });
                            };
                            const finish = async (e: PointerEvent) => {
                              target.removeEventListener("pointermove", move);
                              target.removeEventListener("pointerup", finish);
                              target.removeEventListener("pointercancel", finish);
                              try { target.releasePointerCapture(e.pointerId); } catch { /* já liberado */ }
                              if (e.type === "pointerup" && latest !== savedDuration) {
                                try { await onResize?.(appointment, latest); }
                                catch (error) { window.alert(error instanceof Error ? error.message : "Não foi possível mudar a duração."); }
                              }
                              setResizing(null);
                            };
                            target.addEventListener("pointermove", move);
                            target.addEventListener("pointerup", finish);
                            target.addEventListener("pointercancel", finish);
                          }}
                          sx={{
                            position: "absolute", left: 0, right: 0, bottom: 0, height: 9, cursor: "ns-resize", touchAction: "none", zIndex: 4,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            "&::after": { content: '""', width: 28, height: 3, borderRadius: 2, bgcolor: "text.secondary", opacity: isResizing ? 0.9 : 0, transition: "opacity .15s" },
                            "&:hover::after": { opacity: 0.7 },
                          }}
                        />
                      ) : null}
                    </Box>
                    </Tooltip>
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
      onResize={props.onResize}
      onMove={props.onMove}
      maxHeight={props.maxHeight}
      materialAlerts={props.materialAlerts}
      financialAlerts={props.financialAlerts}
    />
  );
}
