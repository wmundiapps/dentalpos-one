import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SaveIcon from "@mui/icons-material/Save";
import { useCallback, useEffect, useState } from "react";
import {
  archiveSpecializedAttachment,
  createSpecializedEvolution,
  createSpecializedRecord,
  linkSpecializedAttachment,
  loadSpecializedClinical,
  updateSpecializedRecord,
} from "../../services/SpecializedClinicalApi";
import type {
  SpecializedAttachmentCategory,
  SpecializedClinicalData,
  SpecializedClinicalRecord,
  SpecializedClinicalRecordStatus,
  SpecializedClinicalSpecialty,
  SpecializedEvolutionClinicalData,
  SpecializedEvolutionType,
} from "../../types/specializedClinical";

const specialtyLabels: Record<SpecializedClinicalSpecialty, string> = {
  ORTHODONTICS: "Ortodontia",
  FUNCTIONAL_ORTHOPEDICS: "Ortopedia Funcional",
  TMD_OROFACIAL_PAIN: "DTM / Dor Orofacial",
};

const statusLabels: Record<SpecializedClinicalRecordStatus, string> = {
  ACTIVE: "Ativo",
  RETENTION: "Contenção",
  COMPLETED: "Finalizado",
  ABANDONED: "Abandono",
  DISCHARGED: "Alta",
};

const evolutionLabels: Record<SpecializedEvolutionType, string> = {
  ACTIVATION: "Ativação",
  MONTHLY_FOLLOW_UP: "Evolução mensal",
  INCIDENT: "Intercorrência",
  RETENTION: "Contenção",
  FUNCTIONAL_FOLLOW_UP: "Acompanhamento funcional",
  PAIN_FOLLOW_UP: "Acompanhamento de dor",
  FINALIZATION: "Finalização",
  OTHER: "Outro",
};

const attachmentLabels: Record<SpecializedAttachmentCategory, string> = {
  CEPHALOMETRY: "Análise cefalométrica",
  PHOTOGRAPH: "Fotografia",
  MODEL: "Modelo",
  RADIOGRAPH: "Radiografia",
  SCAN: "Escaneamento",
  DICOM: "DICOM / Tomografia",
  OTHER: "Outro",
};

const emptyCommon = {
  status: "ACTIVE" as SpecializedClinicalRecordStatus,
  chiefComplaint: "",
  diagnosis: "",
  diagnosticHypothesis: "",
  treatmentPlan: "",
  responsibleName: "",
};

