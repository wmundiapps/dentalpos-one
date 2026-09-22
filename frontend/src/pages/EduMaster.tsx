import { useEffect, useMemo, useState } from "react";
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
  addCurriculumSubject,
  activateStudentAccess,
  createClass,
  createCurriculum,
  createEnrollment,
  createProgram,
  createStudent,
  createSubject,
  createTerm,
  enrollStudentInClass,
  listClasses,
  listCurriculums,
  listEnrollments,
  listPrograms,
  listStudents,
  listSubjects,
  listTerms,
  type EduClass,
  type EduCurriculum,
  type EduEnrollment,
  type EduProgram,
  type EduStudent,
  type EduSubject,
  type EduTerm,
} from "../services/EduApi";

type Secao = "visao-geral" | "programas" | "disciplinas" | "matriz" | "periodos" | "turmas" | "alunos" | "matriculas";

const SECOES: { value: Secao; label: string }[] = [
  { value: "visao-geral", label: "Visão geral" },
  { value: "programas", label: "Programas" },
  { value: "disciplinas", label: "Disciplinas" },
  { value: "matriz", label: "Matriz curricular" },
  { value: "periodos", label: "Períodos letivos" },
  { value: "turmas", label: "Turmas" },
  { value: "alunos", label: "Alunos" },
  { value: "matriculas", label: "Matrículas" },
];

function useEduData() {
  const [programs, setPrograms] = useState<EduProgram[]>([]);
  const [subjects, setSubjects] = useState<EduSubject[]>([]);
  const [curriculums, setCurriculums] = useState<EduCurriculum[]>([]);
  const [terms, setTerms] = useState<EduTerm[]>([]);
  const [students, setStudents] = useState<EduStudent[]>([]);
  const [enrollments, setEnrollments] = useState<EduEnrollment[]>([]);
  const [classes, setClasses] = useState<EduClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const [p, s, c, t, st, e, cl] = await Promise.all([
        listPrograms(), listSubjects(), listCurriculums(), listTerms(), listStudents(), listEnrollments(), listClasses(),
      ]);
      setPrograms(p); setSubjects(s); setCurriculums(c); setTerms(t); setStudents(st); setEnrollments(e); setClasses(cl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar dados do EduMaster.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  return { programs, subjects, curriculums, terms, students, enrollments, classes, loading, error, reload };
}

export default function EduMaster() {
  const navigate = useNavigate();
  const secaoParam = (new URLSearchParams(window.location.search).get("secao") || "visao-geral") as Secao;
  const secao = SECOES.some((s) => s.value === secaoParam) ? secaoParam : "visao-geral";
  const data = useEduData();

  const setSecao = (value: Secao) => navigate(`/edumaster${value === "visao-geral" ? "" : `?secao=${value}`}`);

  return (
    <Box>
      <PageHeader title="EduMaster Pro" description="Gestão acadêmica de ponta a ponta — do cadastro do programa à matrícula do aluno." />

      {data.error && (
        <Alert severity="error" sx={{ mb: 2 }}>{data.error}</Alert>
      )}

      <Tabs value={secao} onChange={(_, value) => setSecao(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s.value} value={s.value} label={s.label} />)}
      </Tabs>

      {secao === "visao-geral" && <VisaoGeral {...data} />}
      {secao === "programas" && <Programas {...data} />}
      {secao === "disciplinas" && <Disciplinas {...data} />}
      {secao === "matriz" && <Matriz {...data} />}
      {secao === "periodos" && <Periodos {...data} />}
      {secao === "turmas" && <Turmas {...data} />}
      {secao === "alunos" && <Alunos {...data} />}
      {secao === "matriculas" && <Matriculas {...data} />}
    </Box>
  );
}

type DataProps = ReturnType<typeof useEduData>;

