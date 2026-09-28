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
  applyToJobPosting,
  cancelResourceBooking,
  createBookableResource,
  createJobPosting,
  createResourceBooking,
  listBookableResources,
  listJobPostings,
  listResourceBookings,
  myJobApplications,
  type BookableResource,
  type JobApplication,
  type JobPosting,
  type ResourceBooking,
} from "../services/OperationsApi";

type Secao = "reservas" | "carreiras";

const SECOES: { value: Secao; label: string }[] = [
  { value: "reservas", label: "Reservas de salas e equipamentos" },
  { value: "carreiras", label: "Vagas e carreiras" },
];

export default function Operations() {
  const navigate = useNavigate();
  const secaoParam = (new URLSearchParams(window.location.search).get("secao") || "reservas") as Secao;
  const secao = SECOES.some((s) => s.value === secaoParam) ? secaoParam : "reservas";
  const setSecao = (value: Secao) => navigate(`/operacional?secao=${value}`);

  return (
    <Box>
      <PageHeader
        title="Operações do campus"
        description="Reserva de salas/equipamentos e mural de vagas e carreiras para alunos e egressos."
      />

      <Tabs value={secao} onChange={(_, value) => setSecao(value)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s.value} value={s.value} label={s.label} />)}
      </Tabs>

      {secao === "reservas" && <Reservas />}
      {secao === "carreiras" && <Carreiras />}
    </Box>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function Reservas() {
  const [resources, setResources] = useState<BookableResource[]>([]);
  const [bookings, setBookings] = useState<ResourceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [resourceOpen, setResourceOpen] = useState(false);
  const [resourceForm, setResourceForm] = useState<Partial<BookableResource>>({ name: "", category: "SALA", location: "", capacity: undefined });
  const [resourceError, setResourceError] = useState("");
  const [savingResource, setSavingResource] = useState(false);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingForm, setBookingForm] = useState({ resourceId: "", purpose: "", startAt: "", endAt: "" });
  const [bookingError, setBookingError] = useState("");
  const [savingBooking, setSavingBooking] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const [r, b] = await Promise.all([listBookableResources(), listResourceBookings()]);
      setResources(r);
      setBookings(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar reservas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const saveResource = async () => {
    if (!resourceForm.name || !resourceForm.name.trim()) { setResourceError("Informe o nome."); return; }
    setSavingResource(true); setResourceError("");
    try {
      await createBookableResource(resourceForm);
      setResourceOpen(false);
      setResourceForm({ name: "", category: "SALA", location: "", capacity: undefined });
      await reload();
      setToast("Sala/equipamento cadastrado.");
    } catch (e) {
      setResourceError(e instanceof Error ? e.message : "Erro ao cadastrar.");
    } finally {
      setSavingResource(false);
    }
  };

  const saveBooking = async () => {
    if (!bookingForm.resourceId || !bookingForm.purpose.trim() || !bookingForm.startAt || !bookingForm.endAt) {
      setBookingError("Preencha recurso, finalidade, início e término."); return;
    }
    setSavingBooking(true); setBookingError("");
    try {
      await createResourceBooking({
        resourceId: bookingForm.resourceId,
        purpose: bookingForm.purpose,
        startAt: new Date(bookingForm.startAt).toISOString(),
        endAt: new Date(bookingForm.endAt).toISOString(),
      });
      setBookingOpen(false);
      setBookingForm({ resourceId: "", purpose: "", startAt: "", endAt: "" });
      await reload();
      setToast("Reserva confirmada.");
    } catch (e) {
      setBookingError(e instanceof Error ? e.message : "Erro ao reservar.");
    } finally {
      setSavingBooking(false);
    }
  };

  const cancel = async (booking: ResourceBooking) => {
    try {
      await cancelResourceBooking(booking.id);
      await reload();
      setToast("Reserva cancelada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cancelar reserva.");
    }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Salas e equipamentos</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setResourceOpen(true)}>Novo recurso</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setBookingOpen(true)} disabled={resources.length === 0}>Nova reserva</Button>
        </Box>
      </Box>

      <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Nome</TableCell><TableCell>Categoria</TableCell><TableCell>Local</TableCell><TableCell>Capacidade</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && resources.length === 0 && (
              <TableRow><TableCell colSpan={4}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhum recurso cadastrado ainda.</Typography></TableCell></TableRow>
            )}
            {resources.map((r) => (
              <TableRow key={r.id}><TableCell>{r.name}</TableCell><TableCell>{r.category}</TableCell><TableCell>{r.location || "—"}</TableCell><TableCell>{r.capacity ?? "—"}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Reservas</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Recurso</TableCell><TableCell>Finalidade</TableCell><TableCell>Início</TableCell><TableCell>Término</TableCell><TableCell>Status</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && bookings.length === 0 && (
              <TableRow><TableCell colSpan={6}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma reserva ainda.</Typography></TableCell></TableRow>
            )}
            {bookings.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{b.resource.name}</TableCell>
                <TableCell>{b.purpose}</TableCell>
                <TableCell>{formatDateTime(b.startAt)}</TableCell>
                <TableCell>{formatDateTime(b.endAt)}</TableCell>
                <TableCell><Chip size="small" label={b.status} color={b.status === "CONFIRMADA" ? "success" : "default"} /></TableCell>
                <TableCell align="right">
                  {b.status === "CONFIRMADA" && <Button size="small" color="error" onClick={() => void cancel(b)}>Cancelar</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={resourceOpen} onClose={() => setResourceOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo recurso reservável</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {resourceError && <Alert severity="error">{resourceError}</Alert>}
          <TextField required label="Nome" value={resourceForm.name || ""} onChange={(e) => setResourceForm({ ...resourceForm, name: e.target.value })} />
          <TextField select label="Categoria" value={resourceForm.category || "SALA"} onChange={(e) => setResourceForm({ ...resourceForm, category: e.target.value as BookableResource["category"] })}>
            <MenuItem value="SALA">Sala</MenuItem>
            <MenuItem value="AUDITORIO">Auditório</MenuItem>
            <MenuItem value="LABORATORIO">Laboratório</MenuItem>
            <MenuItem value="EQUIPAMENTO">Equipamento</MenuItem>
          </TextField>
          <TextField label="Local" value={resourceForm.location || ""} onChange={(e) => setResourceForm({ ...resourceForm, location: e.target.value })} />
          <TextField
            label="Capacidade"
            type="number"
            value={resourceForm.capacity ?? ""}
            onChange={(e) => setResourceForm({ ...resourceForm, capacity: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResourceOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={savingResource} onClick={() => void saveResource()}>{savingResource ? "Salvando…" : "Salvar recurso"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bookingOpen} onClose={() => setBookingOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova reserva</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {bookingError && <Alert severity="error">{bookingError}</Alert>}
          <TextField select required label="Recurso" value={bookingForm.resourceId} onChange={(e) => setBookingForm({ ...bookingForm, resourceId: e.target.value })}>
            {resources.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
          </TextField>
          <TextField required label="Finalidade" value={bookingForm.purpose} onChange={(e) => setBookingForm({ ...bookingForm, purpose: e.target.value })} />
          <TextField required label="Início" type="datetime-local" slotProps={{ inputLabel: { shrink: true } }} value={bookingForm.startAt} onChange={(e) => setBookingForm({ ...bookingForm, startAt: e.target.value })} />
          <TextField required label="Término" type="datetime-local" slotProps={{ inputLabel: { shrink: true } }} value={bookingForm.endAt} onChange={(e) => setBookingForm({ ...bookingForm, endAt: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBookingOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={savingBooking} onClick={() => void saveBooking()}>{savingBooking ? "Salvando…" : "Confirmar reserva"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Carreiras() {
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [myApplications, setMyApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<JobPosting>>({ title: "", company: "", description: "", type: "ESTAGIO", modality: "PRESENCIAL", location: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const postingsResult = await listJobPostings();
      setPostings(postingsResult);
      try {
        setMyApplications(await myJobApplications());
      } catch {
        setMyApplications([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar vagas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.title?.trim() || !form.company?.trim() || !form.description?.trim()) {
      setFormError("Preencha título, empresa e descrição."); return;
    }
    setSaving(true); setFormError("");
    try {
      await createJobPosting(form);
      setOpen(false);
      setForm({ title: "", company: "", description: "", type: "ESTAGIO", modality: "PRESENCIAL", location: "" });
      await reload();
      setToast("Vaga publicada.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao publicar vaga.");
    } finally {
      setSaving(false);
    }
  };

  const apply = async (posting: JobPosting) => {
    try {
      await applyToJobPosting(posting.id);
      await reload();
      setToast("Candidatura enviada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao se candidatar.");
    }
  };

  const alreadyApplied = (postingId: string) => myApplications.some((a) => a.postingId === postingId);

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Mural de vagas</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Publicar vaga</Button>
      </Box>

      <Box sx={{ display: "grid", gap: 2 }}>
        {!loading && postings.length === 0 && <Typography color="text.secondary">Nenhuma vaga publicada ainda.</Typography>}
        {postings.map((p) => (
          <Paper key={p.id} variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>{p.title}</Typography>
                <Typography variant="body2" color="text.secondary">{p.company}{p.location ? ` — ${p.location}` : ""}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Chip size="small" label={p.type} />
                <Chip size="small" label={p.modality} variant="outlined" />
              </Box>
            </Box>
            <Typography variant="body2" sx={{ mt: 1.5 }}>{p.description}</Typography>
            <Box sx={{ mt: 2 }}>
              {alreadyApplied(p.id) ? (
                <Chip size="small" color="success" label="Você já se candidatou" />
              ) : (
                <Button size="small" variant="outlined" onClick={() => void apply(p)}>Candidatar-se</Button>
              )}
            </Box>
          </Paper>
        ))}
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Publicar vaga</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField required label="Título" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField required label="Empresa" value={form.company || ""} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <TextField required label="Descrição" multiline minRows={3} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <TextField select label="Tipo" value={form.type || "ESTAGIO"} onChange={(e) => setForm({ ...form, type: e.target.value as JobPosting["type"] })}>
              <MenuItem value="ESTAGIO">Estágio</MenuItem>
              <MenuItem value="EMPREGO">Emprego</MenuItem>
              <MenuItem value="TRAINEE">Trainee</MenuItem>
            </TextField>
            <TextField select label="Modalidade" value={form.modality || "PRESENCIAL"} onChange={(e) => setForm({ ...form, modality: e.target.value as JobPosting["modality"] })}>
              <MenuItem value="PRESENCIAL">Presencial</MenuItem>
              <MenuItem value="REMOTO">Remoto</MenuItem>
              <MenuItem value="HIBRIDO">Híbrido</MenuItem>
            </TextField>
          </Box>
          <TextField label="Local" value={form.location || ""} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Publicando…" : "Publicar vaga"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
