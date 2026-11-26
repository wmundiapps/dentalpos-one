import { useEffect, useState } from "react";
import { Alert, Box, Button, MenuItem, TextField, Typography } from "@mui/material";
import { updateBackendPatient, type BackendPatient, type PatientGender, type PatientStatus } from "../../services/PatientApi";
import { errorMessage, toast } from "../../utils/toast";

const GENDERS: PatientGender[] = ["Feminino", "Masculino", "Outro", "Não informado"];
const STATUSES: PatientStatus[] = ["Ativo", "Em acompanhamento", "Inativo"];
const toDateInput = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

type Form = {
  fullName: string; cpf: string; rg: string; birthDate: string; gender: string; phone: string; email: string;
  address: string; city: string; state: string; zipCode: string; status: string; mainComplaint: string; notes: string;
};
const toForm = (p: BackendPatient): Form => ({
  fullName: p.fullName || "", cpf: p.cpf || "", rg: p.rg || "", birthDate: toDateInput(p.birthDate), gender: p.gender || "Não informado",
  phone: p.phone || "", email: p.email || "", address: p.address || "", city: p.city || "", state: p.state || "", zipCode: p.zipCode || "",
  status: p.status || "Ativo", mainComplaint: p.mainComplaint || "", notes: p.notes || "",
});

// Aba 1 do caderno: dados pessoais, contato e endereço (editáveis).
export default function PatientDataTab({ patient, onSaved }: { patient: BackendPatient; onSaved: (p: BackendPatient) => void }) {
  const [form, setForm] = useState<Form>(toForm(patient));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setForm(toForm(patient)), [patient]);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (form.fullName.trim().length < 3 || form.phone.trim().length < 8) { setError("Informe pelo menos o nome completo e o telefone."); return; }
    setBusy(true); setError("");
    try {
      const updated = await updateBackendPatient(patient.id, {
        fullName: form.fullName.trim(), cpf: form.cpf.trim(), rg: form.rg.trim(), birthDate: form.birthDate, gender: form.gender as PatientGender,
        phone: form.phone.trim(), email: form.email.trim(), address: form.address.trim(), city: form.city.trim(), state: form.state.trim().toUpperCase(),
        zipCode: form.zipCode.trim(), status: form.status as PatientStatus, mainComplaint: form.mainComplaint.trim(), notes: form.notes.trim(),
      });
      onSaved(updated);
      toast.success("Dados do paciente salvos.");
    } catch (e) { const m = errorMessage(e, "Não foi possível salvar os dados."); setError(m); toast.error(m); }
    finally { setBusy(false); }
  };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>Dados pessoais</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr" }, gap: 2 }}>
        <TextField required label="Nome completo" value={form.fullName} onChange={set("fullName")} />
        <TextField label="CPF" value={form.cpf} onChange={set("cpf")} />
        <TextField label="RG" value={form.rg} onChange={set("rg")} />
        <TextField type="date" label="Nascimento" value={form.birthDate} onChange={set("birthDate")} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField select label="Sexo" value={form.gender} onChange={set("gender")}>{GENDERS.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}</TextField>
        <TextField select label="Situação" value={form.status} onChange={set("status")}>{STATUSES.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}</TextField>
        <TextField required label="Telefone / WhatsApp" value={form.phone} onChange={set("phone")} />
        <TextField label="E-mail" value={form.email} onChange={set("email")} sx={{ gridColumn: { md: "span 2" } }} />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>Endereço</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 80px 1fr" }, gap: 2 }}>
        <TextField label="Rua, número e complemento" value={form.address} onChange={set("address")} />
        <TextField label="Cidade" value={form.city} onChange={set("city")} />
        <TextField label="UF" value={form.state} onChange={set("state")} slotProps={{ htmlInput: { maxLength: 2 } }} />
        <TextField label="CEP" value={form.zipCode} onChange={set("zipCode")} />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <TextField multiline minRows={2} label="Queixa principal" value={form.mainComplaint} onChange={set("mainComplaint")} />
        <TextField multiline minRows={2} label="Observações" value={form.notes} onChange={set("notes")} />
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Box><Button variant="contained" disabled={busy} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar dados do paciente"}</Button></Box>
    </Box>
  );
}
