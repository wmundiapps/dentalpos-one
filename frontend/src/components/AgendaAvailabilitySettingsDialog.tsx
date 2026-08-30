import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { BackendDoctor } from "../services/AppointmentApi";
import {
  createAgendaBlock,
  createBackendSchedule,
  createRecurringBreak,
  createRecurringBreaks,
  deleteAgendaBlock,
  deleteBackendSchedule,
  deleteRecurringBreak,
  loadAgendaBlocks,
  loadBackendSchedules,
  loadRecurringBreaks,
  type AgendaBlock,
  type BackendSchedule,
  type RecurringBreak,
} from "../services/ScheduleApi";

const days = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function clock(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function intervalPreview(startTime: string, endTime: string, duration: number) {
  const start = minutes(startTime);
  const end = minutes(endTime);
  if (end <= start || duration <= 0) return [];
  const result: string[] = [];
  for (let cursor = start; cursor + duration <= end && result.length < 6; cursor += duration) {
    result.push(`${clock(cursor)}–${clock(cursor + duration - 1)}`);
  }
  return result;
}

function localDateTimeInput(date: Date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 16);
}

function localDateInput(date: Date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function doctorName(doctor: BackendDoctor) {
  return `Dr(a). ${doctor.user.firstName} ${doctor.user.lastName}`.trim();
}

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: (doctorId: string) => void;
  doctors: BackendDoctor[];
}