function VisaoGeral({ programs, subjects, curriculums, terms, students, enrollments, classes, loading }: DataProps) {
  const cards = [
    ["Programas", programs.length],
    ["Disciplinas", subjects.length],
    ["Matrizes curriculares", curriculums.length],
    ["Períodos letivos", terms.length],
    ["Turmas", classes.length],
    ["Alunos", students.length],
    ["Matrículas ativas", enrollments.filter((e) => e.status === "ATIVA").length],
  ] as const;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,1fr)", md: "repeat(4,1fr)" }, gap: 1.5 }}>
      {cards.map(([label, value]) => (
        <Paper key={label} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography variant="h4" sx={{ fontWeight: 900 }}>{loading ? "…" : value}</Typography>
        </Paper>
      ))}
    </Box>
  );
}

function SectionShell({ title, actionLabel, onAction, children }: { title: string; actionLabel: string; onAction: () => void; children: React.ReactNode }) {
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={onAction}>{actionLabel}</Button>
      </Box>
      {children}
    </Box>
  );
}

function Programas({ programs, reload }: DataProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", code: "", level: "GRADUACAO", modality: "PRESENCIAL", totalTerms: 8 });

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return;
    setSaving(true); setError("");
    try {
      await createProgram(form as any);
      setOpen(false);
      setForm({ name: "", code: "", level: "GRADUACAO", modality: "PRESENCIAL", totalTerms: 8 });
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  };

  return (
    <SectionShell title="Programas" actionLabel="Novo programa" onAction={() => setOpen(true)}>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Nome</TableCell><TableCell>Código</TableCell><TableCell>Nível</TableCell><TableCell>Modalidade</TableCell><TableCell>Períodos</TableCell></TableRow></TableHead>
          <TableBody>
            {programs.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.name}</TableCell><TableCell>{p.code}</TableCell><TableCell>{p.level}</TableCell><TableCell>{p.modality}</TableCell><TableCell>{p.totalTerms}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo programa</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField required label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField required label="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <TextField select label="Nível" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
            {["GRADUACAO", "POS_LATO", "POS_STRICTO", "TECNICO", "LIVRE"].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </TextField>
          <TextField select label="Modalidade" value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })}>
            {["PRESENCIAL", "EAD", "HIBRIDO"].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </TextField>
          <TextField type="number" label="Total de períodos" value={form.totalTerms} onChange={(e) => setForm({ ...form, totalTerms: Number(e.target.value) })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </Dialog>
    </SectionShell>
  );
}

