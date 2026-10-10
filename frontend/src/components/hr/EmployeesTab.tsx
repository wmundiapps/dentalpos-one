import { useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { HrApi, fmtDate, money, type Employee } from "../../services/HrApi";

const CATEGORIES = ["Cirurgião-dentista", "ASB", "TSB", "Técnico em Prótese Dentária", "Auxiliar de Laboratório", "Recepção", "Administrativo", "Financeiro", "Comercial", "Marketing", "Zeladoria", "Manutenção", "Professor", "Tutor", "Representante", "Estagiário", "Outro"];
const MODELS = ["CLT", "PJ", "Autônomo", "Estágio", "Diária", "Percentual", "Locação de espaço", "Terceirizado"];
export const STATUS_OPTIONS: Array<[string, string]> = [["ACTIVE", "Ativo"], ["EXPERIENCE", "Experiência"], ["VACATION", "Férias"], ["LEAVE", "Afastado"], ["NOTICE", "Aviso-prévio"], ["TERMINATED", "Desligado"]];
const today = () => new Date().toISOString().slice(0, 10);
const blank = { name: "", category: "Outro", position: "", department: "", employmentModel: "CLT", status: "ACTIVE", admissionDate: today(), experienceEndDate: "", baseSalary: "", monthlyWorkload: "220", supervisor: "", phone: "", email: "", cpf: "", pixKey: "", notes: "" };

export default function EmployeesTab({ employees, onChanged }: { employees: Employee[]; onChanged: () => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const openNew = () => { setEditing(null); setForm(blank); setError(""); setOpen(true); };
  const openEdit = (e: Employee) => {
    setEditing(e); setError("");
    setForm({ name: e.name, category: e.category, position: e.position, department: e.department, employmentModel: e.employmentModel, status: e.status, admissionDate: e.admissionDate.slice(0, 10), experienceEndDate: (e.experienceEndDate || "").slice(0, 10), baseSalary: String(e.baseSalary ?? ""), monthlyWorkload: String(e.monthlyWorkload), supervisor: e.supervisor || "", phone: e.phone || "", email: e.email || "", cpf: e.cpf || "", pixKey: e.pixKey || "", notes: e.notes || "" });
    setOpen(true);
  };
  const save = async () => {
    if (!form.name.trim() || !form.position.trim()) { setError("Informe nome e cargo."); return; }
    setBusy(true); setError("");
    try {
      await HrApi.saveEmployee(editing?.id || null, {
        ...form, employeeCode: editing?.employeeCode || `DP-${String(employees.length + 1).padStart(4, "0")}-${Date.now().toString(36).slice(-3).toUpperCase()}`,
        department: form.department.trim() || "Geral", baseSalary: Number(form.baseSalary) || 0, monthlyWorkload: Number(form.monthlyWorkload) || 220,
        email: form.email.trim().toLowerCase() || null, experienceEndDate: form.experienceEndDate || null,
      });
      setOpen(false); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  };

  const list = employees.filter((e) => `${e.name} ${e.position} ${e.department}`.toLowerCase().includes(search.toLowerCase()));
  const label = (s: string) => STATUS_OPTIONS.find(([v]) => v === s)?.[1] || s;
  return (
    <Box>
      <Box sx={{ p: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" placeholder="Buscar colaborador..." value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 280 }} />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={openNew}>Novo colaborador</Button>
      </Box>
      <Alert severity="info" sx={{ mx: 2, mb: 1 }}>Para o colaborador bater o ponto, cadastre o <b>mesmo e-mail</b> que ele usa para entrar no sistema.</Alert>
      {list.length === 0 && <Typography color="text.secondary" sx={{ p: 2 }}>Nenhum colaborador cadastrado.</Typography>}
      {list.map((e) => (
        <Box key={e.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1.3fr 1fr 1fr auto" }, gap: 2, p: 2, borderTop: "1px solid", borderColor: "divider", alignItems: "center" }}>
          <Box><Typography sx={{ fontWeight: 800 }}>{e.name}</Typography><Typography variant="body2" color="text.secondary">{e.employeeCode} • {e.department}</Typography>
            {e.experienceEndDate && <Typography variant="caption" color="warning.main">Experiência até {fmtDate(e.experienceEndDate)}</Typography>}
            {!e.email && <Typography variant="caption" color="error.main" sx={{ display: "block" }}>Sem e-mail: não consegue bater ponto</Typography>}</Box>
          <Typography>{e.position}</Typography>
          <Chip size="small" label={e.employmentModel} />
          <Box><Typography>{money(e.baseSalary)}</Typography><Chip size="small" label={label(e.status)} color={e.status === "ACTIVE" ? "success" : e.status === "EXPERIENCE" ? "warning" : "default"} /></Box>
          <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(e)}>Editar</Button>
        </Box>
      ))}
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editing ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
        <DialogContent sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)" }, gap: 2, pt: "12px!important" }}>
          {error && <Alert severity="error" sx={{ gridColumn: "1/-1" }}>{error}</Alert>}
          <TextField required label="Nome" value={form.name} onChange={set("name")} />
          <TextField select label="Categoria" value={form.category} onChange={set("category")}>{CATEGORIES.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
          <TextField required label="Cargo" value={form.position} onChange={set("position")} />
          <TextField label="Departamento" value={form.department} onChange={set("department")} />
          <TextField select label="Vínculo" value={form.employmentModel} onChange={set("employmentModel")}>{MODELS.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
          <TextField select label="Situação" value={form.status} onChange={set("status")}>{STATUS_OPTIONS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
          <TextField type="date" label="Admissão" value={form.admissionDate} onChange={set("admissionDate")} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" label="Fim da experiência" value={form.experienceEndDate} onChange={set("experienceEndDate")} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="Salário-base mensal" type="number" value={form.baseSalary} onChange={set("baseSalary")} />
          <TextField label="Carga mensal (h)" type="number" value={form.monthlyWorkload} onChange={set("monthlyWorkload")} />
          <TextField label="Supervisor" value={form.supervisor} onChange={set("supervisor")} />
          <TextField label="CPF" value={form.cpf} onChange={set("cpf")} />
          <TextField label="Telefone" value={form.phone} onChange={set("phone")} />
          <TextField label="E-mail de login do sistema" value={form.email} onChange={set("email")} helperText="Precisa ser o mesmo e-mail com que a pessoa entra no sistema." />
          <TextField label="Chave PIX" value={form.pixKey} onChange={set("pixKey")} />
          <TextField label="Observações" multiline minRows={2} value={form.notes} onChange={set("notes")} />
        </DialogContent>
        <DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button variant="contained" disabled={busy} onClick={() => void save()}>Salvar colaborador</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
