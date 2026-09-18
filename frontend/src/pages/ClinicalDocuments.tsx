import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LocalPrintshopIcon from "@mui/icons-material/LocalPrintshop";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PageHeader from "../components/PageHeader";
import { createClinicalDocument, issueClinicalDocument, listClinicalDocuments, listClinicalDocumentTemplates } from "../services/ClinicalDocumentService";
import { loadBackendPatients, type BackendPatient } from "../services/PatientApi";
import { readSessionUser } from "../services/DemoAccess";
import type { ClinicalDocument, ClinicalDocumentTemplate, ClinicalDocumentType } from "../types/clinicalDocument";

type Doc = ClinicalDocument & { patientId?: string; content?: string };

const LABELS: Record<ClinicalDocumentType, string> = {
  PRESCRIPTION: "Receita", CERTIFICATE: "Atestado", DECLARATION: "Declara\u00e7\u00e3o", REFERRAL: "Encaminhamento",
  EXAM_REQUEST: "Solicita\u00e7\u00e3o de exame", REPORT: "Relat\u00f3rio", CONSENT: "Termo de consentimento", CLINICAL_CONTRACT: "Contrato cl\u00ednico", REFUSAL: "Termo de recusa", POST_OP_INSTRUCTIONS: "Orienta\u00e7\u00f5es p\u00f3s-operat\u00f3rias",
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function printDoc(doc: Doc, patientName: string) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  const meta = [LABELS[doc.documentType] || doc.documentType, `Paciente: ${patientName}`, doc.professionalName, new Date(doc.createdAt).toLocaleString("pt-BR"), doc.status === "DRAFT" ? "RASCUNHO" : ""].filter(Boolean).join(" \u2022 ");
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>body{font-family:Arial,sans-serif;margin:40px;color:#111;line-height:1.5}h1{font-size:20px;margin:0 0 4px}.meta{color:#555;font-size:12px;margin-bottom:24px}pre{white-space:pre-wrap;font-family:inherit;font-size:14px}</style></head><body><h1>${esc(doc.title)}</h1><div class="meta">${esc(meta)}</div><pre>${esc(doc.content || "")}</pre></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

export default function ClinicalDocuments({ fixedPatientId }: { fixedPatientId?: string } = {}) {
  const [searchParams] = useSearchParams();
  const user = readSessionUser();
  const sessionName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "";
  const [rows, setRows] = useState<Doc[]>([]);
  const [templates, setTemplates] = useState<ClinicalDocumentTemplate[]>([]);
  const [patients, setPatients] = useState<BackendPatient[]>([]);
  const [filterPatient, setFilterPatient] = useState(fixedPatientId || searchParams.get("patientId") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [view, setView] = useState<Doc | null>(null);
  const emptyForm = () => ({ patientId: filterPatient, professionalName: sessionName, documentType: "PRESCRIPTION" as ClinicalDocumentType, title: "", content: "", templateId: "" });
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [docs, tpls, pts] = await Promise.all([listClinicalDocuments(), listClinicalDocumentTemplates(), loadBackendPatients()]);
      setRows(docs as Doc[]); setTemplates(tpls); setPatients(pts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar documentos.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const nameOf = (id?: string) => patients.find((p) => p.id === id)?.fullName || "\u2014";
  const porPaciente = useMemo(() => (filterPatient ? rows.filter((r) => r.patientId === filterPatient) : rows), [rows, filterPatient]);
  const visible = useMemo(() => (filtroStatus ? porPaciente.filter((r) => r.status === filtroStatus) : porPaciente), [porPaciente, filtroStatus]);
  const stats = useMemo(() => ({ total: porPaciente.length, issued: porPaciente.filter((x) => x.status === "ISSUED").length, drafts: porPaciente.filter((x) => x.status === "DRAFT").length, cancelled: porPaciente.filter((x) => x.status === "CANCELLED").length }), [porPaciente]);
  const statLabels: Record<string, string> = { total: "Total", issued: "Emitidos", drafts: "Rascunhos", cancelled: "Cancelados" };
  const chooseTemplate = (id: string) => { const t = templates.find((x) => x.id === id); setForm((v) => ({ ...v, templateId: id, ...(t ? { documentType: t.documentType, title: t.title, content: t.content } : {}) })); };
  const openNew = () => { setForm(emptyForm()); setOpen(true); };
  const canSave = Boolean(form.patientId && form.professionalName.trim().length >= 2 && form.title.trim() && form.content.trim());

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await createClinicalDocument({ ...form, templateId: form.templateId || undefined, status: "DRAFT" });
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar documento.");
    } finally { setSaving(false); }
  };
  const issue = async (id: string) => {
    try { await issueClinicalDocument(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao emitir documento."); }
  };

  return (
    <Box>
      <PageHeader title="Documentos e Contratos" description={"Receitas, atestados, declara\u00e7\u00f5es, encaminhamentos, pedidos de exame, termos e contratos com autoria e hist\u00f3rico."} actionLabel="Novo documento" actionIcon={<AddIcon />} onAction={openNew} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {!fixedPatientId && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3 }}>
          <TextField select fullWidth label="Paciente" value={filterPatient} onChange={(e) => setFilterPatient(e.target.value)}>
            <MenuItem value="">Todos os pacientes</MenuItem>
            {patients.map((p) => <MenuItem key={p.id} value={p.id}>{p.fullName}</MenuItem>)}
          </TextField>
        </Paper>
      )}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4,1fr)" }, gap: 2, mb: 3 }}>
        {(Object.entries(stats) as Array<[string, number]>).map(([k, v]) => { const alvo = ({ total: "", issued: "ISSUED", drafts: "DRAFT", cancelled: "CANCELLED" } as Record<string, string>)[k]; const ativo = filtroStatus === alvo; return (
          <Paper key={k} variant="outlined" onClick={() => setFiltroStatus(alvo)} sx={{ p: 2, borderRadius: 3, cursor: "pointer", borderColor: ativo ? "primary.main" : "divider", bgcolor: ativo ? "rgba(25,118,210,.08)" : "background.paper", "&:hover": { borderColor: "primary.main" } }}>
            <Typography color="text.secondary">{statLabels[k]}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 900 }}>{v}</Typography>
          </Paper>); })}
      </Box>
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        {loading ? (
          <Typography sx={{ p: 3 }}>Carregando...</Typography>
        ) : visible.length === 0 ? (
          <Typography sx={{ p: 3 }} color="text.secondary">{filtroStatus ? "Nenhum documento neste filtro." : "Nenhum documento. Use \u201cNovo documento\u201d ou gere o contrato a partir de um or\u00e7amento."}</Typography>
        ) : visible.map((doc) => (
          <Box key={doc.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr auto 1fr auto" }, gap: 2, p: 2, borderBottom: "1px solid", borderColor: "divider", alignItems: "center" }}>
            <Box>
              <Typography sx={{ fontWeight: 800 }}>{doc.title}</Typography>
              <Typography variant="body2" color="text.secondary">{[LABELS[doc.documentType] || doc.documentType, fixedPatientId ? "" : nameOf(doc.patientId), doc.professionalName, `v${doc.version}`].filter(Boolean).join(" \u2022 ")}</Typography>
            </Box>
            <Chip size="small" label={doc.status === "DRAFT" ? "Rascunho" : doc.status === "ISSUED" ? "Emitido" : "Cancelado"} color={doc.status === "ISSUED" ? "success" : doc.status === "CANCELLED" ? "error" : "warning"} />
            <Typography variant="body2">{new Date(doc.createdAt).toLocaleString("pt-BR")}</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button size="small" startIcon={<VisibilityIcon />} onClick={() => setView(doc)}>Ver</Button>
              {doc.status === "DRAFT" && <Button size="small" variant="contained" onClick={() => void issue(doc.id)}>Emitir</Button>}
              <Button size="small" variant="outlined" startIcon={<LocalPrintshopIcon />} onClick={() => printDoc(doc, nameOf(doc.patientId))}>Imprimir</Button>
            </Box>
          </Box>
        ))}
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{"Novo documento cl\u00ednico"}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px !important" }}>
          {fixedPatientId ? (
            <Typography>{`Paciente: ${nameOf(fixedPatientId)}`}</Typography>
          ) : (
            <TextField select required label="Paciente" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
              {patients.map((p) => <MenuItem key={p.id} value={p.id}>{p.fullName}</MenuItem>)}
            </TextField>
          )}
          <TextField required label={"Profissional respons\u00e1vel"} value={form.professionalName} onChange={(e) => setForm({ ...form, professionalName: e.target.value })} />
          <TextField select label={"Modelo da cl\u00ednica"} value={form.templateId} onChange={(e) => chooseTemplate(e.target.value)}>
            <MenuItem value="">Sem modelo</MenuItem>
            {templates.map((t) => <MenuItem key={t.id} value={t.id}>{t.title}</MenuItem>)}
          </TextField>
          <TextField select label="Tipo" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value as ClinicalDocumentType })}>
            {Object.entries(LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <TextField required label={"T\u00edtulo"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField required label={"Conte\u00fado"} multiline minRows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} helperText={"Salvo como rascunho. Ao emitir, fica registrado com autoria, data e vers\u00e3o."} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={!canSave || saving} onClick={() => void save()}>{saving ? "Salvando..." : "Salvar rascunho"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(view)} onClose={() => setView(null)} fullWidth maxWidth="md">
        <DialogTitle>{view?.title}</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ whiteSpace: "pre-wrap" }}>{view?.content || ""}</Typography>
        </DialogContent>
        <DialogActions>
          {view && <Button startIcon={<LocalPrintshopIcon />} onClick={() => printDoc(view, nameOf(view.patientId))}>Imprimir</Button>}
          <Button onClick={() => setView(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}