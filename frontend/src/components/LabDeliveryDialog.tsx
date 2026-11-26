import { useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, TextField, Typography } from "@mui/material";
import { deliverLabOrder, issueDeliveryCode, type DeliveryCodeResult } from "../services/LabOrderApi";

interface Props {
  work: { id: number; patientName: string; workType: string } | null;
  onClose: () => void;
  onDelivered: (id: number) => void;
}

// Baixa de entrega do laboratório: o trabalho só sai da fila com o código de entrega
// (gerado por quem recebeu: dentista, recepção, gestor ou admin; contém nome, data e hora).
export default function LabDeliveryDialog({ work, onClose, onDelivered }: Props) {
  const [code, setCode] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [issued, setIssued] = useState<DeliveryCodeResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => { setCode(""); setReceivedBy(""); setIssued(null); setError(""); onClose(); };

  const confirm = async () => {
    if (!work) return;
    setBusy(true); setError("");
    try { await deliverLabOrder(String(work.id), code); onDelivered(work.id); close(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível dar baixa."); }
    finally { setBusy(false); }
  };

  const issue = async () => {
    if (!work) return;
    setBusy(true); setError("");
    try { setIssued(await issueDeliveryCode(String(work.id), receivedBy)); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível gerar o código."); }
    finally { setBusy(false); }
  };

  const copy = () => { if (issued) void navigator.clipboard?.writeText(issued.message).catch(() => undefined); };
  const subject = work ? `Código de entrega - ${work.workType} - ${work.patientName}` : "";

  return (
    <Dialog open={Boolean(work)} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 900 }}>{`Entrega: ${work?.patientName || ""} — ${work?.workType || ""}`}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontWeight: 800, mb: 0.5 }}>1. Dar baixa com o código de entrega</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>O trabalho só sai da fila com o código gerado por quem recebeu o serviço (dentista, recepção ou administração). O código traz o nome de quem recebeu, a data e a hora.</Typography>
        <TextField fullWidth multiline minRows={2} label="Código de entrega" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button sx={{ mt: 1 }} variant="contained" disabled={busy || code.trim().length < 20} onClick={() => void confirm()}>Dar baixa na entrega</Button>

        <Divider sx={{ my: 2.5 }} />
        <Typography sx={{ fontWeight: 800, mb: 0.5 }}>2. Gerar o código (quem recebeu o serviço)</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Só dentista, recepção, gestor ou administrador geram. Informe quem recebeu (o nome vai dentro do código) e envie ao laboratório.</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TextField size="small" label="Nome de quem recebeu (opcional: usa o seu)" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} sx={{ flex: 1, minWidth: 220 }} />
          <Button variant="outlined" disabled={busy} onClick={() => void issue()}>Gerar código</Button>
        </Box>
        {issued && (
          <Box sx={{ mt: 1.5 }}>
            <TextField fullWidth multiline minRows={4} value={issued.message} slotProps={{ input: { readOnly: true } }} />
            <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
              <Button size="small" variant="outlined" onClick={copy}>Copiar</Button>
              <Button size="small" variant="outlined" component="a" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(issued.message)}`}>Enviar por WhatsApp</Button>
              <Button size="small" variant="outlined" component="a" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(issued.message)}`}>Enviar por e-mail</Button>
            </Box>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={close}>Fechar</Button></DialogActions>
    </Dialog>
  );
}
