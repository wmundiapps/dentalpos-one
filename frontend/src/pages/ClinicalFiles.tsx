import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DesignServicesIcon from "@mui/icons-material/DesignServices";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PageHeader from "../components/PageHeader";
import {
  archiveClinicalFile, clinicalFileAccess, clinicalFileDesignHandoff,
  listClinicalFileCategories, listClinicalFiles, listClinicalPatients, uploadClinicalFile
} from "../services/ClinicalFileService";
import type { ClinicalFile, ClinicalFileCategory, ClinicalFileKind } from "../types/clinicalFile";

const KINDS: Array<{ value: ClinicalFileKind; label: string }> = [
  { value: "PHOTO", label: "Fotografia" },
  { value: "RADIOGRAPH", label: "Radiografia" },
  { value: "PANORAMIC", label: "Panorâmica" },
  { value: "PERIAPICAL", label: "Periapical" },
  { value: "TOMOGRAPHY", label: "Tomografia" },
  { value: "DICOM", label: "DICOM" },
  { value: "LAB_EXAM", label: "Exame laboratorial" },
  { value: "PDF", label: "PDF" },
  { value: "STL", label: "STL" },
  { value: "PLY", label: "PLY" },
  { value: "OBJ", label: "OBJ" },
  { value: "DOCUMENT", label: "Documento" },
  { value: "OTHER", label: "Outro" },
];

