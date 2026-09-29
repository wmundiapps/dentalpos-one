import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PageHeader from "../components/PageHeader";
import {
  addCommitteeMember,
  createCommittee,
  createPdiGoal,
  createRegulatoryWatch,
  listCommittees,
  listPdiGoals,
  listRegulatoryWatches,
  triageRegulatoryWatch,
  updatePdiGoal,
  updateRegulatoryWatchStatus,
  type Committee,
  type PdiGoal,
  type RegulatoryWatch,
} from "../services/GovernanceApi";

type Secao = "comissoes" | "pdi" | "regulatorio";

const SECOES: { value: Secao; label: string }[] = [
  { value: "comissoes", label: "Comissões (CPA/CIPA/NDE)" },
  { value: "pdi", label: "Metas do PDI" },
  { value: "regulatorio", label: "Atos regulatórios" },
];

export default function Governance() {
  const navigate = useNavigate();
  const secaoParam = (new URLSearchParams(window.location.search).get("secao") || "comissoes") as Secao;
  const secao = SECOES.some((s) => s.value === secaoParam) ? secaoParam : "comissoes";
  const setSecao = (value: Secao) => navigate(`/governanca?secao=${value}`);

  return (
    <Box>
      <PageHeader title="Governança e Regulatório" description="Comissões estatutárias, plano de desenvolvimento institucional e monitoramento de atos do MEC." />
      <Tabs value={secao} onChange={(_, value) => setSecao(value)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s.value} value={s.value} label={s.label} />)}
      </Tabs>
      {secao === "comissoes" && <Comissoes />}
      {secao === "pdi" && <Pdi />}
      {secao === "regulatorio" && <Regulatorio />}
    </Box>
  );
}

