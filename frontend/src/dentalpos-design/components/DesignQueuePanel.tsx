import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/Delete";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import BiotechIcon from "@mui/icons-material/Biotech";
import {
  createLaboratoryWorkFromDesign,
  getLaboratoryWorks,
  mapDesignStatusToLaboratory,
  updateLaboratoryWork,
} from "../../services/OperationsHubService";

type Status =
  | "Recebido"
  | "Aguardando arquivos"
  | "Em análise"
  | "Design"
  | "Validação"
  | "Pronto para fabricação"
  | "Concluído";

type Job = {
  id: number;
  patient: string;
  work: string;
  due: string;
  dueISO?: string;
  status: Status;
  priority: "Normal" | "Alta" | "Urgente";
  note: string;
};

const KEY = "dentalpos.design.queue.v2";
const seed: Job[] = [
  {
    id: 1,
    patient: "Caso demonstração",
    work: "Coroa unitária",
    due: new Date().toLocaleDateString("pt-BR"),
    dueISO: new Date().toISOString().slice(0, 10),
    status: "Em análise",
    priority: "Alta",
    note: "Validar malha antes do design",
  },
];

const load = (): Job[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null") || seed;
  } catch {
    return seed;
  }
};

const statuses: Status[] = [
  "Recebido",
  "Aguardando arquivos",
  "Em análise",
  "Design",
  "Validação",
  "Pronto para fabricação",
  "Concluído",
];

const isLate = (job: Job) =>
  job.status !== "Concluído" &&
  !!job.dueISO &&
  new Date(`${job.dueISO}T23:59:59`) < new Date();

