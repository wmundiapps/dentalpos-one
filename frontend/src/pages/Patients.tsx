import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Paper,
  TextField,
  Typography,
  Chip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import PersonSearchIcon from "@mui/icons-material/PersonSearch";
import SearchIcon from "@mui/icons-material/Search";
import MedicalInformationIcon from "@mui/icons-material/MedicalInformation";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { listPatients, savePatient, listTreatmentItems } from "../services/PatientClinicalService";
import { listFinanceEntries } from "../services/FinanceHubService";
import { getAppointments } from "../services/OperationsHubService";
import type { PatientProfile, PatientStatus } from "../types/patientClinical";

type PatientGender = NonNullable<PatientProfile["gender"]>;

type PatientForm = {
  fullName: string;
  phone: string;
  email: string;
  cpf: string;
  birthDate: string;
  gender: PatientGender;
  treatment: string;
  status: PatientStatus;
  mainComplaint: string;
  allergies: string;
  medications: string;
  medicalHistory: string;
  notes: string;
};

const emptyForm: PatientForm = {
  fullName: "",
  phone: "",
  email: "",
  cpf: "",
  birthDate: "",
  gender: "Não informado",
  treatment: "",
  status: "Ativo",
  mainComplaint: "",
  allergies: "",
  medications: "",
  medicalHistory: "",
  notes: "",
};

const genderOptions: PatientGender[] = ["Masculino", "Feminino", "Outro", "Não informado"];
const statusOptions: PatientStatus[] = ["Ativo", "Em acompanhamento", "Inativo"];