function Comissoes() {
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "CPA", name: "", description: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [memberOpen, setMemberOpen] = useState(false);
  const [memberCommitteeId, setMemberCommitteeId] = useState("");
  const [memberForm, setMemberForm] = useState({ name: "", role: "" });
  const [memberError, setMemberError] = useState("");
  const [saving2, setSaving2] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setCommittees(await listCommittees()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar comissões."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.name.trim()) { setFormError("Informe o nome."); return; }
    setSaving(true); setFormError("");
    try {
      await createCommittee(form);
      setOpen(false);
      setForm({ type: "CPA", name: "", description: "" });
      await reload();
      setToast("Comissão criada.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao criar comissão."); }
    finally { setSaving(false); }
  };

  const openMember = (committeeId: string) => { setMemberCommitteeId(committeeId); setMemberForm({ name: "", role: "" }); setMemberError(""); setMemberOpen(true); };

  const saveMember = async () => {
    if (!memberForm.name.trim()) { setMemberError("Informe o nome do membro."); return; }
    setSaving2(true); setMemberError("");
    try {
      await addCommitteeMember(memberCommitteeId, memberForm);
      setMemberOpen(false);
      await reload();
      setToast("Membro adicionado.");
    } catch (e) { setMemberError(e instanceof Error ? e.message : "Erro ao adicionar membro."); }
    finally { setSaving2(false); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Comissões</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nova comissão</Button>
      </Box>

      <Box sx={{ display: "grid", gap: 2 }}>
        {!loading && committees.length === 0 && <Typography color="text.secondary">Nenhuma comissão criada ainda.</Typography>}
        {committees.map((c) => (
          <Paper key={c.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box>
                <Chip size="small" label={c.type} sx={{ mr: 1 }} />
                <Typography component="span" sx={{ fontWeight: 700 }}>{c.name}</Typography>
              </Box>
              <Button size="small" onClick={() => openMember(c.id)}>Adicionar membro</Button>
            </Box>
            {(c.members || []).map((m) => <Typography key={m.id} variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>• {m.name} {m.role ? `(${m.role})` : ""}</Typography>)}
          </Paper>
        ))}
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova comissão</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <MenuItem value="CPA">CPA</MenuItem>
            <MenuItem value="CIPA">CIPA</MenuItem>
            <MenuItem value="NDE">NDE</MenuItem>
            <MenuItem value="OUTRA">Outra</MenuItem>
          </TextField>
          <TextField required label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Criar"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={memberOpen} onClose={() => setMemberOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Adicionar membro</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {memberError && <Alert severity="error">{memberError}</Alert>}
          <TextField required label="Nome" value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} />
          <TextField label="Papel" value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMemberOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving2} onClick={() => void saveMember()}>{saving2 ? "Salvando…" : "Adicionar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Pdi() {
  const [goals, setGoals] = useState<PdiGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", indicator: "", targetValue: 0, description: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setGoals(await listPdiGoals()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar metas."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.title.trim()) { setFormError("Informe o título."); return; }
    setSaving(true); setFormError("");
    try {
      await createPdiGoal(form);
      setOpen(false);
      setForm({ title: "", indicator: "", targetValue: 0, description: "" });
      await reload();
      setToast("Meta criada.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao criar meta."); }
    finally { setSaving(false); }
  };

  const advance = async (goal: PdiGoal) => {
    try {
      const nextStatus = goal.status === "PLANEJADA" ? "EM_ANDAMENTO" : "CONCLUIDA";
      await updatePdiGoal(goal.id, { status: nextStatus });
      await reload();
      setToast("Meta atualizada.");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar meta."); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Metas do PDI</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nova meta</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Título</TableCell><TableCell>Indicador</TableCell><TableCell>Alvo</TableCell><TableCell>Status</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && goals.length === 0 && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma meta cadastrada ainda.</Typography></TableCell></TableRow>}
            {goals.map((g) => (
              <TableRow key={g.id}>
                <TableCell>{g.title}</TableCell>
                <TableCell>{g.indicator || "—"}</TableCell>
                <TableCell>{g.targetValue ?? "—"}</TableCell>
                <TableCell><Chip size="small" label={g.status} color={g.status === "CONCLUIDA" ? "success" : "default"} /></TableCell>
                <TableCell align="right">
                  {g.status !== "CONCLUIDA" && <Button size="small" onClick={() => void advance(g)}>{g.status === "PLANEJADA" ? "Iniciar" : "Concluir"}</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova meta do PDI</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField required label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField label="Indicador" value={form.indicator} onChange={(e) => setForm({ ...form, indicator: e.target.value })} />
          <TextField label="Valor alvo" type="number" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: Number(e.target.value) })} />
          <TextField label="Descrição" multiline minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Criar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Regulatorio() {
  const [watches, setWatches] = useState<RegulatoryWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ source: "MEC", title: "", sourceUrl: "", rawExcerpt: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setWatches(await listRegulatoryWatches()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar atos regulatórios."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.title.trim()) { setFormError("Informe o título."); return; }
    setSaving(true); setFormError("");
    try {
      await createRegulatoryWatch({ ...form, sourceUrl: form.sourceUrl.trim() || undefined });
      setOpen(false);
      setForm({ source: "MEC", title: "", sourceUrl: "", rawExcerpt: "" });
      await reload();
      setToast("Ato regulatório registrado.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao registrar."); }
    finally { setSaving(false); }
  };

  const triage = async (watch: RegulatoryWatch) => {
    try { await triageRegulatoryWatch(watch.id); await reload(); setToast("Triagem por IA concluída."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro na triagem por IA."); }
  };

  const markStatus = async (watch: RegulatoryWatch, status: string) => {
    try { await updateRegulatoryWatchStatus(watch.id, status); await reload(); setToast("Status atualizado."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar status."); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Atos regulatórios (MEC / Diário Oficial)</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Registrar ato</Button>
      </Box>

      <Box sx={{ display: "grid", gap: 2 }}>
        {!loading && watches.length === 0 && <Typography color="text.secondary">Nenhum ato registrado ainda.</Typography>}
        {watches.map((w) => (
          <Paper key={w.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
              <Box>
                <Typography sx={{ fontWeight: 700 }}>{w.title}</Typography>
                <Typography variant="body2" color="text.secondary">{w.source}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Chip size="small" label={w.status} />
                {w.relevance !== "NAO_ANALISADO" && <Chip size="small" label={`Relevância: ${w.relevance}`} color={w.relevance === "ALTA" ? "error" : w.relevance === "MEDIA" ? "warning" : "default"} />}
              </Box>
            </Box>
            {w.aiSummary && <Typography variant="body2" sx={{ mt: 1 }}>{w.aiSummary}</Typography>}
            <Box sx={{ mt: 1.5, display: "flex", gap: 1 }}>
              {w.rawExcerpt && w.relevance === "NAO_ANALISADO" && <Button size="small" startIcon={<AutoAwesomeIcon />} onClick={() => void triage(w)}>Triar com IA</Button>}
              {w.status !== "TRATADO" && <Button size="small" onClick={() => void markStatus(w, "TRATADO")}>Marcar como tratado</Button>}
            </Box>
          </Paper>
        ))}
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Registrar ato regulatório</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField select label="Fonte" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            <MenuItem value="DIARIO_OFICIAL_UNIAO">Diário Oficial da União</MenuItem>
            <MenuItem value="DIARIO_OFICIAL_ESTADO">Diário Oficial do Estado</MenuItem>
            <MenuItem value="MEC">MEC</MenuItem>
            <MenuItem value="OUTRO">Outro</MenuItem>
          </TextField>
          <TextField required label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField label="URL da fonte" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
          <TextField label="Texto (para triagem por IA)" multiline minRows={3} value={form.rawExcerpt} onChange={(e) => setForm({ ...form, rawExcerpt: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Registrar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