export default function DesignQueuePanel() {
  const [jobs, setJobs] = useState<Job[]>(load);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"Todos" | Job["priority"]>("Todos");
  const [form, setForm] = useState({
    patient: "",
    work: "",
    due: "",
    priority: "Normal" as Job["priority"],
    note: "",
  });

  const save = (next: Job[]) => {
    setJobs(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  useEffect(() => {
    const labWorks = getLaboratoryWorks();
    jobs.forEach((job) => {
      const existing = labWorks.find((work) => work.designJobId === job.id);
      if (!existing) {
        createLaboratoryWorkFromDesign({
          designJobId: job.id,
          patientName: job.patient,
          workType: job.work,
          dueDateISO: job.dueISO,
          priority: job.priority,
          observations: job.note,
        });
      }
    });
  }, []);

  const alerts = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.status !== "Concluído" &&
          (job.priority === "Urgente" ||
            job.status === "Aguardando arquivos" ||
            isLate(job)),
      ),
    [jobs],
  );

  const visible = filter === "Todos" ? jobs : jobs.filter((job) => job.priority === filter);

  const add = () => {
    if (!form.patient.trim() || !form.work.trim()) return;
    const job: Job = {
      id: Date.now(),
      patient: form.patient.trim(),
      work: form.work.trim(),
      due: form.due
        ? new Date(`${form.due}T12:00:00`).toLocaleDateString("pt-BR")
        : "Sem prazo",
      dueISO: form.due || undefined,
      status: "Recebido",
      priority: form.priority,
      note: form.note.trim(),
    };

    save([job, ...jobs]);
    createLaboratoryWorkFromDesign({
      designJobId: job.id,
      patientName: job.patient,
      workType: job.work,
      dueDateISO: job.dueISO,
      priority: job.priority,
      observations: job.note,
    });

    setOpen(false);
    setForm({ patient: "", work: "", due: "", priority: "Normal", note: "" });
  };

  const changeStatus = (job: Job, status: Status) => {
    save(jobs.map((item) => (item.id === job.id ? { ...item, status } : item)));
    const lab = getLaboratoryWorks().find((work) => work.designJobId === job.id);
    if (lab) {
      updateLaboratoryWork(lab.id, {
        status: mapDesignStatusToLaboratory(status),
        nextAction:
          status === "Concluído"
            ? "Liberar para entrega ao paciente"
            : `Acompanhar etapa do Design: ${status}`,
      });
    }
  };

  const remove = (id: number) => {
    if (window.confirm("Remover este caso da fila do Design? O trabalho laboratorial será preservado para rastreabilidade.")) {
      save(jobs.filter((job) => job.id !== id));
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 1.5,
        p: 1.5,
        bgcolor: "#0b1725",
        color: "white",
        border: "1px solid #243447",
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "center", mb: 1 }}>
        <Box>
          <Typography sx={{ fontWeight: 800 }}>Fila de trabalhos</Typography>
          <Typography variant="caption" sx={{ color: "#94a3b8" }}>
            {jobs.filter((job) => job.status !== "Concluído").length} em andamento • {alerts.length} avisos • {jobs.filter(isLate).length} atrasados
          </Typography>
        </Box>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          Novo caso
        </Button>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 1,
          px: 1,
          py: 0.7,
          borderRadius: 1.5,
          bgcolor: "rgba(59,130,246,.08)",
          border: "1px solid rgba(59,130,246,.28)",
        }}
      >
        <BiotechIcon fontSize="small" color="primary" />
        <Typography variant="caption" sx={{ color: "#bfdbfe" }}>
          Integração ativa: todo novo caso entra automaticamente na fila do Laboratório e na Central de Alertas.
        </Typography>
      </Box>

      {alerts.length > 0 && (
        <Box sx={{ mb: 1, p: 1, bgcolor: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.3)", borderRadius: 1.5 }}>
          <Typography variant="caption" sx={{ display: "block", mb: 0.7, color: "#fbbf24", fontWeight: 800 }}>
            AVISOS QUE EXIGEM ATENÇÃO
          </Typography>
          <Box sx={{ display: "flex", gap: 0.7, flexWrap: "wrap" }}>
            {alerts.map((job) => (
              <Chip
                key={job.id}
                size="small"
                icon={<WarningAmberIcon />}
                color={isLate(job) ? "error" : "warning"}
                label={`${job.patient}: ${isLate(job) ? "prazo vencido" : job.status === "Aguardando arquivos" ? "faltam arquivos" : "urgente"}`}
              />
            ))}
          </Box>
        </Box>
      )}

      <Box sx={{ display: "flex", gap: 0.6, mb: 1 }}>
        {(["Todos", "Normal", "Alta", "Urgente"] as const).map((value) => (
          <Chip key={value} size="small" label={value} color={filter === value ? "primary" : "default"} onClick={() => setFilter(value)} />
        ))}
      </Box>

      <Box sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 0.5 }}>
        {visible.map((job) => (
          <Paper key={job.id} sx={{ minWidth: 270, p: 1.25, bgcolor: "#101f30", color: "white", border: `1px solid ${isLate(job) ? "#ef4444" : "#243447"}` }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 13 }}>{job.patient}</Typography>
              <Tooltip title="Remover">
                <IconButton size="small" sx={{ color: "#94a3b8", mt: -0.7, mr: -0.7 }} onClick={() => remove(job.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Typography variant="caption" sx={{ color: "#94a3b8", display: "block" }}>
              {job.work} • prazo {job.due}
            </Typography>
            {job.note && <Typography variant="caption" sx={{ color: "#cbd5e1", display: "block", mt: 0.6 }}>{job.note}</Typography>}
            <Box sx={{ display: "flex", gap: 0.5, mt: 1, alignItems: "center" }}>
              <Chip size="small" label={job.priority} color={job.priority === "Urgente" ? "error" : job.priority === "Alta" ? "warning" : "default"} />
              <TextField
                select
                size="small"
                value={job.status}
                onChange={(event) => changeStatus(job, event.target.value as Status)}
                sx={{ minWidth: 155, "& .MuiInputBase-root": { color: "white", fontSize: 11 } }}
              >
                {statuses.map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
              </TextField>
            </Box>
          </Paper>
        ))}
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo caso de Design</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField required label="Paciente / identificação" value={form.patient} onChange={(event) => setForm({ ...form, patient: event.target.value })} />
          <TextField required label="Trabalho" value={form.work} onChange={(event) => setForm({ ...form, work: event.target.value })} />
          <TextField label="Prazo" type="date" slotProps={{ inputLabel: { shrink: true } }} value={form.due} onChange={(event) => setForm({ ...form, due: event.target.value })} />
          <TextField select label="Prioridade" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Job["priority"] })}>
            {["Normal", "Alta", "Urgente"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
          </TextField>
          <TextField label="Aviso / observação" multiline rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={add}>Adicionar à fila</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
