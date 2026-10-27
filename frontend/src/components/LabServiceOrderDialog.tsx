import { useEffect, useMemo, useState } from "react";
import { Alert, Autocomplete, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import { loadBackendDoctors, type BackendDoctor } from "../services/AppointmentApi";
import { loadBackendPatients, type BackendPatient } from "../services/PatientApi";
import { loadTeamMembers, type TeamMember } from "../services/TeamApi";
import { createLabServiceOrder, type LabServiceOrder } from "../services/LabServiceOrderApi";

export interface LabOrderPrefill { patientId?: string; patientName?: string; patientContact?: string; dentistName?: string; appointmentId?: string }
interface Props { open: boolean; prefill?: LabOrderPrefill; onClose: () => void; onCreated: (order: LabServiceOrder) => void }

const SERVICES = ["Coroa unitária", "Coroa sobre implante", "Prótese total", "Prótese parcial removível", "Prótese fixa (ponte)", "Faceta / lente de contato", "Provisório", "Placa miorrelaxante", "Guia cirúrgico", "Reparo / ajuste", "Outro"];
const today = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const digits = (v: string) => v.replace(/\D/g, "");
const dentistKey = (name: string) => `completodonto.dentistContact.${name.trim().toLowerCase()}`;

export default function LabServiceOrderDialog({ open, prefill, onClose, onCreated }: Props) {
  const [patients, setPatients] = useState<BackendPatient[]>([]);
  const [doctors, setDoctors] = useState<BackendDoctor[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [f, setF] = useState({ patientId: "", patientName: "", patientContact: "", dentistName: "", dentistContact: "", assistantName: "", laboratoryName: "", service: "", shade: "", elements: "", sentAt: today(), dueAt: "" });
  const [flags, setFlags] = useState({ scanUpper: false, scanLower: false, scanBite: false, impressionUpper: false, impressionLower: false, waxBite: false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setFlags({ scanUpper: false, scanLower: false, scanBite: false, impressionUpper: false, impressionLower: false, waxBite: false });
    let contact = "";
    try { contact = prefill?.dentistName ? localStorage.getItem(dentistKey(prefill.dentistName)) || "" : ""; } catch { /* sem armazenamento */ }
    setF({ patientId: prefill?.patientId || "", patientName: prefill?.patientName || "", patientContact: prefill?.patientContact || "", dentistName: prefill?.dentistName || "", dentistContact: contact, assistantName: "", laboratoryName: "", service: "", shade: "", elements: "", sentAt: today(), dueAt: "" });
    loadBackendPatients().then(setPatients).catch(() => setPatients([]));
    loadBackendDoctors().then(setDoctors).catch(() => setDoctors([]));
    loadTeamMembers().then(setTeam).catch(() => setTeam([]));
  }, [open, prefill]);

  const doctorNames = useMemo(() => doctors.map((d) => `Dr(a). ${d.user.firstName} ${d.user.lastName}`.trim()), [doctors]);
  const assistants = useMemo(() => team.filter((m) => m.role === "ASB" || m.role === "TSB").map((m) => m.fullName), [team]);
  const labs = useMemo(() => team.filter((m) => m.role === "LAB_PROTESE"), [team]);
  const set = (k: keyof typeof f, v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const flag = (k: keyof typeof flags, label: string) => <FormControlLabel key={k} control={<Checkbox checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} />} label={label} />;

  const submit = async () => {
    setError("");
    const missing = (Object.entries(f) as Array<[string, string]>).filter(([k, v]) => k !== "patientId" && !v.trim());
    if (missing.length) { setError("Todos os campos são obrigatórios. Confira os campos em vermelho."); return; }
    if (f.patientName.trim().split(/\s+/).length < 2) { setError("Informe nome e sobrenome do paciente."); return; }
    if (digits(f.patientContact).length < 10 || digits(f.dentistContact).length < 10) { setError("Informe o contato do paciente e do dentista com DDD."); return; }
    if (!Object.values(flags).some(Boolean)) { setError("Marque o que acompanha o trabalho (escaneamento ou moldagem/mordida em cera)."); return; }
    if (f.dueAt < f.sentAt) { setError("A data de entrega não pode ser anterior à data do envio."); return; }
    setSaving(true);
    try {
      const order = await createLabServiceOrder({ ...f, ...flags, patientId: f.patientId || null, appointmentId: prefill?.appointmentId || null });
      try { localStorage.setItem(dentistKey(f.dentistName), f.dentistContact); } catch { /* sem armazenamento */ }
      onCreated(order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar a ordem de serviço.");
    } finally {
      setSaving(false);
    }
  };

  const bad = (v: string) => (error && !v.trim() ? { error: true } : {});

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 900 }}>Ordem de serviço para o laboratório</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
        <Typography variant="body2" color="text.secondary">Todos os campos são obrigatórios. Ao salvar, o sistema gera o número de protocolo para imprimir e colar nas moldeiras e na mordida em cera.</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <Autocomplete freeSolo options={patients} getOptionLabel={(o) => (typeof o === "string" ? o : o.fullName)} inputValue={f.patientName}
            onInputChange={(_, v) => set("patientName", v)}
            onChange={(_, v) => { if (v && typeof v !== "string") setF((cur) => ({ ...cur, patientId: v.id, patientName: v.fullName, patientContact: cur.patientContact || v.phone || "" })); }}
            renderInput={(p) => <TextField {...p} label="Nome e sobrenome do paciente" {...bad(f.patientName)} />} />
          <TextField label="Contato do paciente" value={f.patientContact} onChange={(e) => set("patientContact", e.target.value)} {...bad(f.patientContact)} />
          <Autocomplete freeSolo options={doctorNames} inputValue={f.dentistName}
            onInputChange={(_, v) => { set("dentistName", v); try { const c = localStorage.getItem(dentistKey(v)); if (c) set("dentistContact", c); } catch { /* sem armazenamento */ } }}
            renderInput={(p) => <TextField {...p} label="Dentista responsável" {...bad(f.dentistName)} />} />
          <TextField label="Contato do dentista responsável" value={f.dentistContact} onChange={(e) => set("dentistContact", e.target.value)} {...bad(f.dentistContact)} />
          <Autocomplete freeSolo options={assistants} inputValue={f.assistantName} onInputChange={(_, v) => set("assistantName", v)}
            renderInput={(p) => <TextField {...p} label="Auxiliar responsável" {...bad(f.assistantName)} />} />
          {labs.length ? (
            <TextField select label="Laboratório enviado" value={f.laboratoryName} onChange={(e) => set("laboratoryName", e.target.value)} {...bad(f.laboratoryName)}>
              {labs.map((l) => { const name = l.companyName ? `${l.companyName} — ${l.fullName}` : l.fullName; return <MenuItem key={l.id} value={name}>{name}</MenuItem>; })}
            </TextField>
          ) : (
            <TextField label="Laboratório enviado" value={f.laboratoryName} onChange={(e) => set("laboratoryName", e.target.value)} {...bad(f.laboratoryName)} helperText="Cadastre o laboratório na Equipe para escolher da lista." />
          )}
          <Autocomplete freeSolo options={SERVICES} inputValue={f.service} onInputChange={(_, v) => set("service", v)} renderInput={(p) => <TextField {...p} label="Serviço a ser executado" {...bad(f.service)} />} />
          <TextField label="Cor do elemento" value={f.shade} onChange={(e) => set("shade", e.target.value)} placeholder="Ex.: A2" {...bad(f.shade)} />
          <TextField label="Quais elementos têm que fazer" value={f.elements} onChange={(e) => set("elements", e.target.value)} placeholder="Ex.: 11, 12, 21" {...bad(f.elements)} />
          <TextField type="date" label="Data do envio" value={f.sentAt} onChange={(e) => set("sentAt", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} {...bad(f.sentAt)} />
          <TextField type="date" label="Data de entrega" value={f.dueAt} onChange={(e) => set("dueAt", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} {...bad(f.dueAt)} />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.5 }}>
            <Typography sx={{ fontWeight: 800 }}>O que acompanha — escaneamento</Typography>
            <Box sx={{ display: "grid" }}>{flag("scanUpper", "A) Superior")}{flag("scanLower", "B) Inferior")}{flag("scanBite", "C) Registro de mordida")}</Box>
          </Box>
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.5 }}>
            <Typography sx={{ fontWeight: 800 }}>Serviços analógicos — moldagem</Typography>
            <Box sx={{ display: "grid" }}>{flag("impressionUpper", "Superior")}{flag("impressionLower", "Inferior")}{flag("waxBite", "Mordida em cera")}</Box>
          </Box>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={saving}>{saving ? "Gerando..." : "Gerar ordem e protocolo"}</Button>
      </DialogActions>
    </Dialog>
  );
}