function Disciplinas({ subjects, reload }: DataProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", code: "", workloadHours: 60 });

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return;
    setSaving(true); setError("");
    try {
      await createSubject(form);
      setOpen(false);
      setForm({ name: "", code: "", workloadHours: 60 });
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  };

  return (
    <SectionShell title="Disciplinas" actionLabel="Nova disciplina" onAction={() => setOpen(true)}>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Nome</TableCell><TableCell>Código</TableCell><TableCell>Carga horária</TableCell></TableRow></TableHead>
          <TableBody>
            {subjects.map((s) => <TableRow key={s.id}><TableCell>{s.name}</TableCell><TableCell>{s.code}</TableCell><TableCell>{s.workloadHours}h</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova disciplina</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField required label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField required label="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <TextField type="number" label="Carga horária (h)" value={form.workloadHours} onChange={(e) => setForm({ ...form, workloadHours: Number(e.target.value) })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </Dialog>
    </SectionShell>
  );
}

function Matriz({ programs, subjects, curriculums, reload }: DataProps) {
  const [open, setOpen] = useState(false);
  const [addSubjectFor, setAddSubjectFor] = useState<EduCurriculum | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ programId: "", version: "", name: "" });
  const [subjectForm, setSubjectForm] = useState({ subjectId: "", termNumber: 1, workloadHours: 60 });

  const save = async () => {
    if (!form.programId || !form.version.trim() || !form.name.trim()) return;
    setSaving(true); setError("");
    try {
      await createCurriculum(form);
      setOpen(false);
      setForm({ programId: "", version: "", name: "" });
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  };

  const saveSubject = async () => {
    if (!addSubjectFor || !subjectForm.subjectId) return;
    setSaving(true); setError("");
    try {
      await addCurriculumSubject(addSubjectFor.id, subjectForm);
      setAddSubjectFor(null);
      setSubjectForm({ subjectId: "", termNumber: 1, workloadHours: 60 });
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao incluir disciplina."); }
    finally { setSaving(false); }
  };

  const programName = (id: string) => programs.find((p) => p.id === id)?.name || id;

  return (
    <SectionShell title="Matriz curricular" actionLabel="Nova matriz" onAction={() => setOpen(true)}>
      {curriculums.map((c) => (
        <Paper key={c.id} variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Typography sx={{ fontWeight: 800 }}>{c.name} <Chip size="small" label={`v${c.version}`} sx={{ ml: 1 }} /></Typography>
              <Typography variant="body2" color="text.secondary">{programName(c.programId)}</Typography>
            </Box>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setAddSubjectFor(c)}>Incluir disciplina</Button>
          </Box>
          <Table size="small" sx={{ mt: 1 }}>
            <TableHead><TableRow><TableCell>Período</TableCell><TableCell>Disciplina</TableCell><TableCell>Carga horária</TableCell></TableRow></TableHead>
            <TableBody>
              {c.subjects.sort((a, b) => a.termNumber - b.termNumber).map((cs) => (
                <TableRow key={cs.id}><TableCell>{cs.termNumber}º</TableCell><TableCell>{cs.subject.name}</TableCell><TableCell>{cs.workloadHours}h</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ))}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova matriz curricular</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select required label="Programa" value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })}>
            {programs.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField required label="Versão" placeholder="2026.1" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
          <TextField required label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(addSubjectFor)} onClose={() => setAddSubjectFor(null)} fullWidth maxWidth="sm">
        <DialogTitle>Incluir disciplina na matriz</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select required label="Disciplina" value={subjectForm.subjectId} onChange={(e) => setSubjectForm({ ...subjectForm, subjectId: e.target.value })}>
            {subjects.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </TextField>
          <TextField type="number" label="Período (nº)" value={subjectForm.termNumber} onChange={(e) => setSubjectForm({ ...subjectForm, termNumber: Number(e.target.value) })} />
          <TextField type="number" label="Carga horária (h)" value={subjectForm.workloadHours} onChange={(e) => setSubjectForm({ ...subjectForm, workloadHours: Number(e.target.value) })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddSubjectFor(null)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={saveSubject}>{saving ? "Salvando..." : "Incluir"}</Button>
        </DialogActions>
      </Dialog>
    </SectionShell>
  );
}

function Periodos({ programs, terms, reload }: DataProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ programId: "", name: "", type: "SEMESTRE", startDate: "", endDate: "" });

  const save = async () => {
    if (!form.programId || !form.name.trim() || !form.startDate || !form.endDate) return;
    setSaving(true); setError("");
    try {
      await createTerm({ ...form, startDate: new Date(form.startDate).toISOString(), endDate: new Date(form.endDate).toISOString() });
      setOpen(false);
      setForm({ programId: "", name: "", type: "SEMESTRE", startDate: "", endDate: "" });
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  };

  const programName = (id: string) => programs.find((p) => p.id === id)?.name || id;

  return (
    <SectionShell title="Períodos letivos" actionLabel="Novo período" onAction={() => setOpen(true)}>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Programa</TableCell><TableCell>Nome</TableCell><TableCell>Tipo</TableCell><TableCell>Início</TableCell><TableCell>Fim</TableCell></TableRow></TableHead>
          <TableBody>
            {terms.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{programName(t.programId)}</TableCell><TableCell>{t.name}</TableCell><TableCell>{t.type}</TableCell>
                <TableCell>{t.startDate.slice(0, 10)}</TableCell><TableCell>{t.endDate.slice(0, 10)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo período letivo</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select required label="Programa" value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })}>
            {programs.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField required label="Nome" placeholder="2026/2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {["BIMESTRE", "TRIMESTRE", "SEMESTRE", "ANUAL"].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </TextField>
          <TextField type="date" required label="Início" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" required label="Fim" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </Dialog>
    </SectionShell>
  );
}

function Turmas({ programs, curriculums, terms, classes, reload }: DataProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ programId: "", curriculumSubjectId: "", termId: "", code: "", capacity: 40 });

  const curriculumSubjects = useMemo(
    () => curriculums.filter((c) => c.programId === form.programId).flatMap((c) => c.subjects),
    [curriculums, form.programId],
  );

  const save = async () => {
    if (!form.programId || !form.curriculumSubjectId || !form.termId || !form.code.trim()) return;
    setSaving(true); setError("");
    try {
      await createClass(form);
      setOpen(false);
      setForm({ programId: "", curriculumSubjectId: "", termId: "", code: "", capacity: 40 });
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  };

  const programName = (id: string) => programs.find((p) => p.id === id)?.name || id;

  return (
    <SectionShell title="Turmas" actionLabel="Nova turma" onAction={() => setOpen(true)}>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Código</TableCell><TableCell>Programa</TableCell><TableCell>Disciplina</TableCell><TableCell>Vagas</TableCell></TableRow></TableHead>
          <TableBody>
            {classes.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.code}</TableCell><TableCell>{programName(c.programId)}</TableCell>
                <TableCell>{c.curriculumSubject?.subject?.name || "—"}</TableCell>
                <TableCell>{c.enrolledCount ?? 0}/{c.capacity}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova turma</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select required label="Programa" value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value, curriculumSubjectId: "" })}>
            {programs.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField select required label="Disciplina (da matriz)" value={form.curriculumSubjectId} onChange={(e) => setForm({ ...form, curriculumSubjectId: e.target.value })} disabled={!form.programId}>
            {curriculumSubjects.map((cs) => <MenuItem key={cs.id} value={cs.id}>{cs.subject.name}</MenuItem>)}
          </TextField>
          <TextField select required label="Período letivo" value={form.termId} onChange={(e) => setForm({ ...form, termId: e.target.value })}>
            {terms.filter((t) => t.programId === form.programId).map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <TextField required label="Código da turma" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <TextField type="number" label="Vagas" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </Dialog>
    </SectionShell>
  );
}

