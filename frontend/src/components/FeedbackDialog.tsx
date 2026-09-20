import { useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import { useLocation } from "react-router-dom";
import { navigationItems } from "../config/navigation";
import { createPlatformFeedback, FEEDBACK_PRIORITIES, FEEDBACK_TYPES } from "../services/PlatformFeedbackApi";

function moduleFromPath(pathname: string): string {
  const exact = navigationItems.find((i) => i.path.split("?")[0] === pathname);
  if (exact) return exact.label;
  const partial = navigationItems
    .filter((i) => i.path !== "/" && pathname.startsWith(i.path.split("?")[0]))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (partial) return partial.label;
  return pathname === "/" ? "Dashboard" : pathname;
}

const EMPTY = { type: "Bug", priority: "Média", title: "", description: "" };

export default function FeedbackDialog({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent?: () => void }) {
  const location = useLocation();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const modulo = moduleFromPath(location.pathname);

  const close = () => {
    if (busy) return;
    setError("");
    setSent(false);
    onClose();
  };

  const submit = async () => {
    if (form.title.trim().length < 3) { setError("Informe um título."); return; }
    if (form.description.trim().length < 5) { setError("Descreva o que aconteceu ou o que você sugere."); return; }
    setBusy(true);
    setError("");
    try {
      await createPlatformFeedback({ ...form, title: form.title.trim(), description: form.description.trim(), module: modulo, pagePath: `${location.pathname}${location.search}` });
      setSent(true);
      setForm(EMPTY);
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>{"Relatar problema ou sugestão"}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
        {sent ? (
          <Alert severity="success">{"Recebemos seu relato. Obrigado! Você pode acompanhar em Configurações → Sugestões e Problemas."}</Alert>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary">{`Tela atual: ${modulo}`}</Typography>
            <TextField select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {FEEDBACK_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
            <TextField required label={"Título"} placeholder={"Ex.: Botão Salvar não responde"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} slotProps={{ htmlInput: { maxLength: 160 } }} />
            <TextField required multiline minRows={4} label={"Descrição"} placeholder={"O que você fez, o que aconteceu e o que esperava que acontecesse."} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <TextField select label="Prioridade" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {FEEDBACK_PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
            {error && <Alert severity="error">{error}</Alert>}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {sent ? (
          <>
            <Button onClick={() => setSent(false)}>Enviar outro</Button>
            <Button variant="contained" onClick={close}>Fechar</Button>
          </>
        ) : (
          <>
            <Button disabled={busy} onClick={close}>Cancelar</Button>
            <Button variant="contained" disabled={busy} onClick={() => void submit()}>{busy ? "Enviando..." : "Enviar relato"}</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}