import { useEffect, useState } from "react";
import { setEmployeePortalPassword } from "../../services/HrFaceApi";
import EmployeeFaceDialog from "./EmployeeFaceDialog";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { HrApi, type Workplace, fmtDate, money, type Employee } from "../../services/HrApi";

const CATEGORIES = ["Cirurgião-dentista", "ASB", "TSB", "Técnico em Prótese Dentária", "Auxiliar de Laboratório", "Recepção", "Administrativo", "Financeiro", "Comercial", "Marketing", "Zeladoria", "Manutenção", "Professor", "Tutor", "Representante", "Estagiário", "Outro"];
const MODELS = ["CLT", "PJ", "Autônomo", "Estágio", "Diária", "Percentual", "Locação de espaço", "Terceirizado"];
export const STATUS_OPTIONS: Array<[string, string]> = [["ACTIVE", "Ativo"], ["EXPERIENCE", "Experiência"], ["VACATION", "Férias"], ["LEAVE", "Afastado"], ["NOTICE", "Aviso-prévio"], ["TERMINATED", "Desligado"]];
const today = () => new Date().toISOString().slice(0, 10);
const blank = { name: "", category: "Outro", position: "", department: "", employmentModel: "CLT", status: "ACTIVE", admissionDate: today(), experienceEndDate: "", baseSalary: "", monthlyWorkload: "220", supervisor: "", phone: "", email: "", cpf: "", pixKey: "", notes: "", workStart: "", lunchStart: "", lunchEnd: "", workEnd: "", workplaceId: "" };

