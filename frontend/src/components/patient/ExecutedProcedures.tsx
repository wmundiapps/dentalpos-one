import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import EvolutionSignDialog, { type SignTarget } from "./EvolutionSignDialog";
import { EvolutionSignatureApi, type EvolutionSignature } from "../../services/EvolutionSignatureApi";
import { loadBackendPatient, type BackendPatient } from "../../services/PatientApi";
import { printProcedureReport } from "../../utils/procedureReport";
import { loadClinicalRecord } from "../../services/ClinicalAnamnesisApi";
import type { ClinicalEvolutionSummary } from "../../types/clinicalAnamnesis";

// Procedimentos executados no paciente (evolução clínica): registrados no odontograma ou no prontuário.
export default function ExecutedProcedures({ patientId }: { patientId: string }) {
  const [rows, setRows] = useState<ClinicalEvolutionSummary[] | null>(null);
  const [error, setError] = useState("");
  const [sigs, setSigs] = useState<EvolutionSignature[]>([]);
  const [patient, setPatient] = useState<BackendPatient | null>(null);
  const [target, setTarget] = useState<SignTarget | null>(null);
  const loadSigs = () => EvolutionSignatureApi.list(patientId).then(setSigs).catch(() => undefined);
  useEffect(() => { void loadSigs(); loadBackendPatient(patientId).then(setPatient).catch(() => undefined); }, [patientId]);
  useEffect(() => {
    let active = true;
    setRows(null); setError("");
    loadClinicalRecord(patientId).then((b) => { if (active) setRows([...b.evolutions].sort((a, c) => c.createdAt.localeCompare(a.createdAt))); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Não foi possível carregar os procedimentos."); });
    return () => { active = false; };
  }, [patientId]);
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <Box sx={{ display: "grid", placeItems: "center", minHeight: 160 }}><CircularProgress /></Box>;
  return (
    <Box sx={{ display: "grid", gap: 1.2 }}>
      <Typography sx={{ fontWeight: 900, fontSize: 18 }}>Procedimentos executados</Typography>
      <Typography variant="body2" color="text.secondary">Tudo o que foi feito no paciente, com data, profissional e observações. Para registrar um novo procedimento, abra o Odontograma na aba Prontuário clínico.</Typography>
      {rows.length > 0 && patient && <Box><Button size="small" variant="outlined" onClick={async () => { const ok = await printProcedureReport(patient, rows.map((e) => ({ id: e.id, date: e.createdAt, procedure: e.procedure, professional: e.professionalName, notes: e.notes, teeth: (e as unknown as { teeth?: string[] }).teeth })), sigs); if (!ok) setError("O navegador bloqueou a janela. Permita pop-ups para este site."); }}>Relatório de procedimentos (com assinaturas)</Button></Box>}
      {rows.length === 0 && <Alert severity="info">Nenhum procedimento executado registrado ainda.</Alert>}
      {rows.map((e) => (
        <Paper key={e.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderLeft: 6, borderLeftColor: "text.primary" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
            <Typography sx={{ fontWeight: 900 }}>{e.procedure}</Typography>
            <Typography variant="caption" color="text.secondary">{new Date(e.createdAt).toLocaleString("pt-BR")} · {e.professionalName}</Typography>
          </Box>
          <Typography variant="body2">{e.notes}</Typography>
          {e.nextProcedure && <Typography variant="caption" color="text.secondary">Próxima conduta: {e.nextProcedure}</Typography>}
          {(() => {
            const sg = sigs.find((x) => x.evolutionId === e.id);
            return (
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mt: 0.75 }}>
                {sg?.patientSignature ? <Chip size="small" color="success" label={`Paciente assinou em ${sg.patientSignedAt ? new Date(sg.patientSignedAt).toLocaleString("pt-BR") : ""}`} /> : <Chip size="small" color="warning" variant="outlined" label="Sem assinatura do paciente" />}
                {sg?.dentistSignature && <Chip size="small" color="success" variant="outlined" label="Visto do dentista" />}
                {(!sg?.patientSignature || !sg?.dentistSignature) && <Button size="small" onClick={() => setTarget({ evolutionId: e.id, procedure: e.procedure, detail: e.notes, date: new Date(e.createdAt).toLocaleDateString("pt-BR"), patientName: patient?.fullName || "", dentistName: e.professionalName, signedByPatient: Boolean(sg?.patientSignature), signedByDentist: Boolean(sg?.dentistSignature) })}>Coletar assinatura</Button>}
              </Box>
            );
          })()}
        </Paper>
      ))}
      <EvolutionSignDialog target={target} onClose={() => setTarget(null)} onDone={() => void loadSigs()} />
    </Box>
  );
}
