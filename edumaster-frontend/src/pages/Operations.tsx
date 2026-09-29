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
import {
  assignParkingSpot,
  createAsset,
  createExpiringItem,
  createMaintenanceOrder,
  createParkingSpot,
  listAssets,
  listExpiringItems,
  listMaintenanceOrders,
  listParkingSpots,
  releaseParkingSpot,
  resolveExpiringItem,
  updateAssetStatus,
  updateMaintenanceStatus,
  type Asset,
  type ExpiringItem,
  type MaintenanceOrder,
  type ParkingSpot,
} from "../services/FacilitiesApi";
import { listStudents, type EduStudent } from "../services/EduApi";

type Secao = "reservas" | "carreiras" | "patrimonio" | "manutencao" | "estacionamento" | "vencimentos";

const SECOES: { value: Secao; label: string }[] = [
  { value: "reservas", label: "Reservas de salas e equipamentos" },
  { value: "carreiras", label: "Vagas e carreiras" },
  { value: "patrimonio", label: "Patrimônio" },
  { value: "manutencao", label: "Manutenção" },
  { value: "estacionamento", label: "Estacionamento" },
  { value: "vencimentos", label: "Vencimentos" },
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

      <Tabs value={secao} onChange={(_, value) => setSecao(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s.value} value={s.value} label={s.label} />)}
      </Tabs>

      {secao === "reservas" && <Reservas />}
      {secao === "carreiras" && <Carreiras />}
      {secao === "patrimonio" && <Patrimonio />}
      {secao === "manutencao" && <Manutencao />}
      {secao === "estacionamento" && <Estacionamento />}
      {secao === "vencimentos" && <Vencimentos />}
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