export default function Patients() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<"Todos"|"Ativos"|"Em tratamento"|"Inadimplentes"|"Novos no mês"|"Finalizados">("Todos");
  const [patients, setPatients] = useState<PatientProfile[]>(() => listPatients());
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string>();
  const [form, setForm] = useState<PatientForm>({ ...emptyForm });

  const financeRows = listFinanceEntries();
  const appointments = getAppointments();
  const currentMonth = new Date().toISOString().slice(0,7);
  const isOverdue = (name:string) => financeRows.some(x=>x.type==="Receita" && x.status==="Vencido" && x.personName.toLowerCase()===name.toLowerCase());
  const hasTreatment = (id:string) => listTreatmentItems(id).some(x=>x.status!=="Concluído");
  const isFinished = (id:string) => { const rows=listTreatmentItems(id); return rows.length>0 && rows.every(x=>x.status==="Concluído"); };
  const metrics = {
    total: patients.length,
    active: patients.filter(p=>p.status!=="Inativo").length,
    treating: patients.filter(p=>hasTreatment(p.id)).length,
    overdue: patients.filter(p=>isOverdue(p.fullName)).length,
    newMonth: patients.filter(p=>p.createdAt.slice(0,7)===currentMonth).length,
    finished: patients.filter(p=>isFinished(p.id)).length,
    attendedMonth: new Set(appointments.filter(a=>a.dateISO.slice(0,7)===currentMonth && !["Cancelado","Faltou"].includes(a.status)).map(a=>a.patientName.toLowerCase())).size,
  };
  const filtered = useMemo(() => patients.filter((patient) => {
    const text=`${patient.fullName} ${patient.phone} ${patient.cpf || ""}`.toLowerCase();
    if(!text.includes(search.toLowerCase().trim())) return false;
    if(quickFilter==="Ativos") return patient.status!=="Inativo";
    if(quickFilter==="Em tratamento") return hasTreatment(patient.id);
    if(quickFilter==="Inadimplentes") return isOverdue(patient.fullName);
    if(quickFilter==="Novos no mês") return patient.createdAt.slice(0,7)===currentMonth;
    if(quickFilter==="Finalizados") return isFinished(patient.id);
    return true;
  }), [patients, search, quickFilter]);

  const openNew = () => {
    setEditId(undefined);
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const openEdit = (patient: PatientProfile) => {
    setEditId(patient.id);
    setForm({
      fullName: patient.fullName,
      phone: patient.phone,
      email: patient.email || "",
      cpf: patient.cpf || "",
      birthDate: patient.birthDate || "",
      gender: patient.gender || "Não informado",
      treatment: patient.treatment || "",
      status: patient.status,
      mainComplaint: patient.mainComplaint || "",
      allergies: patient.allergies || "",
      medications: patient.medications || "",
      medicalHistory: patient.medicalHistory || "",
      notes: patient.notes || "",
    });
    setOpen(true);
  };

  const save = () => {
    if (!form.fullName.trim() || !form.phone.trim()) return;
    savePatient({ ...form, id: editId });
    setPatients(listPatients());
    setOpen(false);
  };

  return (
    <Box>
      <PageHeader
        title="Pacientes"
        description="Cadastro clínico central. Um paciente, uma única fonte de dados para prontuário, odontograma, agenda, orçamento e financeiro."
        actionLabel="Novo paciente"
        actionIcon={<AddIcon />}
        onAction={openNew}
      />

      <Box sx={{display:"grid",gridTemplateColumns:{xs:"repeat(2,1fr)",md:"repeat(6,1fr)"},gap:1.5,mb:2}}>
        {[
          ["Todos",metrics.total,"Todos"],["Ativos",metrics.active,"Ativos"],["Em tratamento",metrics.treating,"Em tratamento"],["Inadimplentes",metrics.overdue,"Inadimplentes"],["Novos no mês",metrics.newMonth,"Novos no mês"],["Finalizados",metrics.finished,"Finalizados"]
        ].map(([label,value,filter])=><Paper key={String(label)} onClick={()=>setQuickFilter(filter as typeof quickFilter)} variant="outlined" sx={{p:1.5,borderRadius:2,cursor:"pointer",borderColor:quickFilter===filter?"primary.main":"divider"}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" sx={{fontWeight:900}}>{value}</Typography></Paper>)}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{mb:2}}>Pacientes que compareceram neste mês: <b>{metrics.attendedMonth}</b></Typography>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <TextField
          fullWidth
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pesquisar por nome, telefone ou CPF..."
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
        />
      </Paper>

      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          Pacientes cadastrados
        </Typography>
        <Typography color="text.secondary">{filtered.length} resultado(s)</Typography>
      </Box>

      {filtered.length ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)", xl: "repeat(3,1fr)" },
            gap: 2,
          }}
        >
          {filtered.map((patient) => (
            <Paper key={patient.id} variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 900 }}>
                    {patient.fullName}
                  </Typography>
                  <Typography color="text.secondary">
                    {patient.phone}
                    {patient.cpf ? ` • CPF ${patient.cpf}` : ""}
                  </Typography>
                </Box>
                <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(patient)}>
                  Editar
                </Button>
              </Box>

              <Typography sx={{ mt: 1 }}>
                <b>Tratamento:</b> {patient.treatment || "Não definido"}
              </Typography>
              <Typography><b>Status:</b> {patient.status}</Typography>
              <Box sx={{display:"flex",gap:1,mt:1,flexWrap:"wrap"}}><Chip size="small" color={isOverdue(patient.fullName)?"error":"success"} label={isOverdue(patient.fullName)?"Inadimplente":"Financeiro OK"}/>{hasTreatment(patient.id)&&<Chip size="small" color="info" label="Em tratamento"/>}{isFinished(patient.id)&&<Chip size="small" color="success" label="Finalizado"/>}</Box>

              <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  startIcon={<MedicalInformationIcon />}
                  onClick={() => navigate(`/prontuario?patientId=${encodeURIComponent(patient.id)}`)}
                >
                  Abrir prontuário
                </Button>
                <Button onClick={() => navigate(`/agenda?patient=${encodeURIComponent(patient.fullName)}`)}>
                  Agenda
                </Button>
                <Button
                  onClick={() =>
                    navigate(
                      `/orcamentos-tratamentos?patient=${encodeURIComponent(patient.fullName)}&patientId=${encodeURIComponent(patient.id)}`,
                    )
                  }
                >
                  Orçamento
                </Button>
                <Button onClick={() => navigate(`/financeiro?paciente=${encodeURIComponent(patient.fullName)}`)}>
                  Financeiro
                </Button>
                <Button onClick={() => navigate(`/jornada-paciente?patientId=${encodeURIComponent(patient.id)}`)}>
                  Jornada
                </Button>
              </Box>
            </Paper>
          ))}
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ p: 5, textAlign: "center" }}>
          <PersonSearchIcon sx={{ fontSize: 48, color: "text.secondary" }} />
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Nenhum paciente encontrado
          </Typography>
        </Paper>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editId ? "Editar paciente" : "Novo paciente"}</DialogTitle>
        <DialogContent
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 2,
            pt: "12px!important",
          }}
        >
          <TextField
            required
            label="Nome completo"
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          />
          <TextField
            required
            label="Telefone"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
          <TextField
            label="E-mail"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <TextField
            label="CPF"
            value={form.cpf}
            onChange={(event) => setForm({ ...form, cpf: event.target.value })}
          />
          <TextField
            type="date"
            label="Data de nascimento"
            value={form.birthDate}
            onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            select
            label="Sexo"
            value={form.gender}
            onChange={(event) => setForm({ ...form, gender: event.target.value as PatientGender })}
          >
            {genderOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Tratamento principal"
            value={form.treatment}
            onChange={(event) => setForm({ ...form, treatment: event.target.value })}
          />
          <TextField
            select
            label="Status"
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as PatientStatus })}
          >
            {statusOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            multiline
            minRows={2}
            label="Queixa principal"
            value={form.mainComplaint}
            onChange={(event) => setForm({ ...form, mainComplaint: event.target.value })}
            sx={{ gridColumn: { md: "1/-1" } }}
          />
          <TextField
            multiline
            minRows={2}
            label="Alergias"
            value={form.allergies}
            onChange={(event) => setForm({ ...form, allergies: event.target.value })}
          />
          <TextField
            multiline
            minRows={2}
            label="Medicamentos"
            value={form.medications}
            onChange={(event) => setForm({ ...form, medications: event.target.value })}
          />
          <TextField
            multiline
            minRows={2}
            label="Histórico médico"
            value={form.medicalHistory}
            onChange={(event) => setForm({ ...form, medicalHistory: event.target.value })}
            sx={{ gridColumn: { md: "1/-1" } }}
          />
          <TextField
            multiline
            minRows={2}
            label="Observações"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            sx={{ gridColumn: { md: "1/-1" } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!form.fullName.trim() || !form.phone.trim()}
            onClick={save}
          >
            Salvar paciente
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
