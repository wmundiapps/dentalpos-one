import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Chip, Paper, Typography } from "@mui/material";
import { getLaboratoryWorks, subscribeOperations } from "../../services/OperationsHubService";
import type { IntegratedLaboratoryWork } from "../../types/operationsHub";
import type { BackendPatient } from "../../services/PatientApi";

const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const day = (v?: string) => (v ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const DELIVERED = ["Entregue", "Liberado"];

// Aba 3 do caderno: trabalhos de laboratório do paciente (enviados, recebidos, cor do dente, DVO).
export default function PatientLabTab({ patient }: { patient: BackendPatient }) {
  const navigate = useNavigate();
  const [works, setWorks] = useState<IntegratedLaboratoryWork[]>([]);
  useEffect(() => {
    const read = () => setWorks(getLaboratoryWorks().filter((w) => norm(w.patientName) === norm(patient.fullName)).sort((a, b) => b.entryDateISO.localeCompare(a.entryDateISO)));
    read();
    return subscribeOperations(read);
  }, [patient.fullName]);

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Laboratório</Typography>
        <Button variant="outlined" onClick={() => navigate("/laboratorio")}>Abrir o laboratório</Button>
      </Box>
      {works.length === 0 ? <Typography color="text.secondary">Nenhum trabalho de laboratório para este paciente.</Typography> : works.map((w) => {
        const received = DELIVERED.includes(w.status);
        return (
          <Paper key={w.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>{w.workType}{w.teeth ? ` • dentes ${w.teeth}` : ""}</Typography>
                <Typography variant="body2" color="text.secondary">{w.trackingCode} • {w.dentistName} • técnico {w.responsibleTechnician}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "flex-start" }}>
                <Chip size="small" color={received ? "success" : "warning"} label={received ? "Recebido da clínica/entregue" : "Em produção"} />
                <Chip size="small" variant="outlined" label={w.status} />
              </Box>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" }, gap: 1, mt: 1.25 }}>
              <Typography variant="body2"><b>Enviado:</b> {day(w.entryDateISO)}</Typography>
              <Typography variant="body2"><b>Prazo:</b> {day(w.dueDateISO)}</Typography>
              <Typography variant="body2"><b>Retorno do paciente:</b> {day(w.patientReturnDateISO)}</Typography>
              <Typography variant="body2"><b>Material:</b> {w.material || "—"}</Typography>
              <Typography variant="body2"><b>Cor do dente:</b> {w.toothShade || "não informada"}{w.shadeSystem ? ` (${w.shadeSystem})` : ""}</Typography>
              <Typography variant="body2"><b>DVO:</b> {w.dvo || "não informada"}</Typography>
              <Typography variant="body2"><b>Moldagem:</b> {w.impressionType || "—"}</Typography>
              <Typography variant="body2"><b>Itens recebidos:</b> {(w.receivedItems || []).join(", ") || "—"}</Typography>
            </Box>
            {(w.shadeNotes || w.observations) && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{[w.shadeNotes, w.observations].filter(Boolean).join(" • ")}</Typography>}
          </Paper>
        );
      })}
    </Box>
  );
}
