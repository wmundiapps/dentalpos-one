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
import { listCurriculums, listPrograms, listTerms, type EduCurriculum, type EduProgram, type EduTerm } from "../services/EduApi";
import {
  convertApplicationToEnrollment,
  createAdmissionExam,
  listAdmissionExams,
  listApplications,
  publicApply,
  setApplicationScore,
  updateApplicationStatus,
  type AdmissionExam,
  type Application,
} from "../services/AdmissionApi";

type Secao = "processos" | "candidaturas";

const SECOES: { value: Secao; label: string }[] = [
  { value: "processos", label: "Processos seletivos" },
  { value: "candidaturas", label: "Candidaturas" },
];

export default function Admission() {
  const navigate = useNavigate();
  const secaoParam = (new URLSearchParams(window.location.search).get("secao") || "processos") as Secao;
  const secao = SECOES.some((s) => s.value === secaoParam) ? secaoParam : "processos";
  const setSecao = (value: Secao) => navigate(`/captacao?secao=${value}`);
  const [programs, setPrograms] = useState<EduProgram[]>([]);

  useEffect(() => { listPrograms().then(setPrograms).catch(() => {}); }, []);

  return (
    <Box>
      <PageHeader title="Captação e Ingresso" description="Processos seletivos (vestibular) e acompanhamento de candidaturas até a matrícula." />
      <Tabs value={secao} onChange={(_, value) => setSecao(value)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s.value} value={s.value} label={s.label} />)}
      </Tabs>
      {secao === "processos" && <Processos programs={programs} />}
      {secao === "candidaturas" && <Candidaturas programs={programs} />}
    </Box>
  );
}

