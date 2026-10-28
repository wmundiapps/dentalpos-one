import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { StockApi, type StockHistory, type StockMovementResult } from "../services/StockApi";

const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export type StockDialogMode = "HISTORY" | "RESTOCK" | "UNIT_USED";

interface Props {
  open: boolean;
  mode: StockDialogMode;
  productId: string;
  productName: string;
  unit: string;
  onClose: () => void;
  onDone: () => void;
}

// Histórico de duração do produto. Na reposição e no "terminou uma unidade", mostra quantos procedimentos o produto durou.
export default function StockHistoryDialog({ open, mode, productId, productName, unit, onClose, onDone }: Props) {
  const [history, setHistory] = useState<StockHistory | null>(null);
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StockMovementResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setHistory(null); setResult(null); setError(""); setQty("1");
    StockApi.history(productId).then(setHistory).catch((e) => setError(e instanceof Error ? e.message : "Não foi possível carregar o histórico."));
  }, [open, productId]);

  const confirm = async () => {
    setBusy(true); setError("");
    try {
      setResult(await StockApi.movement(productId, mode === "RESTOCK" ? "RESTOCK" : "UNIT_USED", Math.max(1, Number(qty.replace(",", ".")) || 1)));
      onDone();
      setHistory(await StockApi.history(productId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar.");
    } finally { setBusy(false); }
  };

  const title = mode === "RESTOCK" ? "Registrar reposição (novo pedido)" : mode === "UNIT_USED" ? "Terminou uma unidade" : "Histórico de duração";

  return (
    <Dialog open={open} onClose={() => { if (!busy) onClose(); }} fullWidth maxWidth="sm">
      <DialogTitle>{`${title} • ${productName}`}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!history && !error && <Box sx={{ display: "grid", placeItems: "center", py: 3 }}><CircularProgress /></Box>}
        {history && !result && mode !== "HISTORY" && (
          <Alert severity={history.openCount > 0 ? "info" : "warning"}>
            {history.openCount > 0
              ? `Desde a última reposição foram ${history.openCount} procedimento(s) com este produto${history.average ? `. Nas reposições anteriores ele durou em média ${history.average} procedimentos.` : "."}`
              : "Ainda não há procedimentos contados para este produto. Ligue-o a um procedimento na planilha de consumo."}
          </Alert>
        )}
        {mode !== "HISTORY" && !result && (
          <TextField type="number" label={mode === "RESTOCK" ? `Quantidade recebida (${unit})` : `Unidades que terminaram (${unit})`} value={qty} onChange={(e) => setQty(e.target.value)} slotProps={{ htmlInput: { min: 1 } }} />
        )}
        {result && (
          <Alert severity="success">
            {result.cycle
              ? `Registrado. Este produto durou ${result.cycle.procedureCount} procedimento(s) até aqui${result.average ? ` (média das reposições anteriores: ${result.average})` : ""}.`
              : "Registrado. Ainda não havia procedimentos contados para este produto."}
          </Alert>
        )}
        {history && (
          <Box>
            <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Histórico de reposições</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {`Em aberto agora: ${history.openCount} procedimento(s)${history.average ? ` • Média por ciclo: ${history.average}` : ""}`}
            </Typography>
            {history.cycles.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhum ciclo fechado ainda. O histórico aparece depois da primeira reposição.</Typography> : (
              <Box sx={{ display: "grid", gap: 0.5 }}>
                {history.cycles.map((c) => (
                  <Box key={c.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1, borderBottom: "1px solid", borderColor: "divider", py: 0.5 }}>
                    <Typography variant="body2">{`${day(c.startedAt)} a ${day(c.endedAt)}`}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>{`${c.procedureCount} procedimento(s)`}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>{result || mode === "HISTORY" ? "Fechar" : "Cancelar"}</Button>
        {mode !== "HISTORY" && !result && <Button variant="contained" disabled={busy || !history} onClick={() => void confirm()}>{busy ? "Salvando..." : "Confirmar"}</Button>}
      </DialogActions>
    </Dialog>
  );
}
