import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from "@mui/material";
import { useState } from "react";

export interface Campo { k: string; label: string; type?: "text" | "number" | "date" | "datetime-local" | "select"; options?: Array<[string, string]>; multiline?: boolean; required?: boolean; width?: number }

/** Janela de formulário simples: preenche os campos e devolve o objeto ao salvar. */
export function FormDialog({ open, title, campos, inicial, onSave, onClose, texto = "Salvar" }: {
  open: boolean; title: string; campos: Campo[]; inicial?: Record<string, any>; onSave: (v: Record<string, any>) => Promise<void> | void; onClose: () => void; texto?: string;
}) {
  const [v, setV] = useState<Record<string, any>>({});
  const [aberto, setAberto] = useState(false);
  const [busy, setBusy] = useState(false);
  if (open && !aberto) { setAberto(true); setV({ ...(inicial ?? {}) }); }
  if (!open && aberto) setAberto(false);
  const falta = campos.some((c) => c.required && !String(v[c.k] ?? "").trim());
  async function salvar() { setBusy(true); try { await onSave(v); } finally { setBusy(false); } }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        {campos.map((c) => (
          <TextField key={c.k} size="small" label={c.label} required={c.required} type={c.type === "select" || c.type === "text" ? undefined : c.type} select={c.type === "select"} multiline={c.multiline} minRows={c.multiline ? 4 : undefined}
            value={v[c.k] ?? ""} onChange={(e) => setV({ ...v, [c.k]: e.target.value })} slotProps={{ inputLabel: c.type === "date" || c.type === "datetime-local" ? { shrink: true } : undefined }}>
            {c.options?.map(([val, rot]) => <MenuItem key={val} value={val}>{rot}</MenuItem>)}
          </TextField>
        ))}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={busy || falta} onClick={salvar}>{texto}</Button></DialogActions>
    </Dialog>
  );
}

const COR: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  REGISTRADA: "error", EM_TRATATIVA: "warning", PROVIDENCIA_CONFIRMADA: "info", ENCERRADA: "success",
  PENDENTE: "warning", ENTREGUE: "success", DEVOLVIDO: "default", EMITIDA: "success", SOLICITADA: "warning",
  GRAVE: "error", FATAL: "error", MODERADA: "warning", LEVE: "default", AGENDADO: "info", REALIZADO: "success", CANCELADO: "default",
};
export function Pill({ v }: { v?: string | null }) { return v ? <Chip size="small" color={COR[v] ?? "default"} label={v.replace(/_/g, " ")} /> : <>—</>; }
export const dt = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
export const dth = (v: any) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
export const iso = (v: any) => (v ? new Date(v).toISOString() : undefined);