export default function EmployeesTab({ employees, onChanged }: { employees: Employee[]; onChanged: () => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwdFor, setPwdFor] = useState<{ id: string; name: string } | null>(null);
  const [pwd, setPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const savePwd = async () => { if (!pwdFor) return; try { await setEmployeePortalPassword(pwdFor.id, pwd); setPwdMsg("Senha salva. Passe ao colaborador o endereço app.completodonto.com.br/colaborador."); setPwd(""); } catch (e) { setPwdMsg(e instanceof Error ? e.message : "Não foi possível salvar."); } };
  const [places, setPlaces] = useState<Workplace[]>([]);
  useEffect(() => { HrApi.workplaces().then(setPlaces).catch(() => undefined); }, []);
  const [faceFor, setFaceFor] = useState<{ id: string; name: string } | null>(null);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const openNew = () => { setEditing(null); setForm(blank); setError(""); setOpen(true); };
  const openEdit = (e: Employee) => {
    setEditing(e); setError("");
    setForm({ name: e.name, category: e.category, position: e.position, department: e.department, employmentModel: e.employmentModel, status: e.status, admissionDate: e.admissionDate.slice(0, 10), experienceEndDate: (e.experienceEndDate || "").slice(0, 10), baseSalary: String(e.baseSalary ?? ""), monthlyWorkload: String(e.monthlyWorkload), supervisor: e.supervisor || "", phone: e.phone || "", email: e.email || "", cpf: e.cpf || "", pixKey: e.pixKey || "", notes: e.notes || "", workStart: e.workStart || "", lunchStart: e.lunchStart || "", lunchEnd: e.lunchEnd || "", workEnd: e.workEnd || "", workplaceId: e.workplaceId || "" });
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
      <Alert severity="info" sx={{ mx: 2, mb: 1 }}>Para bater o ponto pelo rosto o colaborador só precisa do <b>CPF</b> e do <b>rosto cadastrado</b> (sem login próprio). Cadastre o <b>e-mail</b> dele para receber o comprovante de cada batida.</Alert>
      {list.length === 0 && <Typography color="text.secondary" sx={{ p: 2 }}>Nenhum colaborador cadastrado.</Typography>}
      {list.map((e) => (
        <Box key={e.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1.3fr 1fr 1fr auto" }, gap: 2, p: 2, borderTop: "1px solid", borderColor: "divider", alignItems: "center" }}>
          <Box><Typography sx={{ fontWeight: 800 }}>{e.name}</Typography><Typography variant="body2" color="text.secondary">{e.employeeCode} • {e.department}</Typography>
            {e.experienceEndDate && <Typography variant="caption" color="warning.main">Experiência até {fmtDate(e.experienceEndDate)}</Typography>}
            {!e.email && <Typography variant="caption" color="error.main" sx={{ display: "block" }}>Sem e-mail: não recebe o comprovante</Typography>}</Box>
          <Typography>{e.position}</Typography>
          <Chip size="small" label={e.employmentModel} />
          <Box><Typography>{money(e.baseSalary)}</Typography><Chip size="small" label={label(e.status)} color={e.status === "ACTIVE" ? "success" : e.status === "EXPERIENCE" ? "warning" : "default"} /></Box>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}><Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(e)}>Editar</Button><Button size="small" onClick={() => setFaceFor({ id: e.id, name: e.name })}>Rosto do ponto</Button><Button size="small" onClick={() => { setPwdMsg(""); setPwd(""); setPwdFor({ id: e.id, name: e.name }); }}>Senha</Button></Box>
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
          <TextField select label="Polo / unidade onde bate o ponto" value={form.workplaceId} onChange={set("workplaceId")} sx={{ gridColumn: "1 / -1" }} helperText="Em branco: bate o ponto no celular da clínica. Com polo: só bate pelo link do polo, dentro do raio do polo.">
            <MenuItem value="">Clínica (celular da clínica)</MenuItem>
            {places.filter((p) => p.isActive).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <Box sx={{ gridColumn: "1 / -1" }}>
            <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Horário de trabalho do colaborador</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
              <TextField type="time" label="Entrada" value={form.workStart} onChange={set("workStart")} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="time" label="Saída para o almoço" value={form.lunchStart} onChange={set("lunchStart")} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="time" label="Volta do almoço" value={form.lunchEnd} onChange={set("lunchEnd")} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="time" label="Saída (ir embora)" value={form.workEnd} onChange={set("workEnd")} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
            <Typography variant="caption" color="text.secondary">Usado no ponto: atraso, horas esperadas por dia (segunda a sexta) e aviso de quem não bateu a entrada. Em branco, vale o horário geral da clínica.</Typography>
          </Box>
          <TextField label="Carga mensal (h)" type="number" value={form.monthlyWorkload} onChange={set("monthlyWorkload")} />
          <TextField label="Supervisor" value={form.supervisor} onChange={set("supervisor")} />
          <TextField label="CPF" value={form.cpf} onChange={set("cpf")} />
          <TextField label="Telefone" value={form.phone} onChange={set("phone")} />
          <TextField label="E-mail do colaborador" value={form.email} onChange={set("email")} helperText="Recebe o comprovante de cada batida. Só precisa ser o e-mail de login se a pessoa também usar a tela Meu ponto." />
          <TextField label="Chave PIX" value={form.pixKey} onChange={set("pixKey")} />
          <TextField label="Observações" multiline minRows={2} value={form.notes} onChange={set("notes")} />
        </DialogContent>
        {!editing && <Alert severity="info" sx={{ mx: 3, mb: 1 }}>O RH não precisa tirar a foto: no <b>primeiro acesso</b> ao ponto, o colaborador digita o CPF e o próprio sistema tira a foto para reconhecê-lo nas próximas vezes. Basta preencher o <b>CPF</b> aqui.</Alert>}
        <DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button variant="contained" disabled={busy} onClick={() => void save()}>Salvar colaborador</Button></DialogActions>
      </Dialog>
      <Dialog open={Boolean(pwdFor)} onClose={() => { setPwdFor(null); setPwd(""); setPwdMsg(""); }} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 900 }}>Senha de {pwdFor?.name}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <Typography variant="body2" color="text.secondary">Com o CPF e esta senha o colaborador consulta só o próprio ponto, em /colaborador. Ele não vê cargo, salário ou dados de outras pessoas. Salvar de novo troca a senha.</Typography>
          <TextField label="Nova senha (mínimo 6 caracteres)" type="text" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          {pwdMsg && <Alert severity={pwdMsg.startsWith("Senha salva") ? "success" : "error"}>{pwdMsg}</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={() => { setPwdFor(null); setPwd(""); setPwdMsg(""); }}>Fechar</Button><Button variant="contained" disabled={pwd.length < 6} onClick={() => void savePwd()}>Salvar senha</Button></DialogActions>
      </Dialog>
      <EmployeeFaceDialog employee={faceFor} onClose={() => setFaceFor(null)} />
    </Box>
  );
}
