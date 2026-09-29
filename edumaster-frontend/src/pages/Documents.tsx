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
import { listStudents, type EduStudent } from "../services/EduApi";
import {
  createCertificate,
  createDocumentRequest,
  listCertificates,
  listDocumentRequests,
  updateDocumentRequestStatus,
  type Certificate,
  type DocumentRequest,
} from "../services/DocumentApi";

type Secao = "solicitacoes" | "certificados";

const SECOES: { value: Secao; label: string }[] = [
  { value: "solicitacoes", label: "Solicitações de documentos" },
  { value: "certificados", label: "Certificados e diplomas" },
];

const STATUS_COLOR: Record<string, "default" | "warning" | "success" | "error"> = {
  SOLICITADO: "default", EM_ANALISE: "warning", PRONTO: "success", ENTREGUE: "success", RECUSADO: "error",
};

export default function Documents() {
  const navigate = useNavigate();
  const secaoParam = (new URLSearchParams(window.location.search).get("secao") || "solicitacoes") as Secao;
  const secao = SECOES.some((s) => s.value === secaoParam) ? secaoParam : "solicitacoes";
  const setSecao = (value: Secao) => navigate(`/documentos?secao=${value}`);
  const [students, setStudents] = useState<EduStudent[]>([]);

  useEffect(() => { listStudents().then(setStudents).catch(() => {}); }, []);

  return (
    <Box>
      <PageHeader title="Protocolo e Certificados" description="Solicitações de documentos da secretaria e emissão de certificados/diplomas com verificação pública." />

      <Tabs value={secao} onChange={(_, value) => setSecao(value)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s.value} value={s.value} label={s.label} />)}
      </Tabs>

      {secao === "solicitacoes" && <Solicitacoes students={students} />}
      {secao === "certificados" && <Certificados students={students} />}
    </Box>
  );
}

function Solicitacoes({ students }: { students: EduStudent[] }) {
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ studentId: "", type: "DECLARACAO_MATRICULA", deliveryMethod: "DIGITAL", notes: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setRequests(await listDocumentRequests()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar solicitações."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.studentId) { setFormError("Selecione o aluno."); return; }
    setSaving(true); setFormError("");
    try {
      await createDocumentRequest(form.studentId, { type: form.type, deliveryMethod: form.deliveryMethod, notes: form.notes || undefined });
      setOpen(false);
      setForm({ studentId: "", type: "DECLARACAO_MATRICULA", deliveryMethod: "DIGITAL", notes: "" });
      await reload();
      setToast("Solicitação registrada.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao registrar solicitação."); }
    finally { setSaving(false); }
  };

  const advance = async (request: DocumentRequest, status: string) => {
    try { await updateDocumentRequestStatus(request.id, { status }); await reload(); setToast("Status atualizado."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar status."); }
  };

  const nextStatus: Record<string, string> = { SOLICITADO: "EM_ANALISE", EM_ANALISE: "PRONTO", PRONTO: "ENTREGUE" };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Solicitações</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nova solicitação</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>Tipo</TableCell><TableCell>Entrega</TableCell><TableCell>Status</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && requests.length === 0 && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma solicitação ainda.</Typography></TableCell></TableRow>}
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.student?.fullName || r.studentId}</TableCell>
                <TableCell>{r.type}</TableCell>
                <TableCell>{r.deliveryMethod}</TableCell>
                <TableCell><Chip size="small" label={r.status} color={STATUS_COLOR[r.status] || "default"} /></TableCell>
                <TableCell align="right">
                  {nextStatus[r.status] && <Button size="small" onClick={() => void advance(r, nextStatus[r.status])}>Avançar para {nextStatus[r.status]}</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova solicitação de documento</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField select required label="Aluno" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
            {students.map((s) => <MenuItem key={s.id} value={s.id}>{s.fullName}</MenuItem>)}
          </TextField>
          <TextField select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <MenuItem value="HISTORICO">Histórico</MenuItem>
            <MenuItem value="DECLARACAO_MATRICULA">Declaração de matrícula</MenuItem>
            <MenuItem value="DECLARACAO_CONCLUSAO">Declaração de conclusão</MenuItem>
            <MenuItem value="CERTIFICADO">Certificado</MenuItem>
            <MenuItem value="DIPLOMA">Diploma</MenuItem>
            <MenuItem value="OUTRO">Outro</MenuItem>
          </TextField>
          <TextField select label="Entrega" value={form.deliveryMethod} onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value })}>
            <MenuItem value="DIGITAL">Digital</MenuItem>
            <MenuItem value="PRESENCIAL">Presencial</MenuItem>
          </TextField>
          <TextField label="Observações" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

function Certificados({ students }: { students: EduStudent[] }) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ studentId: "", type: "CERTIFICADO_CONCLUSAO", title: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setCertificates(await listCertificates()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar certificados."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.studentId || !form.title.trim()) { setFormError("Selecione o aluno e informe o título."); return; }
    setSaving(true); setFormError("");
    try {
      await createCertificate(form);
      setOpen(false);
      setForm({ studentId: "", type: "CERTIFICADO_CONCLUSAO", title: "" });
      await reload();
      setToast("Certificado emitido.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao emitir certificado."); }
    finally { setSaving(false); }
  };

  const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
  const verifyUrl = (code: string) => `${API}/edu/certificates/verify/${code}`;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Certificados emitidos</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Emitir certificado</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>Tipo</TableCell><TableCell>Título</TableCell><TableCell>Código de verificação</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && certificates.length === 0 && <TableRow><TableCell colSpan={4}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhum certificado emitido ainda.</Typography></TableCell></TableRow>}
            {certificates.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.student?.fullName || c.studentId}</TableCell>
                <TableCell>{c.type}</TableCell>
                <TableCell>{c.title}</TableCell>
                <TableCell>
                  <Chip size="small" label={c.verificationCode} component="a" href={verifyUrl(c.verificationCode)} target="_blank" clickable />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Emitir certificado</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField select required label="Aluno" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
            {students.map((s) => <MenuItem key={s.id} value={s.id}>{s.fullName}</MenuItem>)}
          </TextField>
          <TextField select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <MenuItem value="CERTIFICADO_CONCLUSAO">Certificado de conclusão</MenuItem>
            <MenuItem value="DIPLOMA">Diploma</MenuItem>
            <MenuItem value="CERTIFICADO_PARTICIPACAO">Certificado de participação</MenuItem>
          </TextField>
          <TextField required label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Emitindo…" : "Emitir"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
