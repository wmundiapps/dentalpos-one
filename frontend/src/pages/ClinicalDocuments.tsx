import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LocalPrintshopIcon from "@mui/icons-material/LocalPrintshop";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PageHeader from "../components/PageHeader";
import PatientAlertBanner from "../components/patient/PatientAlertBanner";
import ClinicLetterheadDialog from "../components/ClinicLetterheadDialog";
import { createClinicalDocument, createClinicalDocumentTemplate, updateClinicalDocumentTemplate, issueClinicalDocument, listClinicalDocuments, listClinicalDocumentTemplates } from "../services/ClinicalDocumentService";
import { loadBackendPatients, type BackendPatient } from "../services/PatientApi";
import { readSessionUser } from "../services/DemoAccess";
import { loadBrandKit } from "../services/BrandKitApi";
import { KIT_CSS, footer, letterhead } from "../utils/brandKit/templates";
import type { ClinicalDocument, ClinicalDocumentTemplate, ClinicalDocumentType } from "../types/clinicalDocument";

type Doc = ClinicalDocument & { patientId?: string; content?: string };

const LABELS: Record<ClinicalDocumentType, string> = {
  PRESCRIPTION: "Receita", CERTIFICATE: "Atestado", DECLARATION: "Declaração", REFERRAL: "Encaminhamento",
  EXAM_REQUEST: "Solicitação de exame", REPORT: "Relatório", CONSENT: "Termo de consentimento", CLINICAL_CONTRACT: "Contrato clínico", REFUSAL: "Termo de recusa", POST_OP_INSTRUCTIONS: "Orientações pós-operatórias",
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// Impressão com o timbre da clínica (logo, nome, responsável técnico e contatos do Kit da Clínica).
async function printDoc(doc: Doc, patientName: string, previewOnly = false) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.write("<p style=\"font-family:Arial;padding:40px\">Preparando documento…</p>");
  let head = "";
  let foot = "";
  try {
    const r = await loadBrandKit();
    const c = r.clinic; const k = r.kit || {};
    const kc = { name: c.displayName || c.name, tagline: k.tagline || "", logo: c.logo || "", color: c.primaryColor || "#1565C0", rtName: k.rtName || "", rtCro: k.rtCro || "", cnpj: c.cnpj || "", phone: c.phone || "", whatsapp: k.whatsapp || "", email: c.email || "", address: c.address || "", city: [c.city, c.state].filter(Boolean).join(" – "), site: k.site || "", instagram: k.instagram || "", logoMm: k.logoWidthMm };
    head = `<div class="bkit"><div style="--b:${esc(kc.color)}">${letterhead(kc)}</div></div>`;
    foot = `<div class="bkit rodape"><div style="--b:${esc(kc.color)}">${footer(kc)}</div></div>`;
  } catch { /* sem identidade: imprime sem timbre */ }
  const when = new Date(doc.issuedAt || doc.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const pro = doc.professionalName ? (/^(dr|dra|dr\.|dra\.)\s/i.test(doc.professionalName.trim()) ? doc.professionalName : `Dr(a). ${doc.professionalName}`) : "";
  const meta = `<div class="pat">${esc(patientName)}</div>${pro ? `<div class="pro">${esc(pro)}</div>` : ""}<div class="when">${doc.status === "DRAFT" ? "Rascunho" : "Emitido"} em ${esc(when)}</div>`;
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${KIT_CSS}.rodape{position:fixed;left:0;right:0;bottom:0;background:#fff;padding:6px 40px 10px}.rodape .df{margin-top:0}body{padding-bottom:36mm}h1{font-size:20px;margin:24px 0 8px;text-align:center}body{text-align:center}.meta{margin-bottom:24px}.pat{font-size:22px;font-weight:800}.pro{font-size:15px;margin-top:2px}.when{font-size:13px;color:#555;margin-top:2px}pre{white-space:pre-wrap;font-family:inherit;font-size:14px;text-align:center}</style></head><body>${foot}${head}<h1>${esc(doc.title)}</h1><div class="meta">${meta}</div><pre>${esc(doc.content || "")}</pre></body></html>`);
  w.document.close();
  const imgs = Array.from(w.document.images);
  await Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise<void>((r) => { i.onload = () => r(); i.onerror = () => r(); }))));
  w.focus();
  if (!previewOnly) w.print();
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
  const [kitOpen, setKitOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const saveAsModel = async () => {
    try { await createClinicalDocumentTemplate({ documentType: form.documentType, title: form.title, content: form.content }); setNotice("Modelo salvo. Ele aparece em “Modelo da clínica” nos próximos documentos."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o modelo."); }
  };
  const [editModel, setEditModel] = useState<{ id: string; title: string; content: string; documentType: ClinicalDocumentType } | null>(null);
  const previewModel = (t: { title: string; content: string; documentType: ClinicalDocumentType }) =>
    void printDoc({ id: "modelo", patientId: "", professionalName: sessionName || "Nome do profissional", documentType: t.documentType, title: t.title, content: t.content, status: "ISSUED", issuedAt: new Date().toISOString(), authoredBy: "", contentHash: "", version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Doc, "Nome do paciente", true);
  const saveModel = async () => {
    if (!editModel) return;
    try { await updateClinicalDocumentTemplate(editModel.id, { title: editModel.title, content: editModel.content }); setEditModel(null); setNotice("Modelo atualizado."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o modelo."); }
  };
  const removeModel = async (id: string) => {
    if (!window.confirm("Remover este modelo? Os documentos já criados não mudam.")) return;
    try { await updateClinicalDocumentTemplate(id, { isActive: false }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível remover."); }
  };
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

  const nameOf = (id?: string) => patients.find((p) => p.id === id)?.fullName || "—";
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
      {!fixedPatientId && <PatientAlertBanner patientId={filterPatient} />}
      <PageHeader title="Documentos e Contratos" description={"Receitas, atestados, declarações, encaminhamentos, pedidos de exame, termos e contratos com autoria e histórico."} actionLabel="Novo documento" actionIcon={<AddIcon />} onAction={openNew} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Button variant="outlined" onClick={() => setKitOpen(true)}>Dados da clínica e logo</Button>
        <Button variant="outlined" onClick={() => setModelsOpen(true)}>{`Meus modelos (${templates.length})`}</Button>
      </Box>
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
          <Typography sx={{ p: 3 }} color="text.secondary">{filtroStatus ? "Nenhum documento neste filtro." : "Nenhum documento. Use “Novo documento” ou gere o contrato a partir de um orçamento."}</Typography>
        ) : visible.map((doc) => (
          <Box key={doc.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr auto 1fr auto" }, gap: 2, p: 2, borderBottom: "1px solid", borderColor: "divider", alignItems: "center" }}>
            <Box>
              <Typography sx={{ fontWeight: 800 }}>{doc.title}</Typography>
              <Typography variant="body2" color="text.secondary">{[LABELS[doc.documentType] || doc.documentType, fixedPatientId ? "" : nameOf(doc.patientId), doc.professionalName, `v${doc.version}`].filter(Boolean).join(" • ")}</Typography>
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
        <DialogTitle>{"Novo documento clínico"}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px !important" }}>
          {fixedPatientId ? (
            <Typography>{`Paciente: ${nameOf(fixedPatientId)}`}</Typography>
          ) : (
            <TextField select required label="Paciente" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
              {patients.map((p) => <MenuItem key={p.id} value={p.id}>{p.fullName}</MenuItem>)}
            </TextField>
          )}
          <TextField required label={"Profissional responsável"} value={form.professionalName} onChange={(e) => setForm({ ...form, professionalName: e.target.value })} />
          <TextField select label={"Modelo da clínica"} value={form.templateId} onChange={(e) => chooseTemplate(e.target.value)}>
            <MenuItem value="">Sem modelo</MenuItem>
            {templates.map((t) => <MenuItem key={t.id} value={t.id}>{t.title}</MenuItem>)}
          </TextField>
          <TextField select label="Tipo" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value as ClinicalDocumentType })}>
            {Object.entries(LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <TextField required label={"Título"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField required label={"Conteúdo"} multiline minRows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} helperText={"Salvo como rascunho. Ao emitir, fica registrado com autoria, data e versão."} />
        </DialogContent>
        <DialogActions>
          <Button disabled={!form.title.trim() || !form.content.trim()} onClick={() => void saveAsModel()}>Salvar como modelo</Button>
          <Box sx={{ flex: 1 }} />
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

      <ClinicLetterheadDialog open={kitOpen} onClose={() => setKitOpen(false)} onSaved={() => setNotice("Dados da clínica salvos. Os próximos documentos impressos já saem com eles.")} />

      <Dialog open={Boolean(editModel)} onClose={() => setEditModel(null)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 900 }}>Editar modelo — {editModel ? LABELS[editModel.documentType] : ""}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField label="Título" value={editModel?.title || ""} onChange={(e) => setEditModel((m) => (m ? { ...m, title: e.target.value } : m))} />
          <TextField label="Conteúdo" multiline minRows={12} value={editModel?.content || ""} onChange={(e) => setEditModel((m) => (m ? { ...m, content: e.target.value } : m))} helperText="Use “Ver impresso” para conferir como sai no papel, com a logo e os dados da clínica." />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => editModel && previewModel(editModel)}>Ver impresso</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setEditModel(null)}>Cancelar</Button>
          <Button variant="contained" disabled={!editModel?.title.trim() || !editModel?.content.trim()} onClick={() => void saveModel()}>Salvar modelo</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={modelsOpen} onClose={() => setModelsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Meus modelos de documento</DialogTitle>
        <DialogContent dividers>
          {templates.length === 0 ? <Typography color="text.secondary">Nenhum modelo ainda. Ao criar um documento, use “Salvar como modelo”.</Typography> : templates.map((t) => (
            <Box key={t.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
              <Box sx={{ flex: 1 }}><Typography sx={{ fontWeight: 700 }}>{t.title}</Typography><Typography variant="caption" color="text.secondary">{LABELS[t.documentType] || t.documentType}</Typography></Box>
              <Button size="small" onClick={() => previewModel(t)}>Ver impresso</Button>
              <Button size="small" onClick={() => setEditModel({ id: t.id, title: t.title, content: t.content, documentType: t.documentType })}>Editar</Button>
              <Button size="small" color="error" onClick={() => void removeModel(t.id)}>Remover</Button>
            </Box>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setModelsOpen(false)}>Fechar</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
