import { useRef, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import SignaturePad, { type SignaturePadHandle } from "../SignaturePad";
import { EvolutionSignatureApi } from "../../services/EvolutionSignatureApi";

export interface SignTarget { evolutionId: string; procedure: string; detail?: string; date?: string; patientName: string; dentistName: string; signedByPatient?: boolean; signedByDentist?: boolean }

// Confirmação do procedimento realizado: paciente (e dentista) assinam na tela. Fica como comprovante, inclusive para cobrança.
export default function EvolutionSignDialog({ target, onClose, onDone }: { target: SignTarget | null; onClose: () => void; onDone: () => void }) {
  const patientPad = useRef<SignaturePadHandle>(null);
  const dentistPad = useRef<SignaturePadHandle>(null);
  const [patientName, setPatientName] = useState("");
  const [dentistName, setDentistName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prev, setPrev] = useState<string | null>(null);
  if (target && prev !== target.evolutionId) { setPrev(target.evolutionId); setPatientName(target.patientName); setDentistName(target.dentistName); setError(""); }

  const save = async () => {
    if (!target) return;
    setError(""); setBusy(true);
    try {
      let any = false;
      if (!target.signedByPatient && patientPad.current && !patientPad.current.isEmpty()) { await EvolutionSignatureApi.sign(target.evolutionId, "PATIENT", patientName, patientPad.current.toDataUrl()); any = true; }
      if (!target.signedByDentist && dentistPad.current && !dentistPad.current.isEmpty()) { await EvolutionSignatureApi.sign(target.evolutionId, "DENTIST", dentistName, dentistPad.current.toDataUrl()); any = true; }
      if (!any) { setError("Colha pelo menos a assinatura do paciente."); setBusy(false); return; }
      onDone(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar a assinatura."); } finally { setBusy(false); }
  };

  return (
    <Dialog open={Boolean(target)} onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 900 }}>Confirmação do procedimento realizado</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
        {target && (<>
          <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 2 }}>
            <Typography sx={{ fontWeight: 800 }}>{target.procedure}</Typography>
            {target.detail && <Typography variant="body2">{target.detail}</Typography>}
            <Typography variant="caption" color="text.secondary">{target.date || new Date().toLocaleDateString("pt-BR")} · {target.dentistName}</Typography>
          </Box>
          <Typography variant="body2">Declaro que o procedimento acima foi realizado em mim, nesta data, pelo profissional indicado.</Typography>
          {target.signedByPatient ? <Alert severity="success">O paciente já assinou este procedimento.</Alert> : (<>
            <TextField size="small" label="Nome do paciente (ou responsável)" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
            <SignaturePad ref={patientPad} label="Assinatura do paciente" />
          </>)}
          {target.signedByDentist ? <Alert severity="success">O dentista já assinou.</Alert> : (<>
            <TextField size="small" label="Nome do dentista" value={dentistName} onChange={(e) => setDentistName(e.target.value)} />
            <SignaturePad ref={dentistPad} label="Visto do dentista (opcional)" height={120} />
          </>)}
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="caption" color="text.secondary">A assinatura fica gravada com data, hora, IP do aparelho e um código de integridade do registro. Depois de salva, não pode ser alterada.</Typography>
        </>)}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>Assinar depois</Button>
        <Button variant="contained" disabled={busy} onClick={() => void save()}>{busy ? "Salvando..." : "Confirmar assinatura"}</Button>
      </DialogActions>
    </Dialog>
  );
}