function Processos({ programs }: { programs: EduProgram[] }) {
  const [exams, setExams] = useState<AdmissionExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ programId: "", name: "", modality: "PRESENCIAL", applicationStart: "", applicationEnd: "", vacancies: 40 });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyExamId, setApplyExamId] = useState("");
  const [applyForm, setApplyForm] = useState({ candidateName: "", candidateEmail: "", candidatePhone: "" });
  const [applyError, setApplyError] = useState("");
  const [applying, setApplying] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setExams(await listAdmissionExams()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar processos seletivos."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.programId || !form.name.trim() || !form.applicationStart || !form.applicationEnd) { setFormError("Preencha curso, nome e período de inscrição."); return; }
    setSaving(true); setFormError("");
    try {
      await createAdmissionExam({ ...form, applicationStart: new Date(form.applicationStart).toISOString(), applicationEnd: new Date(form.applicationEnd).toISOString() });
      setOpen(false);
      setForm({ programId: "", name: "", modality: "PRESENCIAL", applicationStart: "", applicationEnd: "", vacancies: 40 });
      await reload();
      setToast("Processo seletivo criado.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao criar processo."); }
    finally { setSaving(false); }
  };

  const openApply = (examId: string) => { setApplyExamId(examId); setApplyForm({ candidateName: "", candidateEmail: "", candidatePhone: "" }); setApplyError(""); setApplyOpen(true); };

  const submitApply = async () => {
    if (!applyForm.candidateName.trim() || !applyForm.candidateEmail.trim()) { setApplyError("Informe nome e e-mail do candidato."); return; }
    setApplying(true); setApplyError("");
    try {
      await publicApply(applyExamId, applyForm);
      setApplyOpen(false);
      setToast("Inscrição enviada (rota pública, a mesma usada por um candidato real). Veja em Candidaturas.");
    } catch (e) { setApplyError(e instanceof Error ? e.message : "Erro ao enviar inscrição."); }
    finally { setApplying(false); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Processos seletivos</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Novo processo</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Nome</TableCell><TableCell>Curso</TableCell><TableCell>Vagas</TableCell><TableCell>Inscrições até</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && exams.length === 0 && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhum processo seletivo criado ainda.</Typography></TableCell></TableRow>}
            {exams.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.name}</TableCell>
                <TableCell>{e.program?.name || programs.find((p) => p.id === e.programId)?.name || "—"}</TableCell>
                <TableCell>{e.vacancies}</TableCell>
                <TableCell>{new Date(e.applicationEnd).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell align="right"><Button size="small" onClick={() => openApply(e.id)}>Simular inscrição de candidato</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo processo seletivo</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField select required label="Curso" value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })}>
            {programs.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField required label="Nome do processo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField select label="Modalidade" value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })}>
            <MenuItem value="PRESENCIAL">Presencial</MenuItem>
            <MenuItem value="EAD">EAD</MenuItem>
          </TextField>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <TextField required label="Inscrições de" type="date" slotProps={{ inputLabel: { shrink: true } }} value={form.applicationStart} onChange={(e) => setForm({ ...form, applicationStart: e.target.value })} />
            <TextField required label="Inscrições até" type="date" slotProps={{ inputLabel: { shrink: true } }} value={form.applicationEnd} onChange={(e) => setForm({ ...form, applicationEnd: e.target.value })} />
          </Box>
          <TextField label="Vagas" type="number" value={form.vacancies} onChange={(e) => setForm({ ...form, vacancies: Number(e.target.value) })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Criar"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={applyOpen} onClose={() => setApplyOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Simular inscrição de candidato</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {applyError && <Alert severity="error">{applyError}</Alert>}
          <Alert severity="info">Usa a mesma rota pública que um candidato real usaria no formulário de inscrição (sem login).</Alert>
          <TextField required label="Nome do candidato" value={applyForm.candidateName} onChange={(e) => setApplyForm({ ...applyForm, candidateName: e.target.value })} />
          <TextField required label="E-mail" value={applyForm.candidateEmail} onChange={(e) => setApplyForm({ ...applyForm, candidateEmail: e.target.value })} />
          <TextField label="Telefone" value={applyForm.candidatePhone} onChange={(e) => setApplyForm({ ...applyForm, candidatePhone: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApplyOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={applying} onClick={() => void submitApply()}>{applying ? "Enviando…" : "Enviar inscrição"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Candidaturas({ programs }: { programs: EduProgram[] }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [convertOpen, setConvertOpen] = useState(false);
  const [convertAppId, setConvertAppId] = useState("");
  const [convertProgramId, setConvertProgramId] = useState("");
  const [curriculums, setCurriculums] = useState<EduCurriculum[]>([]);
  const [terms, setTerms] = useState<EduTerm[]>([]);
  const [convertForm, setConvertForm] = useState({ curriculumId: "", termId: "", monthlyFee: 0 });
  const [convertError, setConvertError] = useState("");
  const [converting, setConverting] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setApplications(await listApplications()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar candidaturas."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const score = async (app: Application, value: number) => {
    try { await setApplicationScore(app.id, value); await reload(); setToast("Nota registrada."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao registrar nota."); }
  };

  const advance = async (app: Application, status: string) => {
    try { await updateApplicationStatus(app.id, status); await reload(); setToast("Status atualizado."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar status."); }
  };

  const openConvert = async (app: Application, programId: string) => {
    setConvertAppId(app.id); setConvertProgramId(programId); setConvertError("");
    setConvertForm({ curriculumId: "", termId: "", monthlyFee: 0 });
    const [c, t] = await Promise.all([listCurriculums(programId), listTerms(programId)]);
    setCurriculums(c); setTerms(t);
    setConvertOpen(true);
  };

  const saveConvert = async () => {
    if (!convertForm.curriculumId || !convertForm.termId) { setConvertError("Selecione a matriz curricular e o período letivo."); return; }
    setConverting(true); setConvertError("");
    try {
      await convertApplicationToEnrollment(convertAppId, convertForm);
      setConvertOpen(false);
      await reload();
      setToast("Candidato matriculado.");
    } catch (e) { setConvertError(e instanceof Error ? e.message : "Erro ao converter em matrícula."); }
    finally { setConverting(false); }
  };

  const nextStatus: Record<string, string> = { INSCRITO: "CONFIRMADO", CONFIRMADO: "CLASSIFICADO" };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Candidaturas</Typography>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Candidato</TableCell><TableCell>Processo</TableCell><TableCell>Nota</TableCell><TableCell>Status</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && applications.length === 0 && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma candidatura ainda.</Typography></TableCell></TableRow>}
            {applications.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.candidateName}</TableCell>
                <TableCell>{a.admissionExam?.name || a.admissionExamId}</TableCell>
                <TableCell>
                  {a.score ?? "—"}{" "}
                  {a.score == null && <Button size="small" onClick={() => void score(a, 700)}>Lançar nota (700)</Button>}
                </TableCell>
                <TableCell><Chip size="small" label={a.status} color={a.status === "MATRICULADO" ? "success" : "default"} /></TableCell>
                <TableCell align="right">
                  {nextStatus[a.status] && <Button size="small" onClick={() => void advance(a, nextStatus[a.status])}>Avançar</Button>}
                  {a.status === "CLASSIFICADO" && (
                    <Button size="small" color="success" onClick={() => void openConvert(a, "")}>Matricular</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={convertOpen} onClose={() => setConvertOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Converter em matrícula</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {convertError && <Alert severity="error">{convertError}</Alert>}
          <TextField select label="Curso" value={convertProgramId} onChange={async (e) => {
            setConvertProgramId(e.target.value);
            const [c, t] = await Promise.all([listCurriculums(e.target.value), listTerms(e.target.value)]);
            setCurriculums(c); setTerms(t);
          }}>
            {programs.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField select required label="Matriz curricular" value={convertForm.curriculumId} onChange={(e) => setConvertForm({ ...convertForm, curriculumId: e.target.value })}>
            {curriculums.map((c) => <MenuItem key={c.id} value={c.id}>{c.name} ({c.version})</MenuItem>)}
          </TextField>
          <TextField select required label="Período letivo" value={convertForm.termId} onChange={(e) => setConvertForm({ ...convertForm, termId: e.target.value })}>
            {terms.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <TextField label="Mensalidade (R$)" type="number" value={convertForm.monthlyFee} onChange={(e) => setConvertForm({ ...convertForm, monthlyFee: Number(e.target.value) })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConvertOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={converting} onClick={() => void saveConvert()}>{converting ? "Matriculando…" : "Matricular"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
