import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import AddTaskIcon from "@mui/icons-material/AddTask";
import PageHeader from "../components/PageHeader";
import {
  TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, cancelPendingTask, completePendingTask, createPendingTask, getTaskRanking, listAssignees, listPendingTasks, updatePendingTask,
  type Assignee, type PendingTask, type RankingRow
} from "../services/PendingTasksApi";

type ChipColor = "default" | "primary" | "info" | "success" | "warning" | "error";
const priorityColor = (p: string): ChipColor => (p === "URGENTE" ? "error" : p === "ALTA" ? "warning" : p === "MEDIA" ? "info" : "default");
const statusColor = (s: string): ChipColor => (s === "CONCLUIDA" ? "success" : s === "EM_ANDAMENTO" ? "primary" : s === "CANCELADA" ? "default" : "info");
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Sem prazo");
const isLate = (t: PendingTask) => !!t.dueDate && t.status !== "CONCLUIDA" && t.status !== "CANCELADA" && new Date(t.dueDate).getTime() + 27 * 3600 * 1000 < Date.now();
const empty = { title: "", description: "", module: "", priority: "MEDIA", dueDate: "", assigneeId: "" };

export default function Pendencias() {
  const [rows, setRows] = useState<PendingTask[]>([]);
  const [people, setPeople] = useState<Assignee[]>([]);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [fStatus, setFStatus] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PendingTask | null>(null);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await listPendingTasks({ status: fStatus, priority: fPriority, assigneeId: fAssignee })); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar pendências."); }
    finally { setLoading(false); }
  }, [fStatus, fPriority, fAssignee]);
  const loadRanking = useCallback(async () => {
    try { setRanking((await getTaskRanking(period)).ranking); } catch { setRanking([]); }
  }, [period]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadRanking(); }, [loadRanking]);
  useEffect(() => { listAssignees().then(setPeople).catch(() => setPeople([])); }, []);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (t: PendingTask) => {
    setEditing(t);
    setForm({ title: t.title, description: t.description || "", module: t.module || "", priority: t.priority, dueDate: t.dueDate ? t.dueDate.slice(0, 10) : "", assigneeId: t.assigneeId || "" });
    setOpen(true);
  };
  const save = async () => {
    setSaving(true); setError("");
    const body = { title: form.title, description: form.description || null, module: form.module || null, priority: form.priority, dueDate: form.dueDate || null, assigneeId: form.assigneeId || null };
    try {
      if (editing) await updatePendingTask(editing.id, body); else await createPendingTask(body);
      setOpen(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  };
  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try { await fn(); await load(); await loadRanking(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar."); }
  };

  const openCount = rows.filter((r) => r.status === "ABERTA" || r.status === "EM_ANDAMENTO").length;
  const lateCount = rows.filter(isLate).length;

  return (
    <Box>
      <PageHeader title="Pendências" description="Distribua tarefas da rotina da clínica com responsável e prazo. Ao concluir, cada pessoa soma pontos conforme a prioridade, com bônus para entregas no prazo." />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 2, alignItems: "start" }}>
        <Box>
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }} alignItems="center">
            <Button variant="contained" startIcon={<AddTaskIcon />} onClick={openNew}>Nova pendência</Button>
            <TextField select size="small" label="Status" value={fStatus} onChange={(e) => setFStatus(e.target.value)} sx={{ minWidth: 150 }}>
              <MenuItem value="">Todos</MenuItem>
              {Object.entries(TASK_STATUS_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Prioridade" value={fPriority} onChange={(e) => setFPriority(e.target.value)} sx={{ minWidth: 150 }}>
              <MenuItem value="">Todas</MenuItem>
              {Object.entries(TASK_PRIORITY_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Responsável" value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="none">Sem responsável</MenuItem>
              {people.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
          </Stack>
          <Typography color="text.secondary" sx={{ mb: 1 }}>{`${openCount} em aberto${lateCount ? ` · ${lateCount} atrasada(s)` : ""}`}</Typography>
          <Stack spacing={1.5}>
            {!loading && rows.length === 0 && <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Typography color="text.secondary">Nenhuma pendência encontrada.</Typography></Paper>}
            {rows.map((t) => {
              const done = t.status === "CONCLUIDA" || t.status === "CANCELADA";
              return (
                <Paper key={t.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800 }}>{t.title}</Typography>
                      {t.description && <Typography variant="body2" color="text.secondary">{t.description}</Typography>}
                      <Typography variant="caption" color="text.secondary">
                        {`Responsável: ${t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}`.trim() : "não definido"} · Prazo: ${fmtDate(t.dueDate)}${t.module ? ` · ${t.module}` : ""}`}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }} alignItems="flex-start">
                      <Chip size="small" color={priorityColor(t.priority)} label={TASK_PRIORITY_LABEL[t.priority] || t.priority} />
                      <Chip size="small" color={statusColor(t.status)} label={TASK_STATUS_LABEL[t.status] || t.status} />
                      {isLate(t) && <Chip size="small" color="error" variant="outlined" label="Atrasada" />}
                      {t.status === "CONCLUIDA" && <Chip size="small" color="success" variant="outlined" label={`+${t.points} pts`} />}
                    </Stack>
                  </Stack>
                  {!done && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", gap: 1 }}>
                      <Button size="small" variant="contained" color="success" onClick={() => act(() => completePendingTask(t.id))}>Concluir</Button>
                      {t.status === "ABERTA" && <Button size="small" onClick={() => act(() => updatePendingTask(t.id, { status: "EM_ANDAMENTO" }))}>Iniciar</Button>}
                      <Button size="small" onClick={() => openEdit(t)}>Editar</Button>
                      <Button size="small" color="error" onClick={() => act(() => cancelPendingTask(t.id))}>Cancelar</Button>
                    </Stack>
                  )}
                </Paper>
              );
            })}
          </Stack>
        </Box>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography sx={{ fontWeight: 900 }}>Ranking de pontuação</Typography>
            <ToggleButtonGroup size="small" exclusive value={period} onChange={(_, v) => v && setPeriod(v)}>
              <ToggleButton value="week">Semana</ToggleButton>
              <ToggleButton value="month">Mês</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {ranking.length === 0 && <Typography color="text.secondary" variant="body2">Ainda não há pendências concluídas neste período.</Typography>}
          <Stack spacing={1}>
            {ranking.map((r, i) => (
              <Box key={r.assigneeId} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Typography sx={{ fontWeight: 900, width: 28 }}>{`${i + 1}º`}</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }} noWrap>{r.name || "Sem nome"}</Typography>
                  <Typography variant="caption" color="text.secondary">{`${r.completed} concluída(s) · ${r.onTime} no prazo · ${r.late} atrasada(s)`}</Typography>
                </Box>
                <Typography sx={{ fontWeight: 900 }}>{`${r.points} pts`}</Typography>
              </Box>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
            Pontos por prioridade: baixa 5, média 10, alta 20, urgente 30. Concluir no prazo rende 50% de bônus; atrasada não pontua.
          </Typography>
        </Paper>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Editar pendência" : "Nova pendência"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
            <TextField label="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} multiline minRows={2} />
            <TextField label="Origem / módulo (opcional)" value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} />
            <TextField select label="Prioridade" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {Object.entries(TASK_PRIORITY_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
            <TextField label="Prazo" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField select label="Responsável" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <MenuItem value="">Sem responsável</MenuItem>
              {people.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Fechar</Button>
          <Button variant="contained" onClick={save} disabled={saving || form.title.trim().length < 2}>Salvar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
