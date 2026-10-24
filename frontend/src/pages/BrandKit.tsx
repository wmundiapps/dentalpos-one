import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Autocomplete, Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Paper, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SaveIcon from "@mui/icons-material/Save";
import UploadIcon from "@mui/icons-material/Upload";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import PageHeader from "../components/PageHeader";
import { loadBrandKit, prepareLogo, saveBrandKit, saveClinicIdentity, applyIdentityToSession } from "../services/BrandKitApi";
import type { BrandKitData, ClinicIdentity, ControlledText, KitExtraPerson } from "../services/BrandKitApi";
import { loadDoctors, type Doctor } from "../services/DoctorApi";
import { loadTeamMembers, TEAM_ROLE_LABELS, type TeamMember } from "../services/TeamApi";
import { loadBackendPatients, type BackendPatient } from "../services/PatientApi";
import { loadBackendAppointments, type BackendAppointment } from "../services/AppointmentApi";
import {
  KIT_CSS, KIT_FONTS, DEFAULT_TEXTS, DOC_LABELS, REMINDER_LABELS, cardMessage, clinicCard, clinicCardQR, docHTML, personCard, qrData, reminderCard, reminderMessages, slug, todayISO, vcard,
} from "../utils/brandKit/templates";
import type { DocInput, DocType, KitClinic, KitPerson, Orient, ReminderInput, ReminderKind } from "../utils/brandKit/templates";
import { exportAll, exportItem, saveText, type ExportItem } from "../utils/brandKit/exporter";
import { errorMessage, toast } from "../utils/toast";

type TabKey = "identidade" | "documentos" | "cartoes" | "lembretes";
const TABS: [TabKey, string][] = [["identidade", "Identidade"], ["documentos", "Documentos"], ["cartoes", "Cartões digitais"], ["lembretes", "Lembretes"]];
interface PreviewItem extends ExportItem { label: string; html: string; message?: string }

const croOf = (d: Doctor) => (d.cro ? `CRO-${d.croState || ""} ${d.cro}`.replace("CRO- ", "CRO ") : "");
const nameOf = (d: Doctor) => `${d.user?.firstName || ""} ${d.user?.lastName || ""}`.trim();
const ROLE_SHORT: Record<string, string> = { ASB: "Auxiliar em saúde bucal (ASB)", TSB: "Técnico em saúde bucal (TSB)", LAB_PROTESE: "Laboratório de prótese" };
const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const blankText = (titulo: string, codigo: string, texto: string): ControlledText => ({ titulo, codigo, rev: "00", elab: "", aprov: "", texto });

