import { useEffect, useState } from "react";
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
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PageHeader from "../components/PageHeader";
import { listStudents, type EduStudent } from "../services/EduApi";
import {
  addReinforcementAction,
  completeReinforcementAction,
  createReinforcementPlan,
  getStudentPerformance,
  listReinforcementPlans,
  type ReinforcementPlan,
  type StudentPerformance,
} from "../services/PerformanceApi";

const RISK_COLOR: Record<string, "success" | "warning" | "error"> = { BAIXO: "success", MEDIO: "warning", ALTO: "error" };

export default function Performance() {
  const [students, setStudents] = useState<EduStudent[]>([]);
  const [studentId, setStudentId] = useState("");
  const [performance, setPerformance] = useState<StudentPerformance | null>(null);
  const [loadingPerf, setLoadingPerf] = useState(false);
  const [error, setError] = useState("");

  const [plans, setPlans] = useState<ReinforcementPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [toast, setToast] = useState("");

  const [planOpen, setPlanOpen] = useState(false);
  const [planForm, setPlanForm] = useState({ studentId: "", title: "", competency: "", description: "" });
  const [planError, setPlanError] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);

  const [actionOpen, setActionOpen] = useState(false);
  const [actionPlanId, setActionPlanId] = useState("");
  const [actionDescription, setActionDescription] = useState("");
  const [actionError, setActionError] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  const reloadPlans = async () => {
    setLoadingPlans(true);
    try { setPlans(await listReinforcementPlans()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar planos de reforço."); }
    finally { setLoadingPlans(false); }
  };

  useEffect(() => {
    listStudents().then(setStudents).catch(() => {});
    void reloadPlans();
  }, []);

  const loadPerformance = async (id: string) => {
    setStudentId(id);
    if (!id) { setPerformance(null); return; }
    setLoadingPerf(true); setError("");
    try { setPerformance(await getStudentPerformance(id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao calcular desempenho."); }
    finally { setLoadingPerf(false); }
  };

  const openPlan = () => { setPlanForm({ studentId: studentId || "", title: "", competency: "", description: "" }); setPlanError(""); setPlanOpen(true); };

  const savePlan = async () => {
    if (!planForm.studentId || !planForm.title.trim()) { setPlanError("Selecione o aluno e informe o título."); return; }
    setSavingPlan(true); setPlanError("");
    try {
      await createReinforcementPlan(planForm);
      setPlanOpen(false);
      await reloadPlans();
      setToast("Plano de reforço criado.");
    } catch (e) { setPlanError(e instanceof Error ? e.message : "Erro ao criar plano."); }
    finally { setSavingPlan(false); }
  };

  const openAction = (planId: string) => { setActionPlanId(planId); setActionDescription(""); setActionError(""); setActionOpen(true); };

  const saveAction = async () => {
    if (!actionDescription.trim()) { setActionError("Descreva a ação."); return; }
    setSavingAction(true); setActionError("");
    try {
      await addReinforcementAction(actionPlanId, { description: actionDescription });
      setActionOpen(false);
      await reloadPlans();
      setToast("Ação adicionada ao plano.");
    } catch (e) { setActionError(e instanceof Error ? e.message : "Erro ao adicionar ação."); }
    finally { setSavingAction(false); }
  };

  const completeAction = async (actionId: string) => {
    try { await completeReinforcementAction(actionId); await reloadPlans(); setToast("Ação concluída."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao concluir ação."); }
  };

  return (
    <Box>
      <PageHeader title="Desempenho e Reforço" description="Painel de desempenho por aluno (frequência, provas, competências) e planos de reforço acadêmico." />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <TextField select label="Selecionar aluno" fullWidth value={studentId} onChange={(e) => void loadPerformance(e.target.value)} sx={{ maxWidth: 420 }}>
          <MenuItem value="">—</MenuItem>
          {students.map((s) => <MenuItem key={s.id} value={s.id}>{s.fullName}</MenuItem>)}
        </TextField>

        {loadingPerf && <Typography color="text.secondary" sx={{ mt: 2 }}>Calculando…</Typography>}

        {performance && !loadingPerf && (
          <Box sx={{ mt: 3, display: "grid", gridTemplateColumns: { xs: "repeat(2,1fr)", md: "repeat(4,1fr)" }, gap: 1.5 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="caption" color="text.secondary">Frequência</Typography>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>{performance.attendancePercent ?? "—"}{performance.attendancePercent !== null ? "%" : ""}</Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="caption" color="text.secondary">Média em provas</Typography>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>{performance.examsAverage ?? "—"}</Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="caption" color="text.secondary">Tentativas corrigidas</Typography>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>{performance.examAttemptsCount}</Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="caption" color="text.secondary">Risco</Typography>
              <Chip sx={{ mt: 0.5 }} label={performance.riskLevel} color={RISK_COLOR[performance.riskLevel] || "default"} />
            </Paper>
          </Box>
        )}

        {performance && performance.competencyBreakdown.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Por competência</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {performance.competencyBreakdown.map((c) => (
                <Chip key={c.competency} label={`${c.competency}: ${c.percent ?? "—"}%`} variant="outlined" />
              ))}
            </Box>
          </Box>
        )}
      </Paper>

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Planos de reforço</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openPlan}>Novo plano</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>Título</TableCell><TableCell>Competência</TableCell><TableCell>Status</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loadingPlans && plans.length === 0 && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhum plano de reforço ainda.</Typography></TableCell></TableRow>}
            {plans.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.student?.fullName || p.studentId}</TableCell>
                <TableCell>{p.title}</TableCell>
                <TableCell>{p.competency || "—"}</TableCell>
                <TableCell><Chip size="small" label={p.status} /></TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openAction(p.id)}>Adicionar ação</Button>
                  {(p.actions || []).filter((a) => a.status !== "CONCLUIDA").map((a) => (
                    <Button key={a.id} size="small" color="success" onClick={() => void completeAction(a.id)}>Concluir: {a.description.slice(0, 20)}…</Button>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={planOpen} onClose={() => setPlanOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo plano de reforço</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {planError && <Alert severity="error">{planError}</Alert>}
          <TextField select required label="Aluno" value={planForm.studentId} onChange={(e) => setPlanForm({ ...planForm, studentId: e.target.value })}>
            {students.map((s) => <MenuItem key={s.id} value={s.id}>{s.fullName}</MenuItem>)}
          </TextField>
          <TextField required label="Título" value={planForm.title} onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })} />
          <TextField label="Competência" value={planForm.competency} onChange={(e) => setPlanForm({ ...planForm, competency: e.target.value })} />
          <TextField label="Descrição" multiline minRows={2} value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={savingPlan} onClick={() => void savePlan()}>{savingPlan ? "Salvando…" : "Criar plano"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={actionOpen} onClose={() => setActionOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova ação do plano</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {actionError && <Alert severity="error">{actionError}</Alert>}
          <TextField required label="Descrição da ação" multiline minRows={2} value={actionDescription} onChange={(e) => setActionDescription(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={savingAction} onClick={() => void saveAction()}>{savingAction ? "Salvando…" : "Adicionar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
