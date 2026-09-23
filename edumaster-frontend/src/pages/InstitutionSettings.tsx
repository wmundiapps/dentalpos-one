import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Avatar,
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
  Switch,
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
import PlaceIcon from "@mui/icons-material/Place";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PageHeader from "../components/PageHeader";
import {
  createCampus,
  getInstitutionProfile,
  listCampuses,
  osmEmbedUrl,
  osmViewUrl,
  updateCampus,
  updateInstitutionProfile,
  type Campus,
  type InstitutionProfile,
} from "../services/InstitutionApi";

type Secao = "identidade" | "unidades";

const SECOES: { value: Secao; label: string }[] = [
  { value: "identidade", label: "Identidade e marca" },
  { value: "unidades", label: "Unidades e polos" },
];

export default function InstitutionSettings() {
  const navigate = useNavigate();
  const secaoParam = (new URLSearchParams(window.location.search).get("secao") || "identidade") as Secao;
  const secao = SECOES.some((s) => s.value === secaoParam) ? secaoParam : "identidade";
  const setSecao = (value: Secao) => navigate(`/configuracoes?secao=${value}`);

  return (
    <Box>
      <PageHeader
        title="Personalização institucional"
        description="Marca, identidade visual, contato oficial e unidades/polos exibidos em todas as telas e no rodapé."
      />

      <Tabs value={secao} onChange={(_, value) => setSecao(value)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s.value} value={s.value} label={s.label} />)}
      </Tabs>

      {secao === "identidade" && <Identidade />}
      {secao === "unidades" && <Unidades />}
    </Box>
  );
}

function Identidade() {
  const [form, setForm] = useState<Partial<InstitutionProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getInstitutionProfile();
      setForm(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar identidade institucional.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const field = (key: keyof InstitutionProfile) => ({
    value: (form[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await updateInstitutionProfile(form);
      setForm(updated);
      setToast("Identidade institucional salva.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar identidade institucional.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography color="text.secondary">Carregando…</Typography>;

  return (
    <Box sx={{ display: "grid", gap: 3, maxWidth: 760 }}>
      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, display: "grid", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar src={form.logo || undefined} variant="rounded" sx={{ width: 64, height: 64, bgcolor: "primary.main" }}>
            {(form.displayName || form.name || "?").slice(0, 1)}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Logomarca</Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="https://…/logo.png"
              helperText="URL pública da imagem. Aparece no cabeçalho de todas as telas e no rodapé."
              sx={{ mt: 0.5 }}
              {...field("logo")}
            />
          </Box>
        </Box>

        <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Razão social e contato</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          <TextField label="Razão social" {...field("name")} />
          <TextField label="Nome fantasia" {...field("displayName")} />
          <TextField label="CNPJ" {...field("cnpj")} />
          <TextField label="Telefone" {...field("phone")} />
          <TextField label="E-mail institucional" {...field("email")} />
          <TextField label="Site" placeholder="https://…" {...field("site")} />
        </Box>

        <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Endereço da sede</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr 1fr" }, gap: 2 }}>
          <TextField label="Endereço" {...field("address")} />
          <TextField label="Cidade" {...field("city")} />
          <TextField label="UF" {...field("state")} />
          <TextField label="CEP" {...field("zipCode")} />
        </Box>

        <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Fale conosco e ouvidoria</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          <TextField label="Link de fale conosco" placeholder="https://…" {...field("contactUrl")} />
          <TextField label="E-mail da ouvidoria" {...field("ombudsmanEmail")} />
          <TextField label="Telefone da ouvidoria" {...field("ombudsmanPhone")} />
        </Box>

        <Box>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>
            {saving ? "Salvando…" : "Salvar identidade"}
          </Button>
        </Box>
      </Paper>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

const emptyCampusForm: Partial<Campus> = { name: "", type: "POLO", addressStreet: "", addressCity: "", addressState: "", addressZip: "", phone: "", email: "", mapLat: -23.55052, mapLng: -46.633308 };

function Unidades() {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campus | null>(null);
  const [form, setForm] = useState<Partial<Campus>>(emptyCampusForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      setCampuses(await listCampuses());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar unidades e polos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyCampusForm); setFormError(""); setOpen(true); };
  const openEdit = (campus: Campus) => { setEditing(campus); setForm(campus); setFormError(""); setOpen(true); };

  const save = async () => {
    if (!form.name || !form.name.trim()) { setFormError("Informe o nome da unidade."); return; }
    setSaving(true); setFormError("");
    try {
      if (editing) await updateCampus(editing.id, form);
      else await createCampus(form);
      setOpen(false);
      await reload();
      setToast(editing ? "Unidade atualizada." : "Unidade cadastrada.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao salvar unidade.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (campus: Campus) => {
    try {
      await updateCampus(campus.id, { isActive: !campus.isActive });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar unidade.");
    }
  };

  const field = (key: keyof Campus) => ({
    value: (form[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Unidades e polos educacionais</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Nova unidade</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Cidade/UF</TableCell>
              <TableCell>Contato</TableCell>
              <TableCell>Mapa</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && campuses.length === 0 && (
              <TableRow><TableCell colSpan={7}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma unidade cadastrada ainda.</Typography></TableCell></TableRow>
            )}
            {campuses.map((c) => (
              <TableRow key={c.id} hover>
                <TableCell>{c.name}</TableCell>
                <TableCell><Chip size="small" label={c.type === "SEDE" ? "Sede" : "Polo"} color={c.type === "SEDE" ? "primary" : "default"} /></TableCell>
                <TableCell>{[c.addressCity, c.addressState].filter(Boolean).join("/") || "—"}</TableCell>
                <TableCell>{c.phone || c.email || "—"}</TableCell>
                <TableCell>
                  {c.mapLat != null && c.mapLng != null ? (
                    <Button size="small" startIcon={<PlaceIcon />} endIcon={<OpenInNewIcon fontSize="small" />} href={osmViewUrl(c.mapLat, c.mapLng)} target="_blank" rel="noreferrer">
                      Ver no mapa
                    </Button>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <Switch size="small" checked={c.isActive} onChange={() => void toggleActive(c)} />
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openEdit(c)}>Editar</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Editar unidade" : "Nova unidade"}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField required label="Nome" {...field("name")} />
          <TextField select label="Tipo" value={form.type || "POLO"} onChange={(e) => setForm({ ...form, type: e.target.value as Campus["type"] })}>
            <MenuItem value="SEDE">Sede</MenuItem>
            <MenuItem value="POLO">Polo</MenuItem>
          </TextField>
          <TextField label="Endereço" {...field("addressStreet")} />
          <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 2 }}>
            <TextField label="Cidade" {...field("addressCity")} />
            <TextField label="UF" {...field("addressState")} />
            <TextField label="CEP" {...field("addressZip")} />
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <TextField label="Telefone" {...field("phone")} />
            <TextField label="E-mail" {...field("email")} />
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <TextField
              label="Latitude"
              type="number"
              value={form.mapLat ?? ""}
              onChange={(e) => setForm({ ...form, mapLat: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
            <TextField
              label="Longitude"
              type="number"
              value={form.mapLng ?? ""}
              onChange={(e) => setForm({ ...form, mapLng: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </Box>
          {form.mapLat != null && form.mapLng != null && (
            <Box sx={{ borderRadius: 2, overflow: "hidden", border: "1px solid", borderColor: "divider", height: 220 }}>
              <iframe
                title="Pré-visualização do mapa"
                src={osmEmbedUrl(Number(form.mapLat), Number(form.mapLng))}
                style={{ width: "100%", height: "100%", border: 0 }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Salvar unidade"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