/* Prévia em escala: o objeto mantém o tamanho real (px de impressão) e encolhe para caber. */
function FitPreview({ id, width, html }: { id: string; width: number; html: string }) {
  const box = useRef<HTMLDivElement>(null); const obj = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1); const [height, setHeight] = useState(0);
  useEffect(() => {
    const fit = () => { if (!box.current || !obj.current) return; const s = Math.min(1, box.current.clientWidth / width); setScale(s); setHeight(obj.current.offsetHeight * s); };
    fit(); const ro = new ResizeObserver(fit); if (box.current) ro.observe(box.current); if (obj.current) ro.observe(obj.current);
    return () => ro.disconnect();
  }, [width, html]);
  return (
    <Box ref={box} sx={{ width: "100%", maxWidth: width, position: "relative", overflow: "hidden", height }}>
      <div ref={obj} id={id} style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `scale(${scale})`, boxShadow: "0 1px 2px rgba(0,0,0,.08),0 8px 24px rgba(10,30,50,.10)" }} dangerouslySetInnerHTML={{ __html: html }} />
    </Box>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}><Typography variant="overline" sx={{ fontWeight: 800, color: "text.secondary", lineHeight: 1.4 }}>{title}</Typography>{children}</Box>;
}
const two = { display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 } as const;
const three = { display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr" }, gap: 1.5 } as const;

export default function BrandKit() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([k]) => k === params.get("aba")) ? params.get("aba") : "documentos") as TabKey;
  const setTab = (t: TabKey) => { const p = new URLSearchParams(params); p.set("aba", t); setParams(p, { replace: true }); };

  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<ClinicIdentity>({ name: "" });
  const [kit, setKit] = useState<BrandKitData>({});
  const [kitReady, setKitReady] = useState(true);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [patients, setPatients] = useState<BackendPatient[]>([]);
  const [appointments, setAppointments] = useState<BackendAppointment[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await loadBrandKit(); if (!alive) return;
        setIdentity(r.clinic); setKit(r.kit || {}); setKitReady(r.kitReady); applyIdentityToSession(r.clinic);
      } catch (e) { toast.error(errorMessage(e, "Não foi possível carregar a identidade da clínica.")); }
      const [d, t, p, a] = await Promise.all([loadDoctors().catch(() => []), loadTeamMembers().catch(() => []), loadBackendPatients().catch(() => []), loadBackendAppointments().catch(() => [])]);
      if (!alive) return; setDoctors(d.filter((x) => x.isActive !== false)); setTeam(t.filter((x) => x.isActive !== false)); setPatients(p); setAppointments(a); setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // fontes dos modelos
  useEffect(() => {
    if (document.getElementById("bkit-fonts")) return;
    const l = document.createElement("link"); l.id = "bkit-fonts"; l.rel = "stylesheet"; l.href = KIT_FONTS; document.head.appendChild(l);
  }, []);

  const clinic: KitClinic = useMemo(() => ({
    name: identity.displayName || identity.name || "Sua clínica", tagline: kit.tagline || "", logo: identity.logo || "", color: identity.primaryColor || "#1565C0",
    rtName: kit.rtName || "", rtCro: kit.rtCro || "", cnpj: identity.cnpj || "", phone: identity.phone || "", whatsapp: kit.whatsapp || "", email: identity.email || "",
    address: identity.address || "", city: [identity.city, identity.state].filter(Boolean).join(" – "), site: kit.site || "", instagram: kit.instagram || "",
  }), [identity, kit]);

  const people: KitPerson[] = useMemo(() => {
    const ov = kit.people || {};
    const base: KitPerson[] = [
      ...doctors.map((d) => ({ key: `d:${d.id}`, name: nameOf(d), role: `Cirurgião-dentista${d.specialty ? " · " + d.specialty : ""}`, cro: croOf(d), phone: d.user?.phone || "", email: d.user?.email || "" })),
      ...team.map((t) => ({ key: `t:${t.id}`, name: t.fullName, role: ROLE_SHORT[t.role] || TEAM_ROLE_LABELS[t.role] || t.role, cro: t.registryNumber || "", phone: t.phone || "", email: t.email || "" })),
      ...(kit.extraPeople || []),
    ];
    return base.map((p) => { const o = ov[p.key] || {}; return { ...p, role: o.role || p.role, phone: o.phone || p.phone, email: o.email || p.email }; });
  }, [doctors, team, kit]);
  const visiblePeople = people.filter((p) => !kit.people?.[p.key]?.hidden);
  const dentists = people.filter((p) => p.key.startsWith("d:"));

  /* ---------- documentos ---------- */
  const [docType, setDocType] = useState<DocType>("atestado");
  const [patientId, setPatientId] = useState("");
  const [profKey, setProfKey] = useState("");
  const [doc, setDoc] = useState<Omit<DocInput, "prof" | "manual" | "it" | "pop" | "contrato"> & { contrato: Omit<DocInput["contrato"], "texto"> }>({
    paciente: "", cpf: "", data: todayISO(),
    atestado: { tipo: "afastamento", dataAt: todayISO(), h1: "08:00", h2: "09:00", dias: "1", cid: "", cidOk: false },
    receita: { uso: "Uso interno", itens: "" },
    contrato: { tratamento: "", valor: "", pagamento: "" },
  });
  const texts = useMemo(() => ({
    contrato: kit.texts?.contrato ?? DEFAULT_TEXTS.contrato,
    manual: kit.texts?.manual ?? blankText("Manual de biossegurança", "MB-001", DEFAULT_TEXTS.manual),
    it: kit.texts?.it ?? blankText("Esterilização de instrumentais em autoclave", "IT-CME-001", DEFAULT_TEXTS.it),
    pop: kit.texts?.pop ?? blankText("Limpeza e desinfecção do consultório entre atendimentos", "POP-BIO-001", DEFAULT_TEXTS.pop),
  }), [kit.texts]);
  const setText = <K extends "manual" | "it" | "pop">(k: K, patch: Partial<ControlledText>) => setKit((s) => ({ ...s, texts: { ...s.texts, [k]: { ...texts[k], ...patch } } }));
  useEffect(() => { if (!profKey && dentists[0]) setProfKey(dentists[0].key); }, [dentists, profKey]);
  const pickPatient = (p: BackendPatient | null) => { setPatientId(p?.id || ""); setDoc((s) => ({ ...s, paciente: p?.fullName || "", cpf: p?.cpf || "" })); };
  const docInput: DocInput = { ...doc, prof: people.find((p) => p.key === profKey) || null, contrato: { ...doc.contrato, texto: texts.contrato }, manual: texts.manual, it: texts.it, pop: texts.pop };

  /* ---------- cartões ---------- */
  const orient: Orient = kit.cardOrient || "h";
  const cardQR = kit.cardQR !== false;
  const [newPerson, setNewPerson] = useState<KitExtraPerson>({ key: "", name: "", role: "", cro: "", phone: "", email: "" });

  /* ---------- lembretes ---------- */
  const upcoming = useMemo(() => { const now = Date.now() - 3600_000; return appointments.filter((a) => new Date(a.scheduledAt).getTime() >= now && !/CANCEL/i.test(a.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, 200); }, [appointments]);
  const [apptId, setApptId] = useState(params.get("agendamento") || "");
  const [rem, setRem] = useState<Omit<ReminderInput, "prof"> & { profKey: string }>({ kind: "lembrete24", paciente: "", data: todayISO(), hora: "09:00", profKey: "", proc: "", obs: "Chegue 10 minutos antes." });
  useEffect(() => {
    const a = appointments.find((x) => x.id === apptId); if (!a) return;
    const when = new Date(a.scheduledAt); const diff = Math.round((new Date(isoDate(when)).getTime() - new Date(todayISO()).getTime()) / 86400000);
    setRem((s) => ({ ...s, paciente: a.patient?.fullName || "", data: isoDate(when), hora: hhmm(when), proc: a.procedure || "", profKey: `d:${a.doctorId}`, kind: diff <= 0 ? "lembretedia" : diff === 1 ? "lembrete24" : "confirmacao" }));
  }, [apptId, appointments]);
  const remInput: ReminderInput = { ...rem, prof: people.find((p) => p.key === rem.profKey) || null };
  const messages = reminderMessages(clinic, remInput);

  /* ---------- prévias (QR é assíncrono) ---------- */
  const [items, setItems] = useState<PreviewItem[]>([]);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      let out: PreviewItem[] = [];
      const W = orient === "h" ? 350 : 270;
      if (tab === "documentos") out = [{ id: "bk-doc", label: DOC_LABELS[docType], html: docHTML(docType, clinic, docInput), width: 794, doc: true, file: `${slug(DOC_LABELS[docType])}${docInput.paciente && ["atestado", "receita", "contrato"].includes(docType) ? "-" + slug(docInput.paciente) : ""}` }];
      if (tab === "cartoes" || tab === "identidade") {
        const cq = cardQR ? await qrData(clinicCardQR(clinic)) : "";
        out = [{ id: "bk-card-clinica", label: "Cartão da clínica", html: clinicCard(clinic, tab === "identidade" ? "h" : orient, cq), width: tab === "identidade" ? 350 : W, file: `cartao-${slug(clinic.name)}`, message: cardMessage(clinic, null) }];
        if (tab === "cartoes") for (const p of visiblePeople) out.push({ id: `bk-card-${slug(p.key)}`, label: p.name || "Sem nome", html: personCard(clinic, p, orient, cardQR ? await qrData(vcard(p, clinic)) : ""), width: W, file: `cartao-${slug(p.name)}`, message: cardMessage(clinic, p) });
      }
      if (tab === "lembretes") out = [{ id: "bk-rem", label: "Cartão de lembrete", html: reminderCard(clinic, remInput), width: 360, file: `lembrete-${slug(remInput.paciente || "paciente")}-${remInput.data}` }];
      if (alive) setItems(out);
    }, 120);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, docType, JSON.stringify(docInput), JSON.stringify(remInput), clinic, orient, cardQR, JSON.stringify(visiblePeople)]);

  /* ---------- ações ---------- */
  const download = async (it: ExportItem, kind: "png" | "pdf") => { setBusy(it.id + kind); try { await exportItem(it, kind); } catch (e) { toast.error(errorMessage(e, "Não foi possível gerar o arquivo.")); } finally { setBusy(""); } };
  const downloadAll = async (kind: "png" | "pdf") => { setBusy("all" + kind); try { await exportAll(items, kind, `cartoes-${slug(clinic.name)}-${kind}`); toast.success(`${items.length} cartões baixados`); } catch (e) { toast.error(errorMessage(e, "Não foi possível gerar os arquivos.")); } finally { setBusy(""); } };
  const persistKit = async (next: BrandKitData, okMsg: string) => {
    setSaving(true);
    try { await saveBrandKit(next); setKitReady(true); toast.success(okMsg); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  };
  const saveIdentity = async () => {
    setSaving(true);
    try {
      const c = await saveClinicIdentity({ displayName: identity.displayName || null, logo: identity.logo || "", primaryColor: identity.primaryColor || "#1565C0", phone: identity.phone || "", email: identity.email || "", cnpj: identity.cnpj || "", address: identity.address || "", city: identity.city || "", state: identity.state || "" });
      setIdentity(c);
      try { await saveBrandKit(kit); setKitReady(true); } catch (e) { setKitReady(false); toast.info(errorMessage(e)); }
      toast.success("Identidade salva");
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  };
  const onLogo = async (f?: File | null) => { if (!f) return; try { const logo = await prepareLogo(f); setIdentity((s) => ({ ...s, logo })); } catch (e) { toast.error(errorMessage(e)); } };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success("Mensagem copiada"); } catch { toast.error("Não foi possível copiar. Selecione o texto e copie."); } };
  const setOverride = (key: string, patch: Record<string, string | boolean>) => setKit((s) => ({ ...s, people: { ...s.people, [key]: { ...(s.people?.[key] || {}), ...patch } } }));

  const idField = (k: keyof ClinicIdentity, label: string, type = "text") => <TextField size="small" label={label} type={type} value={(identity[k] as string) || ""} onChange={(e) => setIdentity({ ...identity, [k]: e.target.value })} />;
  const kitField = (k: "tagline" | "whatsapp" | "site" | "instagram" | "rtName" | "rtCro", label: string) => <TextField size="small" label={label} value={kit[k] || ""} onChange={(e) => setKit({ ...kit, [k]: e.target.value })} />;

  /* ---------- formulários por aba ---------- */
  let form: ReactNode = null;
  if (tab === "identidade") form = (
    <>
      <Section title="Logo e cor">
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <Box sx={{ width: 72, height: 72, borderRadius: 2, border: "1px solid", borderColor: "divider", bgcolor: "#fff", display: "grid", placeItems: "center", overflow: "hidden", flex: "none" }}>
            {identity.logo ? <Box component="img" src={identity.logo} alt="Logo" sx={{ maxWidth: 64, maxHeight: 64 }} /> : <Typography variant="caption" color="text.secondary">Sem logo</Typography>}
          </Box>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button component="label" variant="outlined" size="small" startIcon={<UploadIcon />}>Enviar logo<input hidden type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => onLogo(e.target.files?.[0])} /></Button>
            {identity.logo && <Button size="small" color="inherit" onClick={() => setIdentity({ ...identity, logo: "" })}>Remover</Button>}
            <TextField size="small" type="color" label="Cor" value={identity.primaryColor || "#1565C0"} onChange={(e) => setIdentity({ ...identity, primaryColor: e.target.value })} sx={{ width: 96 }} />
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary">A logo e a cor entram nos documentos, cartões, lembretes e no cabeçalho do sistema.</Typography>
      </Section>
      <Section title="Clínica ou consultório">
        <TextField size="small" label="Nome que aparece nos documentos" value={identity.displayName || ""} placeholder={identity.name} onChange={(e) => setIdentity({ ...identity, displayName: e.target.value })} helperText={`Em branco, usa o nome do cadastro: ${identity.name}`} />
        {kitField("tagline", "Frase curta (ex.: especialidades)")}
        <Box sx={two}>
          <TextField size="small" select label="Responsável técnico" value={dentists.find((d) => d.name === kit.rtName)?.key || ""} onChange={(e) => { const d = dentists.find((x) => x.key === e.target.value); if (d) setKit({ ...kit, rtName: d.name, rtCro: d.cro }); }}>
            {dentists.length ? dentists.map((d) => <MenuItem key={d.key} value={d.key}>{d.name}</MenuItem>) : <MenuItem value="" disabled>Cadastre os dentistas na Equipe</MenuItem>}
          </TextField>
          {kitField("rtCro", "CRO do responsável")}
        </Box>
        {kitField("rtName", "Nome do responsável técnico")}
        {idField("cnpj", "CNPJ ou CPF")}
      </Section>
      <Section title="Contato">
        <Box sx={two}>{idField("phone", "Telefone")}{kitField("whatsapp", "WhatsApp")}</Box>
        {idField("email", "E-mail", "email")}
        {idField("address", "Endereço")}
        <Box sx={three}>{idField("city", "Cidade")}{idField("state", "UF")}{idField("zipCode", "CEP")}</Box>
        <Box sx={two}>{kitField("site", "Site")}{kitField("instagram", "Instagram")}</Box>
      </Section>
      {!kitReady && <Alert severity="info">WhatsApp, site, frase e responsável técnico serão guardados assim que a atualização do banco for concluída. Nome, logo, cor e contatos já são salvos.</Alert>}
      <Button variant="contained" startIcon={<SaveIcon />} disabled={saving} onClick={saveIdentity}>Salvar identidade</Button>
    </>
  );

  if (tab === "documentos") {
    const d = doc; const set = (patch: Partial<typeof doc>) => setDoc({ ...d, ...patch });
    const patientFields = (
      <>
        <Autocomplete options={patients} getOptionLabel={(p) => p.fullName + (p.recordNumber ? ` · nº ${p.recordNumber}` : "")} value={patients.find((p) => p.id === patientId) || null} onChange={(_, v) => pickPatient(v)} renderInput={(p) => <TextField {...p} size="small" label="Paciente" />} />
        <Box sx={two}><TextField size="small" label="Nome no documento" value={d.paciente} onChange={(e) => set({ paciente: e.target.value })} /><TextField size="small" label="CPF" value={d.cpf} onChange={(e) => set({ cpf: e.target.value })} /></Box>
        <Box sx={two}>
          <TextField size="small" type="date" label="Data do documento" value={d.data} onChange={(e) => set({ data: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" select label="Profissional que assina" value={profKey} onChange={(e) => setProfKey(e.target.value)}>{dentists.map((p) => <MenuItem key={p.key} value={p.key}>{p.name}{p.cro ? ` · ${p.cro}` : ""}</MenuItem>)}</TextField>
        </Box>
      </>
    );
    const controlled = (k: "manual" | "it" | "pop") => (
      <>
        {k !== "manual" && <TextField size="small" label="Título" value={texts[k].titulo} onChange={(e) => setText(k, { titulo: e.target.value })} />}
        <Box sx={two}><TextField size="small" label="Código" value={texts[k].codigo} onChange={(e) => setText(k, { codigo: e.target.value })} /><TextField size="small" label="Revisão" value={texts[k].rev} onChange={(e) => setText(k, { rev: e.target.value })} /></Box>
        <Box sx={two}><TextField size="small" label="Elaborado por" value={texts[k].elab} onChange={(e) => setText(k, { elab: e.target.value })} /><TextField size="small" label="Aprovado por" value={texts[k].aprov} onChange={(e) => setText(k, { aprov: e.target.value })} /></Box>
        <TextField size="small" type="date" label="Data de emissão" value={d.data} onChange={(e) => set({ data: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="Conteúdo" multiline minRows={14} value={texts[k].texto} onChange={(e) => setText(k, { texto: e.target.value })} sx={{ "& textarea": { fontFamily: "ui-monospace,Menlo,Consolas,monospace", fontSize: 12 } }} />
        <Typography variant="caption" color="text.secondary"># vira título, - vira item, 1. vira etapa numerada.</Typography>
        <Button variant="outlined" startIcon={<SaveIcon />} disabled={saving} onClick={() => persistKit({ ...kit, texts: { ...kit.texts, [k]: texts[k] } }, "Texto salvo para a clínica")}>Salvar este texto na clínica</Button>
      </>
    );
    form = (
      <>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>{(Object.keys(DOC_LABELS) as DocType[]).map((k) => <Chip key={k} label={DOC_LABELS[k].split(" – ")[0]} color={docType === k ? "primary" : "default"} onClick={() => setDocType(k)} />)}</Box>
        {docType === "atestado" && <>{patientFields}
          <TextField size="small" select label="Tipo" value={d.atestado.tipo} onChange={(e) => set({ atestado: { ...d.atestado, tipo: e.target.value as "afastamento" | "comparecimento" } })}><MenuItem value="afastamento">Afastamento (dias)</MenuItem><MenuItem value="comparecimento">Comparecimento</MenuItem></TextField>
          <Box sx={three}>
            <TextField size="small" type="date" label="Atendimento" value={d.atestado.dataAt} onChange={(e) => set({ atestado: { ...d.atestado, dataAt: e.target.value } })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="time" label="Das" value={d.atestado.h1} onChange={(e) => set({ atestado: { ...d.atestado, h1: e.target.value } })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="time" label="Às" value={d.atestado.h2} onChange={(e) => set({ atestado: { ...d.atestado, h2: e.target.value } })} slotProps={{ inputLabel: { shrink: true } }} />
          </Box>
          {d.atestado.tipo === "afastamento" && <TextField size="small" type="number" label="Dias de afastamento" value={d.atestado.dias} onChange={(e) => set({ atestado: { ...d.atestado, dias: e.target.value } })} />}
          <TextField size="small" label="CID-10 (opcional)" value={d.atestado.cid} onChange={(e) => set({ atestado: { ...d.atestado, cid: e.target.value } })} />
          <FormControlLabel control={<Checkbox checked={d.atestado.cidOk} onChange={(e) => set({ atestado: { ...d.atestado, cidOk: e.target.checked } })} />} label="Paciente autorizou incluir o CID" />
          <Typography variant="caption" color="text.secondary">Sem a autorização marcada, o CID não sai no atestado.</Typography>
        </>}
        {docType === "receita" && <>{patientFields}
          <TextField size="small" select label="Via" value={d.receita.uso} onChange={(e) => set({ receita: { ...d.receita, uso: e.target.value } })}>{["Uso interno", "Uso externo", "Uso interno e externo"].map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}</TextField>
          <TextField label="Medicamentos" multiline minRows={8} value={d.receita.itens} onChange={(e) => set({ receita: { ...d.receita, itens: e.target.value } })} placeholder={"Amoxicilina 500 mg — 21 cápsulas\nTomar 1 cápsula de 8 em 8 horas por 7 dias.\n\nDipirona 500 mg — 10 comprimidos\nTomar 1 comprimido de 6 em 6 horas, se dor."} helperText="Primeira linha: medicamento. Linhas de baixo: posologia. Linha em branco separa os itens." />
          <Typography variant="caption" color="text.secondary">Receituário simples. Medicamentos de controle especial exigem o formulário próprio da Portaria 344/98.</Typography>
        </>}
        {docType === "contrato" && <>{patientFields}
          <TextField size="small" label="Tratamento" value={d.contrato.tratamento} onChange={(e) => set({ contrato: { ...d.contrato, tratamento: e.target.value } })} />
          <Box sx={two}><TextField size="small" label="Valor total" value={d.contrato.valor} onChange={(e) => set({ contrato: { ...d.contrato, valor: e.target.value } })} /><TextField size="small" label="Forma de pagamento" value={d.contrato.pagamento} onChange={(e) => set({ contrato: { ...d.contrato, pagamento: e.target.value } })} /></Box>
          <TextField label="Texto do contrato" multiline minRows={14} value={texts.contrato} onChange={(e) => setKit((s) => ({ ...s, texts: { ...s.texts, contrato: e.target.value } }))} sx={{ "& textarea": { fontFamily: "ui-monospace,Menlo,Consolas,monospace", fontSize: 12 } }} />
          <Typography variant="caption" color="text.secondary">Campos entre chaves são preenchidos sozinhos: {"{paciente} {cpf} {clinica} {cnpj} {valor} {pagamento} {tratamento} {cidade}"}. Modelo base: revise com o jurídico antes do uso.</Typography>
          <Button variant="outlined" startIcon={<SaveIcon />} disabled={saving} onClick={() => persistKit({ ...kit, texts: { ...kit.texts, contrato: texts.contrato } }, "Contrato salvo para a clínica")}>Salvar texto do contrato na clínica</Button>
        </>}
        {(docType === "manual" || docType === "it" || docType === "pop") && controlled(docType)}
      </>
    );
  }

  if (tab === "cartoes") form = (
    <>
      <Section title="Formato">
        <ToggleButtonGroup exclusive size="small" value={orient} onChange={(_, v: Orient | null) => v && setKit({ ...kit, cardOrient: v })}><ToggleButton value="h">Horizontal (cartão)</ToggleButton><ToggleButton value="v">Vertical (celular)</ToggleButton></ToggleButtonGroup>
        <FormControlLabel control={<Checkbox checked={cardQR} onChange={(e) => setKit({ ...kit, cardQR: e.target.checked })} />} label="QR code no cartão (WhatsApp da clínica / salvar contato)" />
      </Section>
      <Section title="Equipe nos cartões">
        <Typography variant="caption" color="text.secondary">Dentistas e auxiliares vêm da Equipe. Aqui você ajusta cargo, telefone e e-mail só para o cartão.</Typography>
        {people.map((p) => {
          const o = kit.people?.[p.key] || {}; const extra = p.key.startsWith("x:");
          return (
            <Paper key={p.key} variant="outlined" sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1, opacity: o.hidden ? 0.55 : 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>{p.name}{p.cro ? <Typography component="span" variant="caption" color="text.secondary">{` · ${p.cro}`}</Typography> : null}</Typography>
                {extra ? <Button size="small" color="inherit" onClick={() => setKit({ ...kit, extraPeople: (kit.extraPeople || []).filter((x) => x.key !== p.key) })}>Remover</Button>
                  : <FormControlLabel sx={{ mr: 0 }} control={<Checkbox size="small" checked={!o.hidden} onChange={(e) => setOverride(p.key, { hidden: !e.target.checked })} />} label="Cartão" />}
              </Box>
              <TextField size="small" label="Cargo / função" value={p.role} onChange={(e) => (extra ? setKit({ ...kit, extraPeople: (kit.extraPeople || []).map((x) => (x.key === p.key ? { ...x, role: e.target.value } : x)) }) : setOverride(p.key, { role: e.target.value }))} />
              <Box sx={two}>
                <TextField size="small" label="Telefone" value={p.phone} onChange={(e) => (extra ? setKit({ ...kit, extraPeople: (kit.extraPeople || []).map((x) => (x.key === p.key ? { ...x, phone: e.target.value } : x)) }) : setOverride(p.key, { phone: e.target.value }))} />
                <TextField size="small" label="E-mail" value={p.email} onChange={(e) => (extra ? setKit({ ...kit, extraPeople: (kit.extraPeople || []).map((x) => (x.key === p.key ? { ...x, email: e.target.value } : x)) }) : setOverride(p.key, { email: e.target.value }))} />
              </Box>
            </Paper>
          );
        })}
      </Section>
      <Section title="Pessoal de apoio (recepção, gestão, limpeza)">
        <Box sx={two}><TextField size="small" label="Nome" value={newPerson.name} onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })} /><TextField size="small" label="Cargo / função" value={newPerson.role} onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value })} /></Box>
        <Box sx={three}><TextField size="small" label="CRO (se houver)" value={newPerson.cro} onChange={(e) => setNewPerson({ ...newPerson, cro: e.target.value })} /><TextField size="small" label="Telefone" value={newPerson.phone} onChange={(e) => setNewPerson({ ...newPerson, phone: e.target.value })} /><TextField size="small" label="E-mail" value={newPerson.email} onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })} /></Box>
        <Button variant="outlined" startIcon={<PersonAddIcon />} disabled={!newPerson.name.trim()} onClick={() => { setKit({ ...kit, extraPeople: [...(kit.extraPeople || []), { ...newPerson, key: `x:${Date.now().toString(36)}` }] }); setNewPerson({ key: "", name: "", role: "", cro: "", phone: "", email: "" }); }}>Adicionar pessoa</Button>
      </Section>
      <Button variant="contained" startIcon={<SaveIcon />} disabled={saving} onClick={() => persistKit(kit, "Cartões salvos")}>Salvar cartões</Button>
    </>
  );

  if (tab === "lembretes") form = (
    <>
      <TextField size="small" select label="Agendamento" value={apptId} onChange={(e) => setApptId(e.target.value)} helperText={upcoming.length ? "Escolha para preencher sozinho, ou digite os dados abaixo." : "Nenhum agendamento futuro. Preencha os dados abaixo."}>
        <MenuItem value="">Preencher à mão</MenuItem>
        {upcoming.map((a) => { const w = new Date(a.scheduledAt); return <MenuItem key={a.id} value={a.id}>{`${w.toLocaleDateString("pt-BR")} ${hhmm(w)} · ${a.patient?.fullName || "Paciente"}`}</MenuItem>; })}
      </TextField>
      <TextField size="small" select label="Tipo de aviso" value={rem.kind} onChange={(e) => setRem({ ...rem, kind: e.target.value as ReminderKind })}>{(Object.keys(REMINDER_LABELS) as ReminderKind[]).map((k) => <MenuItem key={k} value={k}>{REMINDER_LABELS[k]}</MenuItem>)}</TextField>
      <TextField size="small" label="Paciente" value={rem.paciente} onChange={(e) => setRem({ ...rem, paciente: e.target.value })} />
      <Box sx={two}>
        <TextField size="small" type="date" label="Data" value={rem.data} onChange={(e) => setRem({ ...rem, data: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="time" label="Horário" value={rem.hora} onChange={(e) => setRem({ ...rem, hora: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      <TextField size="small" select label="Profissional" value={rem.profKey} onChange={(e) => setRem({ ...rem, profKey: e.target.value })}>{dentists.map((p) => <MenuItem key={p.key} value={p.key}>{p.name}</MenuItem>)}</TextField>
      <TextField size="small" label="Procedimento" value={rem.proc} onChange={(e) => setRem({ ...rem, proc: e.target.value })} />
      <TextField size="small" label="Observação" value={rem.obs} onChange={(e) => setRem({ ...rem, obs: e.target.value })} />
      <Typography variant="caption" color="text.secondary">O cartão sai em imagem 4:5 para anexar no WhatsApp ou Instagram. As mensagens ao lado já vêm prontas para cada canal.</Typography>
    </>
  );

  const multi = items.length > 1;
  const first = items[0];

  return (
    <Box className="bkit" sx={{ pb: 10 }}>
      <style>{KIT_CSS}</style>
      <PageHeader title="Kit da clínica" description="Documentos, cartões digitais e lembretes com a logo e os dados da sua clínica." />
      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} variant="scrollable" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {TABS.map(([k, l]) => <Tab key={k} value={k} label={l} />)}
      </Tabs>
      {loading && <Alert severity="info" sx={{ mb: 2 }}>Carregando dados da clínica…</Alert>}
      {!loading && !identity.logo && tab !== "identidade" && <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => setTab("identidade")}>Enviar logo</Button>}>Sua clínica ainda está sem logo. Os modelos usam as iniciais até a logo ser enviada.</Alert>}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,400px) minmax(0,1fr)" }, gap: 3, alignItems: "start" }}>
        <Paper variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5, borderRadius: 3, minWidth: 0 }}>{form}</Paper>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          {tab === "cartoes" && <Alert severity="info">Quem recebe o cartão no celular não consegue escanear o QR na própria tela. Envie a imagem junto com o texto com link: no WhatsApp, o link abre a conversa com um toque. No PDF, telefone, WhatsApp, e-mail, endereço e site já são clicáveis.</Alert>}
          <Box sx={{ display: "grid", gridTemplateColumns: tab === "cartoes" ? { xs: "minmax(0,1fr)", md: "repeat(auto-fill,minmax(360px,1fr))" } : "minmax(0,1fr)", gap: 3 }}>
            {items.map((it) => (
              <Box key={it.id} sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontWeight: 700, mr: "auto" }}>{it.label}</Typography>
                  {(it.doc ? (["pdf", "png"] as const) : (["png", "pdf"] as const)).map((k, i) => (
                    <Button key={k} size="small" variant={i === 0 ? "contained" : "outlined"} startIcon={<DownloadIcon />} disabled={!!busy} onClick={() => download(it, k)}>{busy === it.id + k ? "Gerando…" : `Baixar ${k.toUpperCase()}`}</Button>
                  ))}
                </Box>
                <FitPreview id={it.id} width={it.width} html={it.html} />
                {it.message && tab === "cartoes" && (
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copy(it.message || "")}>Copiar texto com link</Button>
                    <Button size="small" component="a" href={`https://wa.me/?text=${encodeURIComponent(it.message)}`} target="_blank" rel="noopener">Enviar texto pelo WhatsApp</Button>
                  </Box>
                )}
              </Box>
            ))}
          </Box>

          {tab === "lembretes" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Typography variant="overline" sx={{ fontWeight: 800, color: "text.secondary" }}>Mensagens prontas por canal</Typography>
              {messages.map((m) => (
                <Paper key={m.key} variant="outlined" sx={{ p: 1.5, borderRadius: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography sx={{ fontWeight: 700, mr: "auto" }}>{m.label}</Typography>
                    {m.limit && <Typography variant="caption" sx={{ fontFamily: "monospace", color: m.text.length > m.limit ? "error.main" : "text.secondary" }}>{`${m.text.length}/${m.limit}`}</Typography>}
                    <Button size="small" variant="contained" startIcon={<ContentCopyIcon />} onClick={() => copy(m.text)}>Copiar</Button>
                    <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={() => saveText(`mensagem-${m.key}-${slug(rem.paciente || "paciente")}.txt`, m.text)}>TXT</Button>
                  </Box>
                  <Box component="pre" sx={{ m: 0, p: 1.25, bgcolor: "action.hover", borderRadius: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", fontSize: 13, maxHeight: 260, overflow: "auto" }}>{m.text}</Box>
                </Paper>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {first && tab !== "identidade" && (
        <Paper elevation={6} sx={{ position: "sticky", bottom: 12, mt: 3, p: 1.5, borderRadius: 3, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", zIndex: 5 }}>
          <Box sx={{ mr: "auto", minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800 }}>{multi ? `${items.length} cartões` : first.label}</Typography>
            <Typography variant="caption" color="text.secondary">Baixe com a logo e os dados da clínica</Typography>
          </Box>
          {multi ? (
            <>
              <Button variant="contained" startIcon={<DownloadIcon />} disabled={!!busy} onClick={() => downloadAll("png")}>{busy === "allpng" ? "Gerando…" : "Baixar todos (PNG em ZIP)"}</Button>
              <Button variant="outlined" startIcon={<DownloadIcon />} disabled={!!busy} onClick={() => downloadAll("pdf")}>{busy === "allpdf" ? "Gerando…" : "Todos em PDF (ZIP)"}</Button>
            </>
          ) : (first.doc ? (["pdf", "png"] as const) : (["png", "pdf"] as const)).map((k, i) => (
            <Button key={k} variant={i === 0 ? "contained" : "outlined"} startIcon={<DownloadIcon />} disabled={!!busy} onClick={() => download(first, k)}>{`Baixar ${k.toUpperCase()}`}</Button>
          ))}
        </Paper>
      )}
      <div id="bkit-stage" aria-hidden="true" style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }} />
    </Box>
  );
}
