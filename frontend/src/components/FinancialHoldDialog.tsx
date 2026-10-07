import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Typography } from "@mui/material";
import ChargeDialog, { CopyField, type ChargeEntry } from "./ChargeDialog";
import { loadPatientHold, type HoldEntry, type HoldInfo } from "../services/FinancialHoldApi";
import { settleFinancialEntry } from "../services/FinancialApi";
import { errorMessage, toast } from "../utils/toast";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Pendência financeira do paciente: reemitir boleto, gerar Pix, cobrar no cartão (online ou na maquininha) e liberar o agendamento.
export default function FinancialHoldDialog({ patientId, patientName, open, onClose, onResolved }: { patientId: string; patientName: string; open: boolean; onClose: () => void; onResolved?: () => void }) {
  const [info, setInfo] = useState<HoldInfo | null>(null);
  const [error, setError] = useState("");
  const [charging, setCharging] = useState<ChargeEntry | null>(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await loadPatientHold(patientId);
      setInfo(data);
      if (!data.hasPending) onResolved?.();
    } catch (e) { setError(errorMessage(e, "Não foi possível consultar a pendência.")); }
  }, [patientId, onResolved]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const cardOnSite = async (e: HoldEntry) => {
    if (!window.confirm(`Confirmar que ${patientName} pagou ${brl(e.amount)} no cartão, na maquininha da clínica?`)) return;
    setBusyId(e.id);
    try {
      await settleFinancialEntry(e.id, { paymentMethod: "Cartão (maquininha)", settlementNote: "Pago no cartão na clínica (regularização de pendência para agendar)." });
      toast.success("Pagamento registrado.");
      await load();
    } catch (err) { toast.error(errorMessage(err, "Não foi possível registrar o pagamento.")); }
    finally { setBusyId(""); }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Pendência financeira: {patientName}</DialogTitle>
        <DialogContent>
          {info?.message && <Alert severity={info.blocked ? "error" : "warning"} sx={{ mb: 2 }}>{info.message}</Alert>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {info && !info.hasPending && <Alert severity="success">Nenhuma pendência em aberto. O agendamento está liberado.</Alert>}
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {info?.entries.map((e) => (
              <Paper key={e.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800 }}>{e.description}</Typography>
                    <Typography variant="body2" color="text.secondary">Venceu em {new Date(e.dueDate).toLocaleDateString("pt-BR")} • {brl(e.amount)}</Typography>
                  </Box>
                  <Chip size="small" color="error" label={`${e.daysOverdue} dia(s) de atraso`} />
                </Box>
                {e.charge?.pixCopyPaste && <Box sx={{ mt: 1 }}><CopyField label="Pix copia e cola (cobrança já emitida)" value={e.charge.pixCopyPaste} /></Box>}
                {e.charge?.digitableLine && <Box sx={{ mt: 1 }}><CopyField label="Linha digitável do boleto" value={e.charge.digitableLine} /></Box>}
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
                  <Button size="small" variant="contained" onClick={() => setCharging({ id: e.id, description: e.description, personName: patientName, amount: e.amount, dueDate: e.dueDate })}>Reemitir boleto, Pix ou cartão online</Button>
                  {e.charge?.invoiceUrl && <Button size="small" variant="outlined" component="a" href={e.charge.invoiceUrl} target="_blank" rel="noopener noreferrer">Abrir cobrança emitida</Button>}
                  <Button size="small" variant="outlined" color="success" disabled={busyId === e.id} onClick={() => void cardOnSite(e)}>Passar o cartão na clínica</Button>
                </Box>
              </Paper>
            ))}
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      </Dialog>
      <ChargeDialog entry={charging} onClose={() => setCharging(null)} onChanged={() => void load()} />
    </>
  );
}
