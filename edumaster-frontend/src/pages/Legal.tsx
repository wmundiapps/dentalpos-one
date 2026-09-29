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
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PageHeader from "../components/PageHeader";
import {
  addLegalDeadline,
  createLegalCase,
  listLegalCases,
  recordHearingOutcome,
  scheduleHearing,
  updateLegalCaseStatus,
  type LegalCase,
} from "../services/LegalApi";

const STATUS_FLOW: Record<string, string> = { ABERTO: "EM_CONCILIACAO", EM_CONCILIACAO: "AUDIENCIA_MARCADA" };

export default function Legal() {
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "ADMINISTRATIVO", title: "", involvedName: "", description: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [hearingOpen, setHearingOpen] = useState(false);
  const [hearingCaseId, setHearingCaseId] = useState("");
  const [hearingForm, setHearingForm] = useState({ scheduledAt: "", location: "" });
  const [hearingError, setHearingError] = useState("");
  const [saving2, setSaving2] = useState(false);

  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlineCaseId, setDeadlineCaseId] = useState("");
  const [deadlineForm, setDeadlineForm] = useState({ title: "", expiresAt: "" });
  const [deadlineError, setDeadlineError] = useState("");
  const [saving3, setSaving3] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setCases(await listLegalCases()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar demandas."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.title.trim() || !form.involvedName.trim()) { setFormError("Informe título e envolvido."); return; }
    setSaving(true); setFormError("");
    try {
      await createLegalCase(form);
      setOpen(false);
      setForm({ type: "ADMINISTRATIVO", title: "", involvedName: "", description: "" });
      await reload();
      setToast("Demanda aberta.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao abrir demanda."); }
    finally { setSaving(false); }
  };

  const advance = async (legalCase: LegalCase) => {
    const next = STATUS_FLOW[legalCase.status];
    if (!next) return;
    try { await updateLegalCaseStatus(legalCase.id, next); await reload(); setToast("Status atualizado."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar status."); }
  };

  const openHearing = (caseId: string) => { setHearingCaseId(caseId); setHearingForm({ scheduledAt: "", location: "" }); setHearingError(""); setHearingOpen(true); };

  const saveHearing = async () => {
    if (!hearingForm.scheduledAt) { setHearingError("Informe data e hora."); return; }
    setSaving2(true); setHearingError("");
    try {
      await scheduleHearing(hearingCaseId, { ...hearingForm, scheduledAt: new Date(hearingForm.scheduledAt).toISOString() });
      setHearingOpen(false);
      await reload();
      setToast("Audiência agendada.");
    } catch (e) { setHearingError(e instanceof Error ? e.message : "Erro ao agendar audiência."); }
    finally { setSaving2(false); }
  };

  const resolveHearing = async (hearingId: string, caseLabel: string) => {
    try { await recordHearingOutcome(hearingId, { status: "REALIZADA", outcome: "ACORDO" }); await reload(); setToast(`Audiência de "${caseLabel}" registrada com acordo — demanda resolvida.`); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao registrar resultado."); }
  };

  const openDeadline = (caseId: string) => { setDeadlineCaseId(caseId); setDeadlineForm({ title: "", expiresAt: "" }); setDeadlineError(""); setDeadlineOpen(true); };

  const saveDeadline = async () => {
    if (!deadlineForm.title.trim() || !deadlineForm.expiresAt) { setDeadlineError("Informe título e prazo."); return; }
    setSaving3(true); setDeadlineError("");
    try {
      await addLegalDeadline(deadlineCaseId, { ...deadlineForm, expiresAt: new Date(deadlineForm.expiresAt).toISOString() });
      setDeadlineOpen(false);
      setToast("Prazo cadastrado.");
    } catch (e) { setDeadlineError(e instanceof Error ? e.message : "Erro ao cadastrar prazo."); }
    finally { setSaving3(false); }
  };

  return (
    <Box>
      <PageHeader title="Jurídico" description="Demandas administrativas, conciliação, audiências e prazos. Organiza o fluxo — não substitui parecer jurídico." />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Demandas</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nova demanda</Button>
      </Box>

      <Box sx={{ display: "grid", gap: 2 }}>
        {!loading && cases.length === 0 && <Typography color="text.secondary">Nenhuma demanda registrada ainda.</Typography>}
        {cases.map((c) => (
          <Paper key={c.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
              <Box>
                <Chip size="small" label={c.type} sx={{ mr: 1 }} />
                <Typography component="span" sx={{ fontWeight: 700 }}>{c.title}</Typography>
                <Typography variant="body2" color="text.secondary">Envolvido: {c.involvedName}</Typography>
              </Box>
              <Chip size="small" label={c.status} color={c.status === "RESOLVIDO" ? "success" : "default"} />
            </Box>

            {(c.hearings || []).map((h) => (
              <Box key={h.id} sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" color="text.secondary">Audiência: {new Date(h.scheduledAt).toLocaleString("pt-BR")} — {h.status}</Typography>
                {h.status === "AGENDADA" && <Button size="small" onClick={() => void resolveHearing(h.id, c.title)}>Registrar acordo</Button>}
              </Box>
            ))}

            <Box sx={{ mt: 1.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
              {STATUS_FLOW[c.status] && <Button size="small" onClick={() => void advance(c)}>Avançar para {STATUS_FLOW[c.status]}</Button>}
              <Button size="small" onClick={() => openHearing(c.id)}>Agendar audiência</Button>
              <Button size="small" onClick={() => openDeadline(c.id)}>Adicionar prazo</Button>
            </Box>
          </Paper>
        ))}
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova demanda jurídica</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <MenuItem value="CONCILIACAO">Conciliação</MenuItem>
            <MenuItem value="ADMINISTRATIVO">Administrativo</MenuItem>
            <MenuItem value="TRABALHISTA">Trabalhista</MenuItem>
            <MenuItem value="CONSUMIDOR">Consumidor</MenuItem>
            <MenuItem value="MEC">MEC</MenuItem>
            <MenuItem value="OUTRO">Outro</MenuItem>
          </TextField>
          <TextField required label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField required label="Envolvido" value={form.involvedName} onChange={(e) => setForm({ ...form, involvedName: e.target.value })} />
          <TextField label="Descrição" multiline minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Abrir"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={hearingOpen} onClose={() => setHearingOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agendar audiência</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {hearingError && <Alert severity="error">{hearingError}</Alert>}
          <TextField required label="Data e hora" type="datetime-local" slotProps={{ inputLabel: { shrink: true } }} value={hearingForm.scheduledAt} onChange={(e) => setHearingForm({ ...hearingForm, scheduledAt: e.target.value })} />
          <TextField label="Local" value={hearingForm.location} onChange={(e) => setHearingForm({ ...hearingForm, location: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHearingOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving2} onClick={() => void saveHearing()}>{saving2 ? "Salvando…" : "Agendar"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deadlineOpen} onClose={() => setDeadlineOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo prazo</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {deadlineError && <Alert severity="error">{deadlineError}</Alert>}
          <TextField required label="Título" value={deadlineForm.title} onChange={(e) => setDeadlineForm({ ...deadlineForm, title: e.target.value })} />
          <TextField required label="Vencimento" type="date" slotProps={{ inputLabel: { shrink: true } }} value={deadlineForm.expiresAt} onChange={(e) => setDeadlineForm({ ...deadlineForm, expiresAt: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeadlineOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving3} onClick={() => void saveDeadline()}>{saving3 ? "Salvando…" : "Cadastrar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