function Alunos({ students, reload }: DataProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ fullName: "", email: "", phone: "" });
  const [activation, setActivation] = useState<{ studentId: string; url: string; delivered: boolean } | null>(null);

  const save = async () => {
    if (!form.fullName.trim() || !form.email.trim()) return;
    setSaving(true); setError("");
    try {
      await createStudent(form);
      setOpen(false);
      setForm({ fullName: "", email: "", phone: "" });
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  };

  const activate = async (student: EduStudent) => {
    setError("");
    try {
      const result = await activateStudentAccess(student.id);
      setActivation({ studentId: student.id, url: result.activationUrl, delivered: result.delivered });
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao ativar acesso."); }
  };

  return (
    <SectionShell title="Alunos" actionLabel="Novo aluno" onAction={() => setOpen(true)}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {activation && (
        <Alert severity={activation.delivered ? "success" : "info"} onClose={() => setActivation(null)} sx={{ mb: 2, wordBreak: "break-all" }}>
          {activation.delivered ? "E-mail de ativação enviado." : "Sem canal de e-mail configurado — copie e envie este link ao aluno:"}
          {!activation.delivered && <><br /><code>{activation.url}</code></>}
        </Alert>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Nome</TableCell><TableCell>E-mail</TableCell><TableCell>Status</TableCell><TableCell>Acesso</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {students.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.fullName}</TableCell><TableCell>{s.email}</TableCell><TableCell>{s.status}</TableCell>
                <TableCell>{s.userId ? <Chip size="small" color="success" label="Ativo" /> : <Chip size="small" label="Sem login" />}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => activate(s)}>{s.userId ? "Reenviar link" : "Ativar acesso"}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo aluno</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField required label="Nome completo" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <TextField required label="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <TextField label="Telefone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </Dialog>
    </SectionShell>
  );
}

function Matriculas({ programs, curriculums, terms, students, classes, enrollments, reload }: DataProps) {
  const [open, setOpen] = useState(false);
  const [classDialog, setClassDialog] = useState<EduEnrollment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ studentId: "", programId: "", curriculumId: "", termId: "", monthlyFee: "" });
  const [classForm, setClassForm] = useState({ classId: "" });

  const save = async () => {
    if (!form.studentId || !form.programId || !form.curriculumId || !form.termId) return;
    setSaving(true); setError("");
    try {
      await createEnrollment({
        studentId: form.studentId, programId: form.programId, curriculumId: form.curriculumId, termId: form.termId,
        ...(form.monthlyFee ? { monthlyFee: Number(form.monthlyFee) } : {}),
      });
      setOpen(false);
      setForm({ studentId: "", programId: "", curriculumId: "", termId: "", monthlyFee: "" });
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao efetivar matrícula."); }
    finally { setSaving(false); }
  };

  const saveClassEnrollment = async () => {
    if (!classDialog || !classForm.classId) return;
    setSaving(true); setError("");
    try {
      await enrollStudentInClass(classForm.classId, { studentId: classDialog.studentId, enrollmentId: classDialog.id });
      setClassDialog(null);
      setClassForm({ classId: "" });
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao matricular na turma."); }
    finally { setSaving(false); }
  };

  const studentName = (id: string) => students.find((s) => s.id === id)?.fullName || id;
  const programName = (id: string) => programs.find((p) => p.id === id)?.name || id;

  return (
    <SectionShell title="Matrículas" actionLabel="Nova matrícula" onAction={() => setOpen(true)}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Nº matrícula</TableCell><TableCell>Aluno</TableCell><TableCell>Programa</TableCell><TableCell>Status</TableCell><TableCell>Mensalidade</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {enrollments.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.enrollmentNumber}</TableCell><TableCell>{studentName(e.studentId)}</TableCell><TableCell>{programName(e.programId)}</TableCell>
                <TableCell><Chip size="small" label={e.status} /></TableCell>
                <TableCell>{e.monthlyFee ? `R$ ${e.monthlyFee.toFixed(2)}` : "—"}</TableCell>
                <TableCell align="right"><Button size="small" onClick={() => setClassDialog(e)}>Matricular em turma</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova matrícula</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField select required label="Aluno" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
            {students.map((s) => <MenuItem key={s.id} value={s.id}>{s.fullName}</MenuItem>)}
          </TextField>
          <TextField select required label="Programa" value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value, curriculumId: "", termId: "" })}>
            {programs.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField select required label="Matriz curricular" value={form.curriculumId} onChange={(e) => setForm({ ...form, curriculumId: e.target.value })} disabled={!form.programId}>
            {curriculums.filter((c) => c.programId === form.programId).map((c) => <MenuItem key={c.id} value={c.id}>{c.name} (v{c.version})</MenuItem>)}
          </TextField>
          <TextField select required label="Período letivo" value={form.termId} onChange={(e) => setForm({ ...form, termId: e.target.value })} disabled={!form.programId}>
            {terms.filter((t) => t.programId === form.programId).map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <TextField type="number" label="Mensalidade (R$, opcional)" value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Efetivar matrícula"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(classDialog)} onClose={() => setClassDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>Matricular {classDialog ? studentName(classDialog.studentId) : ""} em turma</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField select required label="Turma" value={classForm.classId} onChange={(e) => setClassForm({ classId: e.target.value })}>
            {classes.filter((c) => c.programId === classDialog?.programId).map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.code} — {c.curriculumSubject?.subject?.name} ({(c.vacancies ?? c.capacity)} vagas)</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClassDialog(null)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={saveClassEnrollment}>{saving ? "Salvando..." : "Matricular"}</Button>
        </DialogActions>
      </Dialog>
    </SectionShell>
  );
}
