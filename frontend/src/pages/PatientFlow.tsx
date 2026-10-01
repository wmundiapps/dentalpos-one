import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, FormControlLabel, Paper, Switch, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import { appointmentFlowAction, loadBackendAppointments, type BackendAppointment, type FlowAction } from "../services/AppointmentApi";

type FlowStatus = "SCHEDULED" | "CONFIRMED" | "WAITING" | "ROOM_PREPARATION" | "IN_PROGRESS" | "COMPLETED";

const LABELS: Record<FlowStatus, string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  WAITING: "Aguardando",
  ROOM_PREPARATION: "Sala em preparação",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Atendimento finalizado",
};

const COLORS: Record<FlowStatus, { fundo: string; texto: string; borda: string }> = {
  SCHEDULED: { fundo: "#F1F5F9", texto: "#334155", borda: "#94A3B8" },
  CONFIRMED: { fundo: "#E0F2FE", texto: "#075985", borda: "#0EA5E9" },
  WAITING: { fundo: "#FEF3C7", texto: "#92400E", borda: "#F59E0B" },
  ROOM_PREPARATION: { fundo: "#DBEAFE", texto: "#1E40AF", borda: "#3B82F6" },
  IN_PROGRESS: { fundo: "#DCFCE7", texto: "#166534", borda: "#22C55E" },
  COMPLETED: { fundo: "#F3E8FF", texto: "#6B21A8", borda: "#A855F7" },
};

// Ordem da fila: em atendimento, sala em preparação, aguardando, a chegar e, por fim, finalizados.
const ORDER: Record<FlowStatus, number> = { IN_PROGRESS: 0, ROOM_PREPARATION: 1, WAITING: 2, CONFIRMED: 3, SCHEDULED: 4, COMPLETED: 5 };

const isFlowStatus = (s: string): s is FlowStatus => s in LABELS;

function sameLocalDay(iso: string, ref: Date) {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

const hideName = (name: string) => name.trim().slice(0, 4).toUpperCase();
const doctorName = (a: BackendAppointment) => `${a.doctor?.user?.firstName || ""} ${a.doctor?.user?.lastName || ""}`.trim() || "Profissional";
const consultorio = (a: BackendAppointment) => a.room?.trim() || doctorName(a);

export default function PatientFlow() {
  const [items, setItems] = useState<BackendAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [tvMode, setTvMode] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const all = await loadBackendAppointments();
      const today = new Date();
      setItems(all.filter((a) => isFlowStatus(a.status) && sameLocalDay(a.scheduledAt, today)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const run = async (id: string, action: FlowAction) => {
    setBusyId(id);
    try {
      await appointmentFlowAction(id, action);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar o atendimento.");
      await load(true);
    } finally {
      setBusyId("");
    }
  };

  // Uma fila por consultório quando há mais de uma sala ou mais de um profissional no dia.
  const groups = useMemo(() => {
    const split = new Set(items.map(consultorio)).size > 1 || new Set(items.map((a) => a.doctorId)).size > 1;
    const map = new Map<string, BackendAppointment[]>();
    for (const a of items) {
      const key = split ? consultorio(a) : "Fila única";
      map.set(key, [...(map.get(key) || []), a]);
    }
    const sortFn = (a: BackendAppointment, b: BackendAppointment) =>
      ORDER[a.status as FlowStatus] - ORDER[b.status as FlowStatus] || a.scheduledAt.localeCompare(b.scheduledAt);
    return { split, list: [...map.entries()].map(([name, rows]) => ({ name, rows: [...rows].sort(sortFn) })).sort((a, b) => a.name.localeCompare(b.name)) };
  }, [items]);

  const count = (s: FlowStatus) => items.filter((a) => a.status === s).length;

  const actions = (a: BackendAppointment): Array<{ label: string; action: FlowAction; variant: "contained" | "outlined" }> => {
    switch (a.status) {
      case "SCHEDULED":
      case "CONFIRMED":
        return [{ label: "Confirmar chegada", action: "ARRIVED", variant: "contained" }];
      case "WAITING":
        return [
          { label: "Sala em preparação", action: "PREPARE_ROOM", variant: "outlined" },
          { label: "Iniciar atendimento", action: "START", variant: "contained" },
        ];
      case "ROOM_PREPARATION":
        return [{ label: "Iniciar atendimento", action: "START", variant: "contained" }];
      case "IN_PROGRESS":
        return [{ label: "Atendimento finalizado", action: "FINISH", variant: "contained" }];
      default:
        return [];
    }
  };

  return (
    <Box>
      <PageHeader
        title="Painel de Atendimento"
        description="Fila do dia por consultório. A recepção confirma a chegada do paciente e cada atendimento finalizado atualiza apenas a fila do seu consultório."
      />
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
        <Chip label={`Aguardando: ${count("WAITING")}`} sx={{ bgcolor: COLORS.WAITING.fundo, color: COLORS.WAITING.texto, fontWeight: 700 }} />
        <Chip label={`Em atendimento: ${count("IN_PROGRESS")}`} sx={{ bgcolor: COLORS.IN_PROGRESS.fundo, color: COLORS.IN_PROGRESS.texto, fontWeight: 700 }} />
        <Chip label={`Finalizados: ${count("COMPLETED")}`} sx={{ bgcolor: COLORS.COMPLETED.fundo, color: COLORS.COMPLETED.texto, fontWeight: 700 }} />
        <Box sx={{ flex: 1 }} />
        <FormControlLabel control={<Switch checked={tvMode} onChange={(_, v) => setTvMode(v)} />} label="Modo TV (oculta nomes)" />
        <Button onClick={() => void load()} disabled={loading}>Atualizar</Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!loading && items.length === 0 && <Alert severity="info">Nenhum paciente agendado para hoje.</Alert>}
      {groups.list.map((group) => (
        <Paper key={group.name} elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden", mb: 3 }}>
          {groups.split && (
            <Box sx={{ px: 3, py: 1.5, bgcolor: "#0F172A", color: "#FFFFFF" }}>
              <Typography sx={{ fontWeight: 800 }}>{group.name}</Typography>
            </Box>
          )}
          {group.rows.map((a) => {
            const status = a.status as FlowStatus;
            const cores = COLORS[status];
            const time = new Date(a.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            const name = a.patient?.fullName || "Paciente";
            return (
              <Box
                key={a.id}
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "80px 1.4fr 1fr 1fr auto" },
                  gap: 2,
                  alignItems: "center",
                  px: 3,
                  py: 2,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  bgcolor: cores.fundo,
                  borderLeft: `6px solid ${cores.borda}`,
                }}
              >
                <Typography sx={{ fontWeight: 700 }}>{time}</Typography>
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 18, letterSpacing: tvMode ? 1 : 0 }}>{tvMode ? hideName(name) : name}</Typography>
                  {!tvMode && <Typography variant="body2" color="text.secondary">{a.procedure}</Typography>}
                </Box>
                <Chip label={LABELS[status]} sx={{ justifySelf: "start", bgcolor: "#fff", color: cores.texto, border: `1px solid ${cores.borda}`, fontWeight: 700 }} />
                <Typography color="text.secondary">{`${doctorName(a)} • ${consultorio(a)}`}</Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {actions(a).map((b) => (
                    <Button key={b.action} size="small" variant={b.variant} disabled={busyId === a.id} onClick={() => void run(a.id, b.action)}>
                      {b.label}
                    </Button>
                  ))}
                </Box>
              </Box>
            );
          })}
        </Paper>
      ))}
    </Box>
  );
}