function textList(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function parseList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function latestFor(records: SpecializedClinicalRecord[], specialty: SpecializedClinicalSpecialty) {
  return records.find((record) => record.specialty === specialty) ?? null;
}

export default function SpecializedClinicalWorkspace({ patientId }: { patientId: string }) {
  const [specialty, setSpecialty] = useState<SpecializedClinicalSpecialty>("ORTHODONTICS");
  const [records, setRecords] = useState<SpecializedClinicalRecord[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");
  const [common, setCommon] = useState(emptyCommon);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ severity: "success" | "error" | "info"; text: string } | null>(null);
  const [evolution, setEvolution] = useState({
    evolutionType: "MONTHLY_FOLLOW_UP" as SpecializedEvolutionType,
    professionalName: "",
    summary: "",
    clinicalData: {} as SpecializedEvolutionClinicalData,
  });
  const [attachment, setAttachment] = useState({
    category: "PHOTOGRAPH" as SpecializedAttachmentCategory,
    clinicalFileId: "",
    storageKey: "",
    fileName: "",
    notes: "",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await loadSpecializedClinical(patientId);
      setPatientName(response.patient.fullName);
      setRecords(response.records);
      setMessage(null);
    } catch (error) {
      setMessage({ severity: "error", text: error instanceof Error ? error.message : "Falha ao carregar o núcleo especializado." });
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const record = latestFor(records, specialty);
    setRecordId(record?.id ?? null);
    setCommon(record ? {
      status: record.status,
      chiefComplaint: record.chiefComplaint ?? "",
      diagnosis: record.diagnosis ?? "",
      diagnosticHypothesis: record.diagnosticHypothesis ?? "",
      treatmentPlan: record.treatmentPlan ?? "",
      responsibleName: record.responsibleName ?? "",
    } : emptyCommon);
    setData(record ? { ...record.clinicalData } : {});
  }, [records, specialty]);

  const current = records.find((record) => record.id === recordId) ?? null;

  const setValue = (key: string, value: unknown) => setData((previous) => ({ ...previous, [key]: value }));
  const setEvolutionValue = (key: keyof SpecializedEvolutionClinicalData, value: string | number | null) =>
    setEvolution((previous) => ({ ...previous, clinicalData: { ...previous.clinicalData, [key]: value } }));

  const field = (key: string, label: string, multiline = false) => (
    <TextField
      fullWidth
      label={label}
      value={String(data[key] ?? "")}
      onChange={(event) => setValue(key, event.target.value)}
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
    />
  );

  const numeric = (key: string, label: string, min: number, max: number) => (
    <TextField
      fullWidth
      type="number"
      label={label}
      value={data[key] ?? ""}
      slotProps={{ htmlInput: { min, max } }}
      onChange={(event) => setValue(key, event.target.value === "" ? null : Number(event.target.value))}
    />
  );

  const list = (key: string, label: string) => (
    <TextField
      fullWidth
      label={label}
      value={textList(data[key])}
      helperText="Separe os itens por vírgula"
      onChange={(event) => setValue(key, parseList(event.target.value))}
    />
  );

  const specialtyForm = (() => {
    const grid = { display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 };
    if (specialty === "ORTHODONTICS") return (
      <Box sx={grid}>
        <TextField select label="Classificação de Angle" value={String(data.angleClassification ?? "")} onChange={(event) => setValue("angleClassification", event.target.value)}>
          <MenuItem value="">Não informada</MenuItem><MenuItem value="CLASS_I">Classe I</MenuItem><MenuItem value="CLASS_II_DIV_1">Classe II divisão 1</MenuItem><MenuItem value="CLASS_II_DIV_2">Classe II divisão 2</MenuItem><MenuItem value="CLASS_III">Classe III</MenuItem>
        </TextField>
        {field("canineRelationship", "Relação canina")}
        {numeric("overbiteMm", "Sobremordida (mm)", -30, 30)}
        {numeric("overjetMm", "Sobressaliência (mm)", -30, 30)}
        {field("crossbite", "Mordida cruzada", true)}{field("openBite", "Mordida aberta", true)}
        {field("midlineDeviation", "Desvio de linha média")}{field("crowding", "Apinhamento", true)}
        {field("diastemas", "Diastemas", true)}{field("facialPattern", "Padrão facial")}{list("habits", "Hábitos")}
        {field("appliance", "Aparelho", true)}{field("technique", "Técnica")}{field("prescription", "Prescrição", true)}
        {field("brackets", "Bráquetes")}{field("tubes", "Tubos")}{field("bands", "Bandas")}
        {field("wires", "Fios", true)}{field("arches", "Arcos", true)}{field("elastics", "Elásticos", true)}
        {field("accessories", "Acessórios", true)}{field("anchorage", "Ancoragem", true)}{field("miniImplants", "Mini-implantes ortodônticos", true)}
        <Box sx={{ gridColumn: { md: "1 / -1" } }}>{field("cephalometricAnalysis", "Análise cefalométrica / interpretação", true)}</Box>
        {field("retention", "Contenção", true)}{field("completionNotes", "Finalização", true)}
        {field("abandonmentReason", "Abandono / motivo", true)}{field("dischargeNotes", "Alta / observações", true)}
      </Box>
    );
    if (specialty === "FUNCTIONAL_ORTHOPEDICS") return (
      <Box sx={grid}>
        {field("functionalDiagnosis", "Diagnóstico funcional", true)}{field("appliance", "Aparelho", true)}
        {field("indication", "Indicação", true)}{field("usageProtocol", "Protocolo de uso", true)}
        {field("activations", "Ativações", true)}{field("evolution", "Evolução", true)}
        <TextField select label="Cooperação do paciente" value={String(data.patientCooperation ?? "")} onChange={(event) => setValue("patientCooperation", event.target.value || null)}>
          <MenuItem value="">Não avaliada</MenuItem><MenuItem value="POOR">Baixa</MenuItem><MenuItem value="PARTIAL">Parcial</MenuItem><MenuItem value="GOOD">Boa</MenuItem><MenuItem value="EXCELLENT">Excelente</MenuItem>
        </TextField>
      </Box>
    );
    return (
      <Box sx={grid}>
        {list("painLocations", "Localização da dor")}
        <TextField select label="Lado" value={String(data.side ?? "")} onChange={(event) => setValue("side", event.target.value || null)}>
          <MenuItem value="">Não informado</MenuItem><MenuItem value="RIGHT">Direito</MenuItem><MenuItem value="LEFT">Esquerdo</MenuItem><MenuItem value="BILATERAL">Bilateral</MenuItem><MenuItem value="CENTRAL">Central</MenuItem><MenuItem value="NOT_APPLICABLE">Não aplicável</MenuItem>
        </TextField>
        {field("duration", "Duração")}{field("frequency", "Frequência")}{field("intensityDescription", "Intensidade")}
        {numeric("painScale", "Escala de dor (0–10)", 0, 10)}{list("aggravatingFactors", "Fatores agravantes")}{list("relievingFactors", "Fatores de alívio")}
        <FormControlLabel control={<Switch checked={Boolean(data.openingLimitation)} onChange={(event) => setValue("openingLimitation", event.target.checked)} />} label="Limitação de abertura" />
        {numeric("openingMm", "Amplitude de abertura (mm)", 0, 100)}{field("deviation", "Desvio")}{field("deflection", "Deflexão")}
        {field("clicking", "Estalido", true)}{field("crepitation", "Crepitação", true)}{field("locking", "Travamento", true)}{field("dislocation", "Luxação", true)}
        {field("musclePalpation", "Palpação muscular", true)}{field("jointPalpation", "Palpação articular", true)}
        {list("parafunctionalHabits", "Hábitos parafuncionais")}{field("bruxism", "Bruxismo", true)}{field("clenching", "Apertamento", true)}
        {field("sleep", "Sono", true)}{field("associatedHeadache", "Cefaleia associada", true)}{field("occlusalSplint", "Placa oclusal", true)}
        {field("medication", "Medicação", true)}{field("physiotherapy", "Fisioterapia", true)}{field("speechTherapy", "Fonoaudiologia", true)}
        {field("referrals", "Encaminhamentos", true)}{field("followUp", "Acompanhamento", true)}{field("evolution", "Evolução", true)}
      </Box>
    );
  })();

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...common, clinicalData: data as SpecializedClinicalData };
      if (recordId) await updateSpecializedRecord(patientId, recordId, payload);
      else await createSpecializedRecord(patientId, { specialty, ...payload });
      await refresh();
      setMessage({ severity: "success", text: "Acompanhamento especializado salvo com auditoria." });
    } catch (error) {
      setMessage({ severity: "error", text: error instanceof Error ? error.message : "Falha ao salvar o acompanhamento." });
    } finally {
      setSaving(false);
    }
  };

  const newEpisode = () => {
    setRecordId(null); setCommon(emptyCommon); setData({});
    setMessage({ severity: "info", text: `Novo episódio de ${specialtyLabels[specialty]}.` });
  };

  const addEvolution = async () => {
    if (!recordId || !evolution.professionalName.trim() || !evolution.summary.trim()) return;
    setSaving(true);
    try {
      await createSpecializedEvolution(patientId, recordId, evolution);
      setEvolution((previous) => ({ ...previous, summary: "", clinicalData: {} }));
      await refresh();
      setMessage({ severity: "success", text: "Evolução especializada registrada." });
    } catch (error) {
      setMessage({ severity: "error", text: error instanceof Error ? error.message : "Falha ao registrar evolução." });
    } finally { setSaving(false); }
  };

  const addAttachment = async () => {
    if (!recordId || !attachment.fileName.trim() || (!attachment.clinicalFileId.trim() && !attachment.storageKey.trim())) return;
    setSaving(true);
    try {
      await linkSpecializedAttachment(patientId, recordId, { ...attachment, metadata: {} });
      setAttachment((previous) => ({ ...previous, clinicalFileId: "", storageKey: "", fileName: "", notes: "" }));
      await refresh();
      setMessage({ severity: "success", text: "Arquivo clínico vinculado ao acompanhamento." });
    } catch (error) {
      setMessage({ severity: "error", text: error instanceof Error ? error.message : "Falha ao vincular arquivo." });
    } finally { setSaving(false); }
  };

  if (loading) return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>;

  return <Box>
    <Typography color="text.secondary" sx={{ mb: 1 }}>{patientName ? `Paciente: ${patientName}` : "Paciente selecionado"}</Typography>
    <Tabs value={specialty} onChange={(_, value: SpecializedClinicalSpecialty) => setSpecialty(value)} variant="scrollable" sx={{ mb: 2 }}>
      <Tab value="ORTHODONTICS" label="Ortodontia" /><Tab value="FUNCTIONAL_ORTHOPEDICS" label="Ortopedia Funcional" /><Tab value="TMD_OROFACIAL_PAIN" label="DTM / Dor Orofacial" />
    </Tabs>
    {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}

    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", mb: 2 }}>
        <Box><Typography variant="h6" sx={{ fontWeight: 900 }}>{specialtyLabels[specialty]}</Typography><Typography variant="body2" color="text.secondary">{current ? `Episódio iniciado em ${new Date(current.startedAt).toLocaleDateString("pt-BR")}` : "Novo episódio clínico"}</Typography></Box>
        <Button startIcon={<AddIcon />} onClick={newEpisode}>Novo episódio</Button>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}>
        <TextField select label="Situação" value={common.status} onChange={(event) => setCommon({ ...common, status: event.target.value as SpecializedClinicalRecordStatus })}>{Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        <TextField label="Profissional responsável" value={common.responsibleName} onChange={(event) => setCommon({ ...common, responsibleName: event.target.value })} />
        <TextField multiline minRows={2} label="Queixa principal" value={common.chiefComplaint} onChange={(event) => setCommon({ ...common, chiefComplaint: event.target.value })} />
        <TextField multiline minRows={2} label="Diagnóstico" value={common.diagnosis} onChange={(event) => setCommon({ ...common, diagnosis: event.target.value })} />
        <TextField multiline minRows={2} label="Hipótese diagnóstica" value={common.diagnosticHypothesis} onChange={(event) => setCommon({ ...common, diagnosticHypothesis: event.target.value })} />
        <TextField multiline minRows={2} label="Plano terapêutico" value={common.treatmentPlan} onChange={(event) => setCommon({ ...common, treatmentPlan: event.target.value })} />
      </Box>
      {specialtyForm}
      {specialty === "ORTHODONTICS" && <Alert severity="info" sx={{ mt: 2 }}>A análise cefalométrica é apenas registrada e vinculada aos arquivos clínicos. Este módulo não executa cálculo cefalométrico.</Alert>}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}><Button variant="contained" startIcon={<SaveIcon />} disabled={saving} onClick={save}>Salvar acompanhamento</Button></Box>
    </Paper>

    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 900 }}>Evoluções e ativações</Typography>
      {!recordId ? <Alert severity="warning" sx={{ my: 2 }}>Salve o episódio clínico antes de registrar evoluções.</Alert> : <>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "220px 1fr" }, gap: 2, my: 2 }}>
          <TextField select label="Tipo" value={evolution.evolutionType} onChange={(event) => setEvolution({ ...evolution, evolutionType: event.target.value as SpecializedEvolutionType })}>{Object.entries(evolutionLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
          <TextField label="Profissional" required value={evolution.professionalName} onChange={(event) => setEvolution({ ...evolution, professionalName: event.target.value })} />
          <TextField multiline minRows={3} required label="Evolução / conduta" value={evolution.summary} onChange={(event) => setEvolution({ ...evolution, summary: event.target.value })} sx={{ gridColumn: { md: "1 / -1" } }} />
          {specialty === "ORTHODONTICS" && <><TextField label="Ativação" value={evolution.clinicalData.activation ?? ""} onChange={(event) => setEvolutionValue("activation", event.target.value)} /><TextField label="Fio / arco" value={evolution.clinicalData.wire ?? ""} onChange={(event) => setEvolutionValue("wire", event.target.value)} /><TextField label="Elásticos / acessórios" value={evolution.clinicalData.elastics ?? ""} onChange={(event) => setEvolutionValue("elastics", event.target.value)} /><TextField label="Intercorrências" value={evolution.clinicalData.incidents ?? ""} onChange={(event) => setEvolutionValue("incidents", event.target.value)} /></>}
          {specialty === "FUNCTIONAL_ORTHOPEDICS" && <><TextField label="Ativação / ajuste" value={evolution.clinicalData.activation ?? ""} onChange={(event) => setEvolutionValue("activation", event.target.value)} /><TextField label="Cooperação" value={evolution.clinicalData.cooperation ?? ""} onChange={(event) => setEvolutionValue("cooperation", event.target.value)} /></>}
          {specialty === "TMD_OROFACIAL_PAIN" && <><TextField type="number" label="Dor (0–10)" value={evolution.clinicalData.painScale ?? ""} onChange={(event) => setEvolutionValue("painScale", event.target.value === "" ? null : Number(event.target.value))} /><TextField type="number" label="Abertura (mm)" value={evolution.clinicalData.openingMm ?? ""} onChange={(event) => setEvolutionValue("openingMm", event.target.value === "" ? null : Number(event.target.value))} /><TextField label="Ruídos articulares" value={evolution.clinicalData.jointSounds ?? ""} onChange={(event) => setEvolutionValue("jointSounds", event.target.value)} /><TextField label="Medicação / terapias" value={evolution.clinicalData.therapies ?? ""} onChange={(event) => setEvolutionValue("therapies", event.target.value)} /></>}
          <TextField label="Próximos passos" value={evolution.clinicalData.nextSteps ?? ""} onChange={(event) => setEvolutionValue("nextSteps", event.target.value)} sx={{ gridColumn: { md: "1 / -1" } }} />
        </Box>
        <Button variant="outlined" disabled={saving || !evolution.professionalName.trim() || !evolution.summary.trim()} onClick={addEvolution}>Registrar evolução</Button>
        <Divider sx={{ my: 2 }} />
        {current?.evolutions.length ? <Box sx={{ display: "grid", gap: 1.5 }}>{current.evolutions.map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}><Typography sx={{ fontWeight: 800 }}>{new Date(item.occurredAt).toLocaleString("pt-BR")} • {evolutionLabels[item.evolutionType]}</Typography><Typography>{item.summary}</Typography><Typography variant="caption" color="text.secondary">{item.professionalName}</Typography></Paper>)}</Box> : <Typography color="text.secondary">Nenhuma evolução especializada registrada.</Typography>}
      </>}
    </Paper>

    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 900 }}>Documentação e arquivos clínicos</Typography>
      <Typography color="text.secondary">Fotografias, modelos, radiografias, DICOM, escaneamentos e fonte da análise cefalométrica são referenciados sem duplicar o arquivo definitivo.</Typography>
      {!recordId ? <Alert severity="warning" sx={{ my: 2 }}>Salve o episódio antes de vincular arquivos.</Alert> : <>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "220px 1fr 1fr" }, gap: 2, my: 2 }}>
          <TextField select label="Categoria" value={attachment.category} onChange={(event) => setAttachment({ ...attachment, category: event.target.value as SpecializedAttachmentCategory })}>{Object.entries(attachmentLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
          <TextField required label="Nome do arquivo" value={attachment.fileName} onChange={(event) => setAttachment({ ...attachment, fileName: event.target.value })} />
          <TextField label="ID no módulo de arquivos" value={attachment.clinicalFileId} onChange={(event) => setAttachment({ ...attachment, clinicalFileId: event.target.value })} />
          <TextField label="Chave de storage existente" value={attachment.storageKey} onChange={(event) => setAttachment({ ...attachment, storageKey: event.target.value })} helperText="Use apenas quando o arquivo já estiver armazenado." />
          <TextField label="Observações" value={attachment.notes} onChange={(event) => setAttachment({ ...attachment, notes: event.target.value })} sx={{ gridColumn: { md: "2 / -1" } }} />
        </Box>
        <Button startIcon={<AttachFileIcon />} variant="outlined" disabled={saving || !attachment.fileName.trim() || (!attachment.clinicalFileId.trim() && !attachment.storageKey.trim())} onClick={addAttachment}>Vincular arquivo</Button>
        <Divider sx={{ my: 2 }} />
        {current?.attachments.length ? <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{current.attachments.map((item) => <Chip key={item.id} label={`${attachmentLabels[item.category]} • ${item.fileName}`} onDelete={() => { void archiveSpecializedAttachment(patientId, current.id, item.id).then(refresh); }} />)}</Box> : <Typography color="text.secondary">Nenhum arquivo vinculado.</Typography>}
      </>}
    </Paper>
  </Box>;
}