export default function ClinicalFiles() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [patients, setPatients] = useState<Array<{ id: string; fullName: string }>>([]);
  const [patientId, setPatientId] = useState(searchParams.get("patientId") || "");
  const [rows, setRows] = useState<ClinicalFile[]>([]);
  const [categories, setCategories] = useState<ClinicalFileCategory[]>([]);
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listClinicalPatients()
      .then((items) => {
        setPatients(items);
        if (!patientId && items[0]?.id) setPatientId(items[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar pacientes."));
  }, []);

  async function load() {
    if (!patientId) return;
    setError("");
    try {
      const [files, cats] = await Promise.all([
        listClinicalFiles(patientId, { kind: kind || undefined, search: search || undefined }),
        listClinicalFileCategories(),
      ]);
      setRows(files);
      setCategories(cats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar arquivos clínicos.");
    }
  }

  useEffect(() => {
    setSearchParams(patientId ? { patientId } : {});
    void load();
  }, [patientId, kind]); // pesquisa é acionada pelo botão

  async function openFile(row: ClinicalFile) {
    try {
      const access = await clinicalFileAccess(row.id);
      window.open(access.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir o arquivo.");
    }
  }

  async function openDesign(row: ClinicalFile) {
    try {
      const handoff = await clinicalFileDesignHandoff(row.id);
      sessionStorage.setItem(`dentalpos.design.clinicalFile.${row.id}`, JSON.stringify(handoff.source));
      navigate(handoff.designPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar ao DentalPos Design.");
    }
  }

  async function remove(row: ClinicalFile) {
    const reason = window.prompt(`Informe o motivo para arquivar "${row.title}". O registro será preservado para auditoria.`)?.trim();
    if (!reason) return;
    await archiveClinicalFile(row.id, reason);
    await load();
  }

  return (
    <Box>
      <PageHeader
        title="Arquivos e Exames Clínicos"
        description="Fotografias, radiografias, tomografias, DICOM, PDFs, exames laboratoriais e arquivos odontológicos 3D."
        actionLabel="Adicionar arquivo"
        actionIcon={<AddIcon />}
      />

      <Paper elevation={0} sx={{ p: 2.5, mb: 3, border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <FormControl sx={{ minWidth: 260 }}>
            <InputLabel>Paciente</InputLabel>
            <Select label="Paciente" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              {patients.map((p) => <MenuItem key={p.id} value={p.id}>{p.fullName}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 180 }}>
            <InputLabel>Tipo</InputLabel>
            <Select label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              {KINDS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField fullWidth label="Buscar por título, arquivo, origem ou descrição" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button variant="outlined" onClick={() => void load()}>Buscar</Button>
          <Button variant="contained" startIcon={<CloudUploadIcon />} onClick={() => setUploadOpen(true)} disabled={!patientId}>
            Upload
          </Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {storageWarning && <Alert severity="warning" sx={{ mb: 2 }}>{storageWarning}</Alert>}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
        {rows.map((row) => (
          <Paper key={row.id} elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
            <Stack direction="row" justifyContent="space-between" spacing={2}>
              <Box>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip size="small" label={KINDS.find((k) => k.value === row.kind)?.label || row.kind} />
                  <Chip size="small" variant="outlined" label={row.previewKind} />
                  <Chip size="small" color={row.storageStatus === "AVAILABLE" ? "success" : "warning"} label={row.storageStatus} />
                </Stack>
                <Typography variant="h6" sx={{ fontWeight: 800, mt: 1 }}>{row.title}</Typography>
                <Typography variant="body2" color="text.secondary">{row.originalName}</Typography>
              </Box>
              <Typography variant="caption">{Math.max(1, Math.round(row.sizeBytes / 1024))} KB</Typography>
            </Stack>

            <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: "wrap" }}>
              {row.examDate && <Typography variant="body2">Exame: {new Date(row.examDate).toLocaleDateString("pt-BR")}</Typography>}
              {row.origin && <Typography variant="body2">Origem: {row.origin}</Typography>}
              {row.tooth && <Typography variant="body2">Dente: {row.tooth}</Typography>}
              {row.region && <Typography variant="body2">Região: {row.region}</Typography>}
            </Stack>
            {row.description && <Typography variant="body2" sx={{ mt: 1.5 }}>{row.description}</Typography>}
            {!!row.tags?.length && <Stack direction="row" spacing={0.5} sx={{ mt: 1.5, flexWrap: "wrap" }}>
              {row.tags.map((tag) => <Chip key={tag} size="small" variant="outlined" label={tag} />)}
            </Stack>}

            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button size="small" startIcon={<OpenInNewIcon />} onClick={() => void openFile(row)}>Visualizar</Button>
              {["STL", "PLY", "OBJ"].includes(row.kind) && (
                <Button size="small" startIcon={<DesignServicesIcon />} onClick={() => void openDesign(row)}>DentalPos Design</Button>
              )}
              <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => void remove(row)}>Arquivar</Button>
            </Stack>
          </Paper>
        ))}
      </Box>

      {!rows.length && !error && (
        <Paper elevation={0} sx={{ p: 5, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: 3 }}>
          <Typography color="text.secondary">Nenhum arquivo ou exame encontrado para este paciente.</Typography>
        </Paper>
      )}

      <UploadDialog
        open={uploadOpen}
        categories={categories}
        busy={busy}
        onClose={() => setUploadOpen(false)}
        onSubmit={async (data) => {
          if (!patientId) return;
          setBusy(true); setError(""); setStorageWarning("");
          try {
            const result = await uploadClinicalFile({ patientId, ...data });
            if (!result.upload?.configured) {
              setStorageWarning("O registro clínico foi criado, mas o storage externo ainda não está configurado. Configure TenantStorageConfig e as credenciais do provedor para concluir o upload.");
            } else {
              setUploadOpen(false);
            }
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha no upload.");
          } finally { setBusy(false); }
        }}
      />
    </Box>
  );
}

function UploadDialog(props: {
  open: boolean;
  categories: ClinicalFileCategory[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (data: {
    file: File; kind: ClinicalFileKind; categoryId?: string; title: string; examDate?: string;
    origin?: string; requesterProfessionalName?: string; description?: string; tags?: string[];
    tooth?: string; region?: string;
  }) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<ClinicalFileKind>("PHOTO");
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [origin, setOrigin] = useState("");
  const [requesterProfessionalName, setRequesterProfessionalName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [tooth, setTooth] = useState("");
  const [region, setRegion] = useState("");

  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="md">
      <DialogTitle>Novo arquivo ou exame clínico</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Button component="label" variant="outlined" startIcon={<CloudUploadIcon />}>
            {file ? file.name : "Selecionar arquivo"}
            <input hidden type="file" onChange={(e) => {
              const selected = e.target.files?.[0] || null;
              setFile(selected);
              if (selected && !title) setTitle(selected.name.replace(/\.[^.]+$/, ""));
              const ext = selected?.name.split(".").pop()?.toLowerCase();
              if (ext === "stl") setKind("STL");
              if (ext === "ply") setKind("PLY");
              if (ext === "obj") setKind("OBJ");
              if (ext === "dcm") setKind("DICOM");
              if (ext === "pdf") setKind("PDF");
            }} />
          </Button>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <FormControl fullWidth><InputLabel>Tipo</InputLabel><Select label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as ClinicalFileKind)}>
              {KINDS.map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
            </Select></FormControl>
            <FormControl fullWidth><InputLabel>Categoria</InputLabel><Select label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <MenuItem value="">Sem categoria</MenuItem>
              {props.categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select></FormControl>
          </Stack>
          <TextField required label="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField fullWidth type="date" label="Data do exame" slotProps={{ inputLabel: { shrink: true } }} value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            <TextField fullWidth label="Origem" value={origin} onChange={(e) => setOrigin(e.target.value)} />
            <TextField fullWidth label="Profissional solicitante" value={requesterProfessionalName} onChange={(e) => setRequesterProfessionalName(e.target.value)} />
          </Stack>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField fullWidth label="Dente (FDI)" value={tooth} onChange={(e) => setTooth(e.target.value)} />
            <TextField fullWidth label="Região" value={region} onChange={(e) => setRegion(e.target.value)} />
          </Stack>
          <TextField label="Tags (separadas por vírgula)" value={tags} onChange={(e) => setTags(e.target.value)} />
          <TextField multiline minRows={3} label="Descrição / laudo / observações" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} disabled={props.busy}>Cancelar</Button>
        <Button variant="contained" disabled={props.busy || !file || !title.trim()} onClick={() => file && props.onSubmit({
          file, kind, categoryId: categoryId || undefined, title: title.trim(), examDate: examDate || undefined,
          origin: origin || undefined, requesterProfessionalName: requesterProfessionalName || undefined,
          description: description || undefined, tags: tags.split(",").map((v) => v.trim()).filter(Boolean),
          tooth: tooth || undefined, region: region || undefined,
        })}>{props.busy ? "Enviando..." : "Salvar e enviar"}</Button>
      </DialogActions>
    </Dialog>
  );
}
