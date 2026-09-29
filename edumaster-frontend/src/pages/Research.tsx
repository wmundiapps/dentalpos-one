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
import PageHeader from "../components/PageHeader";
import {
  addResearchProjectMember,
  createFundingAgency,
  createFundingCall,
  createResearchProject,
  listFundingAgencies,
  listFundingCalls,
  listResearchProjects,
  updateResearchProjectStatus,
  type FundingAgency,
  type FundingCall,
  type ResearchProject,
} from "../services/ResearchApi";

type Secao = "projetos" | "editais";

const SECOES: { value: Secao; label: string }[] = [
  { value: "projetos", label: "Projetos de pesquisa/extensão" },
  { value: "editais", label: "Agências e editais de fomento" },
];

const STATUS_FLOW: Record<string, string> = { PROPOSTA: "EM_ANALISE", EM_ANALISE: "APROVADO", APROVADO: "EM_ANDAMENTO", EM_ANDAMENTO: "CONCLUIDO" };

export default function Research() {
  const navigate = useNavigate();
  const secaoParam = (new URLSearchParams(window.location.search).get("secao") || "projetos") as Secao;
  const secao = SECOES.some((s) => s.value === secaoParam) ? secaoParam : "projetos";
  const setSecao = (value: Secao) => navigate(`/pesquisa?secao=${value}`);

  return (
    <Box>
      <PageHeader title="Pesquisa e Extensão" description="Projetos de pesquisa/extensão, agências e editais de fomento." />
      <Tabs value={secao} onChange={(_, value) => setSecao(value)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s.value} value={s.value} label={s.label} />)}
      </Tabs>
      {secao === "projetos" && <Projetos />}
      {secao === "editais" && <Editais />}
    </Box>
  );
}

