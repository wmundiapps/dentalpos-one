import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
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
  advanceFormSubmission,
  createFormSubmission,
  createFormTemplate,
  listFormSubmissions,
  listFormTemplates,
  reviewFormSubmission,
  type FormField,
  type FormSubmission,
  type FormTemplate,
} from "../services/FormsApi";

type Secao = "modelos" | "submissoes";

const SECOES: { value: Secao; label: string }[] = [
  { value: "modelos", label: "Modelos de formulário" },
  { value: "submissoes", label: "Submissões" },
];

export default function Forms() {
  const navigate = useNavigate();
  const secaoParam = (new URLSearchParams(window.location.search).get("secao") || "modelos") as Secao;
  const secao = SECOES.some((s) => s.value === secaoParam) ? secaoParam : "modelos";
  const setSecao = (value: Secao) => navigate(`/formularios?secao=${value}`);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const reloadTemplates = async () => {
    setLoadingTemplates(true);
    try { setTemplates(await listFormTemplates()); } catch { /* ignora, seção mostra vazio */ }
    finally { setLoadingTemplates(false); }
  };

  useEffect(() => { void reloadTemplates(); }, []);

  return (
    <Box>
      <PageHeader title="Motor de Formulários" description="Formulários e fluxos configuráveis para departamentos que não têm módulo dedicado." />
      <Tabs value={secao} onChange={(_, value) => setSecao(value)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s.value} value={s.value} label={s.label} />)}
      </Tabs>
      {secao === "modelos" && <Modelos templates={templates} loading={loadingTemplates} reload={reloadTemplates} />}
      {secao === "submissoes" && <Submissoes templates={templates} />}
    </Box>
  );
}

const emptyField = (): FormField => ({ key: "", label: "", type: "TEXT", required: false, options: [] });

function Modelos({ templates, loading, reload }: { templates: FormTemplate[]; loading: boolean; reload: () => Promise<void> }) {
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", department: "GERAL", description: "", workflowSteps: "Recebido,Em análise,Concluído" });
  const [fields, setFields] = useState<FormField[]>([emptyField()]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const openDialog = () => { setForm({ name: "", department: "GERAL", description: "", workflowSteps: "Recebido,Em análise,Concluído" }); setFields([emptyField()]); setFormError(""); setOpen(true); };

  const updateField = (index: number, patch: Partial<FormField>) => {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const save = async () => {
    if (!form.name.trim()) { setFormError("Informe o nome do modelo."); return; }
    const cleanFields = fields.filter((f) => f.key.trim() && f.label.trim());
    if (cleanFields.length === 0) { setFormError("Adicione ao menos um campo válido (chave + rótulo)."); return; }
    setSaving(true); setFormError("");
    try {
      await createFormTemplate({
        name: form.name, department: form.department, description: form.description || undefined,
        fields: cleanFields, workflowSteps: form.workflowSteps.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setOpen(false);
      await reload();
      setToast("Modelo criado.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao criar modelo."); }
    finally { setSaving(false); }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Modelos</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog}>Novo modelo</Button>
      </Box>

      <Box sx={{ display: "grid", gap: 2 }}>
        {!loading && templates.length === 0 && <Typography color="text.secondary">Nenhum modelo criado ainda.</Typography>}
        {templates.map((t) => (
          <Paper key={t.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography sx={{ fontWeight: 700 }}>{t.name}</Typography>
              <Chip size="small" label={t.department} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Campos: {t.fields.map((f) => f.label).join(", ")}
            </Typography>
            <Typography variant="body2" color="text.secondary">Fluxo: {t.workflowSteps.join(" → ")}</Typography>
          </Paper>
        ))}
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Novo modelo de formulário</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField required label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="Departamento" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <TextField label="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <TextField label="Etapas do fluxo (separadas por vírgula)" value={form.workflowSteps} onChange={(e) => setForm({ ...form, workflowSteps: e.target.value })} />

          <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Campos do formulário</Typography>
          {fields.map((f, i) => (
            <Box key={i} sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 1, alignItems: "center" }}>
              <TextField size="small" label="Chave (ex: nome_completo)" value={f.key} onChange={(e) => updateField(i, { key: e.target.value })} />
              <TextField size="small" label="Rótulo" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} />
              <TextField size="small" select label="Tipo" value={f.type} onChange={(e) => updateField(i, { type: e.target.value as FormField["type"] })}>
                <MenuItem value="TEXT">Texto</MenuItem>
                <MenuItem value="TEXTAREA">Texto longo</MenuItem>
                <MenuItem value="NUMBER">Número</MenuItem>
                <MenuItem value="BOOLEAN">Sim/Não</MenuItem>
                <MenuItem value="DATE">Data</MenuItem>
              </TextField>
              <FormControlLabel control={<Checkbox checked={f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />} label="Obrigatório" />
            </Box>
          ))}
          <Button size="small" onClick={() => setFields([...fields, emptyField()])}>+ Adicionar campo</Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Criar modelo"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Submissoes({ templates }: { templates: FormTemplate[] }) {
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setSubmissions(await listFormSubmissions()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar submissões."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const openDialog = () => { setTemplateId(templates[0]?.id || ""); setValues({}); setFormError(""); setOpen(true); };

  const save = async () => {
    if (!templateId) { setFormError("Selecione o modelo."); return; }
    setSaving(true); setFormError("");
    try {
      await createFormSubmission(templateId, { data: values, submitterName: "Solicitante Fictício de Teste" });
      setOpen(false);
      await reload();
      setToast("Submissão enviada.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao enviar submissão."); }
    finally { setSaving(false); }
  };

  const advance = async (submission: FormSubmission) => {
    try { await advanceFormSubmission(submission.id); await reload(); setToast("Etapa avançada."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao avançar etapa."); }
  };

  const approve = async (submission: FormSubmission) => {
    try { await reviewFormSubmission(submission.id, { status: "APROVADO" }); await reload(); setToast("Submissão aprovada."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao aprovar submissão."); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Submissões</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog} disabled={templates.length === 0}>Nova submissão</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Modelo</TableCell><TableCell>Solicitante</TableCell><TableCell>Etapa</TableCell><TableCell>Status</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && submissions.length === 0 && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma submissão ainda.</Typography></TableCell></TableRow>}
            {submissions.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.template?.name || s.templateId}</TableCell>
                <TableCell>{s.submitterName || "—"}</TableCell>
                <TableCell>{s.template ? s.template.workflowSteps[s.currentStep] || "—" : s.currentStep}</TableCell>
                <TableCell><Chip size="small" label={s.status} color={s.status === "APROVADO" ? "success" : "default"} /></TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => void advance(s)}>Avançar etapa</Button>
                  {s.status !== "APROVADO" && <Button size="small" color="success" onClick={() => void approve(s)}>Aprovar</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova submissão</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField select required label="Modelo" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setValues({}); }}>
            {templates.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          {selectedTemplate?.fields.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              required={f.required}
              type={f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : "text"}
              slotProps={f.type === "DATE" ? { inputLabel: { shrink: true } } : undefined}
              multiline={f.type === "TEXTAREA"}
              value={values[f.key] || ""}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Enviando…" : "Enviar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