export default function AgendaAvailabilitySettingsDialog({
  open,
  onClose,
  onChanged,
  doctors,
}: Props) {
  const [schedules, setSchedules] = useState<BackendSchedule[]>([]);
  const [blocks, setBlocks] = useState<AgendaBlock[]>([]);
  const [recurringBreaks, setRecurringBreaks] = useState<RecurringBreak[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [doctorId, setDoctorId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [intervalMode, setIntervalMode] = useState("30");

  const [breakStartTime, setBreakStartTime] = useState("12:00");
  const [breakEndTime, setBreakEndTime] = useState("14:00");
  const [breakReason, setBreakReason] = useState("Almoço");
  const [breakApplyMode, setBreakApplyMode] = useState<"WEEKDAYS" | "CURRENT">("WEEKDAYS");

  const [blockTarget, setBlockTarget] = useState("ALL");
  const [blockMode, setBlockMode] = useState<"HOURS" | "DAYS">("HOURS");
  const tomorrow = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date;
  }, []);
  const [blockStart, setBlockStart] = useState(localDateTimeInput(tomorrow));
  const [blockEnd, setBlockEnd] = useState(
    localDateTimeInput(new Date(tomorrow.getTime() + 60 * 60 * 1000)),
  );
  const [blockStartDate, setBlockStartDate] = useState(localDateInput(tomorrow));
  const [blockEndDate, setBlockEndDate] = useState(localDateInput(tomorrow));
  const [blockReason, setBlockReason] = useState("Compromisso externo");

  const refresh = async () => {
    const [scheduleRows, blockRows, recurringRows] = await Promise.all([
      loadBackendSchedules(),
      loadAgendaBlocks(),
      loadRecurringBreaks(),
    ]);
    setSchedules(scheduleRows);
    setBlocks(blockRows);
    setRecurringBreaks(recurringRows);
  };

  useEffect(() => {
    if (!open) return;
    setDoctorId((current) => current || doctors[0]?.id || "");
    setLoading(true);
    void refresh()
      .catch((error) =>
        window.alert(error instanceof Error ? error.message : "Não foi possível carregar a jornada."),
      )
      .finally(() => setLoading(false));
  }, [open, doctors]);

  const selectedBlocks = schedules
    .filter((item) => item.doctorId === doctorId && item.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const selectedRecurringBreaks = recurringBreaks
    .filter((item) => item.doctorId === doctorId && item.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const blockMinutes = Math.max(0, minutes(endTime) - minutes(startTime));
  const intervalMinutes =
    intervalMode === "FULL" ? blockMinutes : Number(intervalMode || 30);
  const preview = intervalPreview(startTime, endTime, Math.max(1, intervalMinutes));

  const addWorkPeriod = async () => {
    if (!doctorId) return;
    if (blockMinutes <= 0) {
      window.alert("O final da jornada deve ser posterior ao início.");
      return;
    }
    setSaving(true);
    try {
      await createBackendSchedule({
        doctorId,
        dayOfWeek,
        startTime,
        endTime,
        slotDuration: intervalMinutes,
      });
      await refresh();
      onChanged?.(doctorId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível adicionar o período.");
    } finally {
      setSaving(false);
    }
  };

  const removeWorkPeriod = async (id: string) => {
    setSaving(true);
    try {
      await deleteBackendSchedule(id);
      await refresh();
      onChanged?.(doctorId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível remover o período.");
    } finally {
      setSaving(false);
    }
  };

  const addFixedBreak = async () => {
    if (!doctorId) return;
    if (minutes(breakEndTime) <= minutes(breakStartTime)) {
      window.alert("O final do intervalo deve ser posterior ao início.");
      return;
    }

    setSaving(true);
    try {
      const reason = breakReason.trim() || "Intervalo";
      if (breakApplyMode === "WEEKDAYS") {
        await createRecurringBreaks({
          doctorId,
          dayOfWeeks: [1, 2, 3, 4, 5],
          startTime: breakStartTime,
          endTime: breakEndTime,
          reason,
        });
      } else {
        await createRecurringBreak({
          doctorId,
          dayOfWeek,
          startTime: breakStartTime,
          endTime: breakEndTime,
          reason,
        });
      }
      await refresh();
      onChanged?.(doctorId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível criar o intervalo fixo.");
    } finally {
      setSaving(false);
    }
  };

  const removeFixedBreak = async (id: string) => {
    setSaving(true);
    try {
      await deleteRecurringBreak(id);
      await refresh();
      onChanged?.(doctorId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível remover o intervalo fixo.");
    } finally {
      setSaving(false);
    }
  };

  const addBlock = async () => {
    let startAt: Date;
    let endAt: Date;

    if (blockMode === "HOURS") {
      startAt = new Date(blockStart);
      endAt = new Date(blockEnd);
    } else {
      startAt = new Date(`${blockStartDate}T00:00:00`);
      endAt = new Date(`${blockEndDate}T00:00:00`);
      endAt.setDate(endAt.getDate() + 1);
    }

    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime()) ||
      endAt <= startAt
    ) {
      window.alert("Informe um período de bloqueio válido.");
      return;
    }

    setSaving(true);
    try {
      await createAgendaBlock({
        doctorId: blockTarget === "ALL" ? null : blockTarget,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        reason: blockReason.trim() || "Compromisso / indisponibilidade",
      });
      await refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível bloquear a agenda.");
    } finally {
      setSaving(false);
    }
  };

  const removeBlock = async (id: string) => {
    setSaving(true);
    try {
      await deleteAgendaBlock(id);
      await refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível remover o bloqueio.");
    } finally {
      setSaving(false);
    }
  };

  const visibleBlocks = blocks.filter(
    (block) => block.doctorId === null || block.doctorId === doctorId,
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Jornada e bloqueios da Agenda</DialogTitle>
      <DialogContent sx={{ pt: "12px!important", display: "grid", gap: 3 }}>
        <Alert severity="info">
          Sem jornada específica, o padrão é <b>08:00–18:00</b> com grade de
          <b> 30 minutos</b>. Os intervalos fixos abaixo são travas obrigatórias:
          mesmo dentro da jornada, almoço, jantar ou outra pausa nunca aparecem como disponíveis.
        </Alert>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, display: "grid", gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            Jornada semanal
          </Typography>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <TextField
              select
              label="Profissional"
              value={doctorId}
              disabled={loading}
              onChange={(event) => setDoctorId(event.target.value)}
            >
              {doctors.map((doctor) => (
                <MenuItem key={doctor.id} value={doctor.id}>
                  {doctorName(doctor)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Dia da semana"
              value={String(dayOfWeek)}
              onChange={(event) => setDayOfWeek(Number(event.target.value))}
            >
              {days.map((day) => (
                <MenuItem key={day.value} value={String(day.value)}>
                  {day.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {selectedBlocks.length === 0 ? (
            <Alert severity="success">
              Padrão ativo neste dia: 08:00–18:00, a cada 30 minutos.
            </Alert>
          ) : (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {selectedBlocks.map((block) => (
                <Chip
                  key={block.id}
                  label={`${block.startTime}–${block.endTime} • ${block.slotDuration} min`}
                  onDelete={saving ? undefined : () => void removeWorkPeriod(block.id)}
                />
              ))}
            </Box>
          )}

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 2 }}>
            <TextField
              type="time"
              label="Início"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              type="time"
              label="Fim"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              select
              label="Intervalo da grade"
              value={intervalMode}
              onChange={(event) => setIntervalMode(event.target.value)}
            >
              <MenuItem value="10">10 minutos</MenuItem>
              <MenuItem value="15">15 minutos</MenuItem>
              <MenuItem value="30">30 minutos</MenuItem>
              <MenuItem value="45">45 minutos</MenuItem>
              <MenuItem value="60">60 minutos</MenuItem>
              <MenuItem value="FULL">Período inteiro</MenuItem>
            </TextField>
          </Box>

          {blockMinutes > 0 ? (
            <Alert severity="info">
              <b>Exemplo:</b>{" "}
              {preview.length ? preview.join(" • ") : "período menor que o intervalo escolhido."}
              <br />
              Os limites são exibidos sem sobreposição: 09:00–09:09, 09:10–09:19;
              09:00–09:14, 09:15–09:29; 09:00–09:29, 09:30–09:59 etc.
            </Alert>
          ) : null}

          <Button
            variant="contained"
            disabled={saving || !doctorId}
            onClick={() => void addWorkPeriod()}
          >
            Adicionar período da jornada
          </Button>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, display: "grid", gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            Intervalos fixos da jornada
          </Typography>
          <Alert severity="warning">
            Esta é uma <b>trava recorrente</b>. O horário só fica bloqueado depois de clicar
            em <b> Salvar intervalo fixo</b>. Os valores 12:00–14:00 abaixo são apenas a
            sugestão inicial. Depois de salvo, o intervalo desaparece da Agenda, do Novo
            agendamento, da remarcação e do online.
          </Alert>

          {selectedRecurringBreaks.length === 0 ? (
            <Alert severity="info">
              Nenhum intervalo fixo cadastrado para este profissional neste dia.
            </Alert>
          ) : (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {selectedRecurringBreaks.map((item) => (
                <Chip
                  key={item.id}
                  color="warning"
                  label={`${item.reason} • ${item.startTime}–${item.endTime}`}
                  onDelete={saving ? undefined : () => void removeFixedBreak(item.id)}
                />
              ))}
            </Box>
          )}

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <TextField
              select
              label="Aplicar intervalo"
              value={breakApplyMode}
              onChange={(event) =>
                setBreakApplyMode(event.target.value as "WEEKDAYS" | "CURRENT")
              }
            >
              <MenuItem value="WEEKDAYS">Segunda a sexta</MenuItem>
              <MenuItem value="CURRENT">Somente o dia selecionado acima</MenuItem>
            </TextField>
            <Alert severity="info" sx={{ alignItems: "center" }}>
              {breakApplyMode === "WEEKDAYS"
                ? "Será salvo de segunda a sexta em uma única operação."
                : "Será salvo apenas no dia da semana selecionado."}
            </Alert>
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 2 }}>
            <TextField
              type="time"
              label="Início do intervalo"
              value={breakStartTime}
              onChange={(event) => setBreakStartTime(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              type="time"
              label="Fim do intervalo"
              value={breakEndTime}
              onChange={(event) => setBreakEndTime(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Motivo"
              placeholder="Almoço, jantar, reunião..."
              value={breakReason}
              onChange={(event) => setBreakReason(event.target.value)}
            />
          </Box>

          <Button
            color="warning"
            variant="contained"
            disabled={saving || !doctorId}
            onClick={() => void addFixedBreak()}
          >
            Salvar intervalo fixo
          </Button>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, display: "grid", gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            Bloqueios / compromissos eventuais
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Feche um horário, algumas horas, um dia inteiro ou vários dias. O período
            bloqueado desaparece da Agenda interna, remarcação e agendamento online.
          </Typography>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <TextField
              select
              label="Aplicar a"
              value={blockTarget}
              onChange={(event) => setBlockTarget(event.target.value)}
            >
              <MenuItem value="ALL">Toda a clínica</MenuItem>
              {doctors.map((doctor) => (
                <MenuItem key={doctor.id} value={doctor.id}>
                  {doctorName(doctor)}
                </MenuItem>
              ))}
            </TextField>

            <ToggleButtonGroup
              exclusive
              value={blockMode}
              onChange={(_, value) => value && setBlockMode(value)}
              size="small"
              fullWidth
            >
              <ToggleButton value="HOURS">Horário / período</ToggleButton>
              <ToggleButton value="DAYS">Dia / vários dias</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {blockMode === "HOURS" ? (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <TextField
                type="datetime-local"
                label="Bloquear a partir de"
                value={blockStart}
                onChange={(event) => setBlockStart(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                type="datetime-local"
                label="Até"
                value={blockEnd}
                onChange={(event) => setBlockEnd(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
          ) : (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <TextField
                type="date"
                label="Primeiro dia"
                value={blockStartDate}
                onChange={(event) => setBlockStartDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                type="date"
                label="Último dia"
                value={blockEndDate}
                onChange={(event) => setBlockEndDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
          )}

          <TextField
            label="Motivo"
            placeholder="Ex.: curso, congresso, consulta médica, compromisso externo, férias"
            value={blockReason}
            onChange={(event) => setBlockReason(event.target.value)}
          />

          <Button
            color="warning"
            variant="contained"
            disabled={saving}
            onClick={() => void addBlock()}
          >
            Fechar agenda nesse período
          </Button>

          <Typography sx={{ fontWeight: 900 }}>Bloqueios ativos</Typography>
          {visibleBlocks.length === 0 ? (
            <Alert severity="success">Nenhum bloqueio cadastrado para esta seleção.</Alert>
          ) : (
            <Box sx={{ display: "grid", gap: 1 }}>
              {visibleBlocks.map((block) => {
                const start = new Date(block.startAt);
                const end = new Date(block.endAt);
                const selectedDoctor = block.doctorId
                  ? doctors.find((doctor) => doctor.id === block.doctorId)
                  : undefined;
                const target =
                  block.doctorId === null
                    ? "Toda a clínica"
                    : selectedDoctor
                      ? doctorName(selectedDoctor)
                      : "Profissional";
                return (
                  <Paper
                    key={block.id}
                    variant="outlined"
                    sx={{ p: 1.5, display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}
                  >
                    <Box>
                      <Typography sx={{ fontWeight: 900 }}>{block.reason}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {target} • {start.toLocaleString("pt-BR")} até {end.toLocaleString("pt-BR")}
                      </Typography>
                    </Box>
                    <Button
                      color="error"
                      disabled={saving}
                      onClick={() => void removeBlock(block.id)}
                    >
                      Remover bloqueio
                    </Button>
                  </Paper>
                );
              })}
            </Box>
          )}
        </Paper>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}