function Projetos() {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "PESQUISA", title: "", coordinatorName: "", description: "", budgetAmount: 0 });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [memberOpen, setMemberOpen] = useState(false);
  const [memberProjectId, setMemberProjectId] = useState("");
  const [memberForm, setMemberForm] = useState({ name: "", role: "" });
  const [memberError, setMemberError] = useState("");
  const [saving2, setSaving2] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setProjects(await listResearchProjects()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar projetos."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.title.trim() || !form.coordinatorName.trim()) { setFormError("Informe título e coordenador."); return; }
    setSaving(true); setFormError("");
    try {
      await createResearchProject(form);
      setOpen(false);
      setForm({ type: "PESQUISA", title: "", coordinatorName: "", description: "", budgetAmount: 0 });
      await reload();
      setToast("Projeto criado.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao criar projeto."); }
    finally { setSaving(false); }
  };

  const advance = async (project: ResearchProject) => {
    const next = STATUS_FLOW[project.status];
    if (!next) return;
    try { await updateResearchProjectStatus(project.id, next); await reload(); setToast("Status atualizado."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar status."); }
  };

  const openMember = (projectId: string) => { setMemberProjectId(projectId); setMemberForm({ name: "", role: "" }); setMemberError(""); setMemberOpen(true); };

  const saveMember = async () => {
    if (!memberForm.name.trim()) { setMemberError("Informe o nome do membro."); return; }
    setSaving2(true); setMemberError("");
    try {
      await addResearchProjectMember(memberProjectId, memberForm);
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
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Projetos</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Novo projeto</Button>
      </Box>

      <Box sx={{ display: "grid", gap: 2 }}>
        {!loading && projects.length === 0 && <Typography color="text.secondary">Nenhum projeto cadastrado ainda.</Typography>}
        {projects.map((p) => (
          <Paper key={p.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
              <Box>
                <Chip size="small" label={p.type} sx={{ mr: 1 }} />
                <Typography component="span" sx={{ fontWeight: 700 }}>{p.title}</Typography>
                <Typography variant="body2" color="text.secondary">Coordenação: {p.coordinatorName}</Typography>
              </Box>
              <Chip size="small" label={p.status} color={p.status === "CONCLUIDO" ? "success" : "default"} />
            </Box>
            {(p.members || []).map((m) => <Typography key={m.id} variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>• {m.name} {m.role ? `(${m.role})` : ""}</Typography>)}
            <Box sx={{ mt: 1.5, display: "flex", gap: 1 }}>
              <Button size="small" onClick={() => openMember(p.id)}>Adicionar membro</Button>
              {STATUS_FLOW[p.status] && <Button size="small" onClick={() => void advance(p)}>Avançar para {STATUS_FLOW[p.status]}</Button>}
            </Box>
          </Paper>
        ))}
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo projeto</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <MenuItem value="PESQUISA">Pesquisa</MenuItem>
            <MenuItem value="EXTENSAO">Extensão</MenuItem>
          </TextField>
          <TextField required label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField required label="Coordenador(a)" value={form.coordinatorName} onChange={(e) => setForm({ ...form, coordinatorName: e.target.value })} />
          <TextField label="Descrição" multiline minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <TextField label="Orçamento (R$)" type="number" value={form.budgetAmount} onChange={(e) => setForm({ ...form, budgetAmount: Number(e.target.value) })} />
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

function Editais() {
  const [agencies, setAgencies] = useState<FundingAgency[]>([]);
  const [calls, setCalls] = useState<FundingCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [agencyOpen, setAgencyOpen] = useState(false);
  const [agencyForm, setAgencyForm] = useState({ name: "", website: "" });
  const [agencyError, setAgencyError] = useState("");
  const [saving, setSaving] = useState(false);

  const [callOpen, setCallOpen] = useState(false);
  const [callForm, setCallForm] = useState({ agencyId: "", title: "", applicationDeadline: "" });
  const [callError, setCallError] = useState("");
  const [saving2, setSaving2] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try {
      const [a, c] = await Promise.all([listFundingAgencies(), listFundingCalls()]);
      setAgencies(a); setCalls(c);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar editais."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const saveAgency = async () => {
    if (!agencyForm.name.trim()) { setAgencyError("Informe o nome."); return; }
    setSaving(true); setAgencyError("");
    try {
      await createFundingAgency({ ...agencyForm, website: agencyForm.website.trim() || undefined });
      setAgencyOpen(false);
      setAgencyForm({ name: "", website: "" });
      await reload();
      setToast("Agência de fomento cadastrada.");
    } catch (e) { setAgencyError(e instanceof Error ? e.message : "Erro ao cadastrar agência."); }
    finally { setSaving(false); }
  };

  const saveCall = async () => {
    if (!callForm.agencyId || !callForm.title.trim() || !callForm.applicationDeadline) { setCallError("Preencha agência, título e prazo."); return; }
    setSaving2(true); setCallError("");
    try {
      await createFundingCall({ ...callForm, applicationDeadline: new Date(callForm.applicationDeadline).toISOString() });
      setCallOpen(false);
      setCallForm({ agencyId: "", title: "", applicationDeadline: "" });
      await reload();
      setToast("Edital cadastrado.");
    } catch (e) { setCallError(e instanceof Error ? e.message : "Erro ao cadastrar edital."); }
    finally { setSaving2(false); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Agências de fomento</Typography>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAgencyOpen(true)}>Nova agência</Button>
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 3 }}>
        {agencies.map((a) => <Chip key={a.id} label={a.name} variant="outlined" />)}
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Editais</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCallOpen(true)} disabled={agencies.length === 0}>Novo edital</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Título</TableCell><TableCell>Agência</TableCell><TableCell>Prazo</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && calls.length === 0 && <TableRow><TableCell colSpan={3}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhum edital cadastrado ainda.</Typography></TableCell></TableRow>}
            {calls.map((c) => (
              <TableRow key={c.id}><TableCell>{c.title}</TableCell><TableCell>{c.agency?.name || agencies.find((a) => a.id === c.agencyId)?.name || "—"}</TableCell><TableCell>{new Date(c.applicationDeadline).toLocaleDateString("pt-BR")}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={agencyOpen} onClose={() => setAgencyOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova agência de fomento</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {agencyError && <Alert severity="error">{agencyError}</Alert>}
          <TextField required label="Nome" value={agencyForm.name} onChange={(e) => setAgencyForm({ ...agencyForm, name: e.target.value })} />
          <TextField label="Site" value={agencyForm.website} onChange={(e) => setAgencyForm({ ...agencyForm, website: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAgencyOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void saveAgency()}>{saving ? "Salvando…" : "Cadastrar"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={callOpen} onClose={() => setCallOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo edital</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {callError && <Alert severity="error">{callError}</Alert>}
          <TextField select required label="Agência" value={callForm.agencyId} onChange={(e) => setCallForm({ ...callForm, agencyId: e.target.value })}>
            {agencies.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
          </TextField>
          <TextField required label="Título" value={callForm.title} onChange={(e) => setCallForm({ ...callForm, title: e.target.value })} />
          <TextField required label="Prazo de inscrição" type="date" slotProps={{ inputLabel: { shrink: true } }} value={callForm.applicationDeadline} onChange={(e) => setCallForm({ ...callForm, applicationDeadline: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCallOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving2} onClick={() => void saveCall()}>{saving2 ? "Salvando…" : "Cadastrar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
