import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, TextField } from "@mui/material";
import { useState, type ReactNode } from "react";
import { msgErro } from "../reitoria/common";

/** Executa uma ação de API com aviso de sucesso/erro (Snackbar). */
export function useConfirmAcao() {
  const [msg, setMsg] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string, depois?: () => void) => {
    try { await fn(); setMsg({ tipo: "success", texto: ok }); depois?.(); }
    catch (e) { setMsg({ tipo: "error", texto: msgErro(e) }); }
  };
  const aviso: ReactNode = (
    <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
      {msg ? <Alert severity={msg.tipo} onClose={() => setMsg(null)}>{msg.texto}</Alert> : undefined}
    </Snackbar>
  );
  return { run, aviso };
}

export function AdiarDialog({ aberto, titulo, onClose, onConfirm }: { aberto: boolean; titulo?: string; onClose: () => void; onConfirm: (dias: number) => void }) {
  const [dias, setDias] = useState("3");
  const n = parseInt(dias, 10);
  const ok = Number.isInteger(n) && n >= 1 && n <= 30;
  return (
    <Dialog open={aberto} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Adiar aviso</DialogTitle>
      <DialogContent>
        <p style={{ marginTop: 0 }}>{titulo}</p>
        <TextField label="Adiar por quantos dias? (1 a 30)" type="number" value={dias} onChange={(e) => setDias(e.target.value)} fullWidth error={!ok} autoFocus />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={!ok} onClick={() => onConfirm(n)}>Adiar</Button>
      </DialogActions>
    </Dialog>
  );
}
