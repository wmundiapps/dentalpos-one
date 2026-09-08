import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { Sales5787Api, type SalesLead5787 } from "../services/Sales5787Api";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (lead: SalesLead5787) => void;
};

const emptyForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  source: "REVAH",
  estimatedValue: "0",
  nextAction: "",
  temperature: "WARM",
};

export default function SalesLeadDialog5787({
  open,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setError("");
  }, [open]);

  const save = async () => {
    if (!form.name.trim()) {
      setError("Informe o nome do lead.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const lead = await Sales5787Api.createLead({
        name: form.name.trim(),
        company: form.company.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        source: form.source.trim() || "REVAH",
        estimatedValue: Math.max(0, Number(form.estimatedValue) || 0),
        nextAction: form.nextAction.trim() || null,
        temperature: form.temperature,
        stage: "NEW",
      });
      onSaved(lead);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o lead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Novo lead</DialogTitle>
      <DialogContent
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 1.5,
          pt: "12px!important",
        }}
      >
        {error && <Alert severity="error" sx={{ gridColumn: "1/-1" }}>{error}</Alert>}
        <TextField
          label="Nome"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <TextField
          label="Clínica / Empresa"
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
        />
        <TextField
          label="E-mail"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <TextField
          label="WhatsApp / Telefone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <TextField
          label="Origem"
          value={form.source}
          onChange={(e) => setForm({ ...form, source: e.target.value })}
        />
        <TextField
          label="Valor estimado"
          type="number"
          value={form.estimatedValue}
          onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })}
        />
        <TextField
          select
          label="Temperatura"
          value={form.temperature}
          onChange={(e) => setForm({ ...form, temperature: e.target.value })}
        >
          <MenuItem value="HOT">Quente</MenuItem>
          <MenuItem value="WARM">Morno</MenuItem>
          <MenuItem value="COLD">Frio</MenuItem>
        </TextField>
        <TextField
          label="Próxima ação"
          value={form.nextAction}
          onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy}>
          {busy ? "Salvando..." : "Salvar lead"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
