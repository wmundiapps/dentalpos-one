import { useEffect, useState } from "react";
import { Alert, Box, CircularProgress, Paper, Typography } from "@mui/material";
import { loadClinicalRecord } from "../../services/ClinicalAnamnesisApi";
import type { ClinicalEvolutionSummary } from "../../types/clinicalAnamnesis";

// Procedimentos executados no paciente (evolução clínica): registrados no odontograma ou no prontuário.
export default function ExecutedProcedures({ patientId }: { patientId: string }) {
  const [rows, setRows] = useState<ClinicalEvolutionSummary[] | null>(null);
  const [error, setError] = useState("");
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
      {rows.length === 0 && <Alert severity="info">Nenhum procedimento executado registrado ainda.</Alert>}
      {rows.map((e) => (
        <Paper key={e.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderLeft: 6, borderLeftColor: "text.primary" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
            <Typography sx={{ fontWeight: 900 }}>{e.procedure}</Typography>
            <Typography variant="caption" color="text.secondary">{new Date(e.createdAt).toLocaleString("pt-BR")} · {e.professionalName}</Typography>
          </Box>
          <Typography variant="body2">{e.notes}</Typography>
          {e.nextProcedure && <Typography variant="caption" color="text.secondary">Próxima conduta: {e.nextProcedure}</Typography>}
        </Paper>
      ))}
    </Box>
  );
}