function Patrimonio() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", category: "OUTRO", location: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setAssets(await listAssets()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar patrimônio."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) { setFormError("Informe código e nome."); return; }
    setSaving(true); setFormError("");
    try {
      await createAsset(form);
      setOpen(false);
      setForm({ code: "", name: "", category: "OUTRO", location: "" });
      await reload();
      setToast("Item de patrimônio cadastrado.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao cadastrar item."); }
    finally { setSaving(false); }
  };

  const changeStatus = async (asset: Asset, status: string) => {
    try { await updateAssetStatus(asset.id, status); await reload(); setToast("Status atualizado."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar status."); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Patrimônio</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Novo item</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Código</TableCell><TableCell>Nome</TableCell><TableCell>Categoria</TableCell><TableCell>Local</TableCell><TableCell>Status</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && assets.length === 0 && <TableRow><TableCell colSpan={6}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhum item cadastrado ainda.</Typography></TableCell></TableRow>}
            {assets.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.code}</TableCell>
                <TableCell>{a.name}</TableCell>
                <TableCell>{a.category}</TableCell>
                <TableCell>{a.location || "—"}</TableCell>
                <TableCell><Chip size="small" label={a.status} color={a.status === "ATIVO" ? "success" : a.status === "MANUTENCAO" ? "warning" : "default"} /></TableCell>
                <TableCell align="right">
                  {a.status !== "MANUTENCAO" && <Button size="small" onClick={() => void changeStatus(a, "MANUTENCAO")}>Enviar p/ manutenção</Button>}
                  {a.status === "MANUTENCAO" && <Button size="small" color="success" onClick={() => void changeStatus(a, "ATIVO")}>Reativar</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo item de patrimônio</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField required label="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <TextField required label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField select label="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <MenuItem value="MOBILIARIO">Mobiliário</MenuItem>
            <MenuItem value="EQUIPAMENTO">Equipamento</MenuItem>
            <MenuItem value="VEICULO">Veículo</MenuItem>
            <MenuItem value="IMOVEL">Imóvel</MenuItem>
            <MenuItem value="TI">TI</MenuItem>
            <MenuItem value="OUTRO">Outro</MenuItem>
          </TextField>
          <TextField label="Local" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Cadastrar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Manutencao() {
  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", location: "", description: "", priority: "MEDIA" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setOrders(await listMaintenanceOrders()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar ordens de manutenção."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.title.trim()) { setFormError("Informe o título."); return; }
    setSaving(true); setFormError("");
    try {
      await createMaintenanceOrder(form);
      setOpen(false);
      setForm({ title: "", location: "", description: "", priority: "MEDIA" });
      await reload();
      setToast("Ordem de manutenção aberta.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao abrir ordem."); }
    finally { setSaving(false); }
  };

  const advance = async (order: MaintenanceOrder, status: string) => {
    try { await updateMaintenanceStatus(order.id, status); await reload(); setToast("Status atualizado."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar status."); }
  };

  const nextStatus: Record<string, string> = { ABERTA: "EM_ANDAMENTO", EM_ANDAMENTO: "CONCLUIDA" };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Ordens de manutenção</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nova ordem</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Título</TableCell><TableCell>Local</TableCell><TableCell>Prioridade</TableCell><TableCell>Status</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && orders.length === 0 && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma ordem aberta.</Typography></TableCell></TableRow>}
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{o.title}</TableCell>
                <TableCell>{o.location || "—"}</TableCell>
                <TableCell><Chip size="small" label={o.priority} color={o.priority === "URGENTE" ? "error" : o.priority === "ALTA" ? "warning" : "default"} /></TableCell>
                <TableCell><Chip size="small" label={o.status} color={o.status === "CONCLUIDA" ? "success" : "default"} /></TableCell>
                <TableCell align="right">
                  {nextStatus[o.status] && <Button size="small" onClick={() => void advance(o, nextStatus[o.status])}>Avançar para {nextStatus[o.status]}</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova ordem de manutenção</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField required label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField label="Local" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <TextField select label="Prioridade" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <MenuItem value="BAIXA">Baixa</MenuItem>
            <MenuItem value="MEDIA">Média</MenuItem>
            <MenuItem value="ALTA">Alta</MenuItem>
            <MenuItem value="URGENTE">Urgente</MenuItem>
          </TextField>
          <TextField label="Descrição" multiline minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Abrir ordem"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Estacionamento() {
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [students, setStudents] = useState<EduStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", type: "ALUNO" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSpotId, setAssignSpotId] = useState("");
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignError, setAssignError] = useState("");
  const [saving2, setSaving2] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setSpots(await listParkingSpots()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar vagas."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); listStudents().then(setStudents).catch(() => {}); }, []);

  const save = async () => {
    if (!form.code.trim()) { setFormError("Informe o código da vaga."); return; }
    setSaving(true); setFormError("");
    try {
      await createParkingSpot(form);
      setOpen(false);
      setForm({ code: "", type: "ALUNO" });
      await reload();
      setToast("Vaga cadastrada.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao cadastrar vaga."); }
    finally { setSaving(false); }
  };

  const openAssign = (spotId: string) => { setAssignSpotId(spotId); setAssignStudentId(""); setAssignError(""); setAssignOpen(true); };

  const saveAssign = async () => {
    if (!assignStudentId) { setAssignError("Selecione o aluno."); return; }
    setSaving2(true); setAssignError("");
    try {
      await assignParkingSpot(assignSpotId, { assignedToStudentId: assignStudentId });
      setAssignOpen(false);
      await reload();
      setToast("Vaga atribuída.");
    } catch (e) { setAssignError(e instanceof Error ? e.message : "Erro ao atribuir vaga."); }
    finally { setSaving2(false); }
  };

  const release = async (spot: ParkingSpot) => {
    try { await releaseParkingSpot(spot.id); await reload(); setToast("Vaga liberada."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao liberar vaga."); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Estacionamento</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nova vaga</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Código</TableCell><TableCell>Tipo</TableCell><TableCell>Ocupação</TableCell><TableCell>Atribuída a</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && spots.length === 0 && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma vaga cadastrada ainda.</Typography></TableCell></TableRow>}
            {spots.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.code}</TableCell>
                <TableCell>{s.type}</TableCell>
                <TableCell><Chip size="small" label={s.isOccupied ? "Ocupada" : "Livre"} color={s.isOccupied ? "warning" : "success"} /></TableCell>
                <TableCell>{s.assignedToStudent?.fullName || "—"}</TableCell>
                <TableCell align="right">
                  {!s.isOccupied && <Button size="small" onClick={() => openAssign(s.id)}>Atribuir</Button>}
                  {s.isOccupied && <Button size="small" color="warning" onClick={() => void release(s)}>Liberar</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova vaga de estacionamento</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField required label="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <TextField select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <MenuItem value="ALUNO">Aluno</MenuItem>
            <MenuItem value="PROFESSOR">Professor</MenuItem>
            <MenuItem value="VISITANTE">Visitante</MenuItem>
            <MenuItem value="PCD">PCD</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Cadastrar"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Atribuir vaga</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {assignError && <Alert severity="error">{assignError}</Alert>}
          <TextField select required label="Aluno" value={assignStudentId} onChange={(e) => setAssignStudentId(e.target.value)}>
            {students.map((s) => <MenuItem key={s.id} value={s.id}>{s.fullName}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving2} onClick={() => void saveAssign()}>{saving2 ? "Salvando…" : "Atribuir"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Vencimentos() {
  const [items, setItems] = useState<ExpiringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "OUTRO", title: "", expiresAt: "", preparationDays: 0, safetyMarginDays: 0 });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setItems(await listExpiringItems()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar vencimentos."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.title.trim() || !form.expiresAt) { setFormError("Informe título e data de vencimento."); return; }
    setSaving(true); setFormError("");
    try {
      await createExpiringItem({ ...form, expiresAt: new Date(form.expiresAt).toISOString() });
      setOpen(false);
      setForm({ category: "OUTRO", title: "", expiresAt: "", preparationDays: 0, safetyMarginDays: 0 });
      await reload();
      setToast("Item de vencimento cadastrado.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao cadastrar item."); }
    finally { setSaving(false); }
  };

  const resolve = async (item: ExpiringItem) => {
    try { await resolveExpiringItem(item.id); await reload(); setToast("Marcado como resolvido."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao resolver item."); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Vencimentos e alertas</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Novo item</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Título</TableCell><TableCell>Categoria</TableCell><TableCell>Vencimento</TableCell><TableCell>Status</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && items.length === 0 && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhum item cadastrado ainda.</Typography></TableCell></TableRow>}
            {items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.title}</TableCell>
                <TableCell>{i.category}</TableCell>
                <TableCell>{new Date(i.expiresAt).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell><Chip size="small" label={i.status} color={i.status === "RESOLVIDO" ? "success" : "warning"} /></TableCell>
                <TableCell align="right">
                  {i.status !== "RESOLVIDO" && <Button size="small" onClick={() => void resolve(i)}>Marcar como resolvido</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo item de vencimento</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField required label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField select label="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <MenuItem value="DOCUMENTO">Documento</MenuItem>
            <MenuItem value="EXTINTOR">Extintor</MenuItem>
            <MenuItem value="LICENCA">Licença</MenuItem>
            <MenuItem value="CONTRATO">Contrato</MenuItem>
            <MenuItem value="ATO_REGULATORIO">Ato regulatório</MenuItem>
            <MenuItem value="MATERIAL">Material</MenuItem>
            <MenuItem value="OUTRO">Outro</MenuItem>
          </TextField>
          <TextField required label="Data de vencimento" type="date" slotProps={{ inputLabel: { shrink: true } }} value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <TextField label="Dias de preparo" type="number" value={form.preparationDays} onChange={(e) => setForm({ ...form, preparationDays: Number(e.target.value) })} />
            <TextField label="Margem de segurança (dias)" type="number" value={form.safetyMarginDays} onChange={(e) => setForm({ ...form, safetyMarginDays: Number(e.target.value) })} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Cadastrar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
