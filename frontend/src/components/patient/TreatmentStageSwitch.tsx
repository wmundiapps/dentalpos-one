import { useState } from "react";
import { Alert, Box, Button, Chip, Paper, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import VerifiedIcon from "@mui/icons-material/Verified";
import { updateBackendPatient, type BackendPatient } from "../../services/PatientApi";

type Stage = "BUDGET" | "TREATMENT";

interface Props {
  patient: BackendPatient;
  onSaved: (patient: BackendPatient) => void;
  /** Leva para o orçamento (aba Orçamento e procedimentos). */
  onOpenBudget: () => void;
}

// Chave da ficha: só orçamento ou tratamento confirmado.
// Passa sozinha para "Tratamento confirmado" quando o orçamento é aprovado, o contrato é gerado ou o primeiro procedimento é executado.
export default function TreatmentStageSwitch({ patient, onSaved, onOpenBudget }: Props) {
  const stage = (patient.treatmentStage || null) as Stage | null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const change = async (_: unknown, next: Stage | null) => {
    if (!next || next === stage) return;
    setBusy(true); setError("");
    try {
      onSaved(await updateBackendPatient(patient.id, { treatmentStage: next } as never));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível mudar a fase do paciente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 3, borderColor: stage === "TREATMENT" ? "success.main" : stage === "BUDGET" ? "warning.main" : "divider", borderWidth: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 900 }}>Fase do paciente</Typography>
          <ToggleButtonGroup exclusive size="small" value={stage} onChange={change} disabled={busy} aria-label="Fase do paciente">
            <ToggleButton value="BUDGET" color="warning" sx={{ fontWeight: 800, px: 2 }}><RequestQuoteIcon fontSize="small" sx={{ mr: 0.7 }} />Só orçamento</ToggleButton>
            <ToggleButton value="TREATMENT" color="success" sx={{ fontWeight: 800, px: 2 }}><VerifiedIcon fontSize="small" sx={{ mr: 0.7 }} />Tratamento confirmado</ToggleButton>
          </ToggleButtonGroup>
          {!stage && <Chip size="small" label="Fase ainda não definida" />}
        </Box>
        {stage !== "TREATMENT" && <Button variant="contained" color="warning" startIcon={<RequestQuoteIcon />} onClick={onOpenBudget}>Montar e passar o orçamento</Button>}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8 }}>
        {stage === "TREATMENT"
          ? "Tratamento confirmado: o orçamento foi aprovado, o contrato foi gerado ou o primeiro procedimento já foi executado."
          : "Só orçamento: apresente as opções ao paciente. Ao aprovar o orçamento, gerar o contrato ou executar o primeiro procedimento, a fase muda sozinha. Você também pode mudar aqui."}
      </Typography>
      {error && <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError("")}>{error}</Alert>}
    </Paper>
  );
}
