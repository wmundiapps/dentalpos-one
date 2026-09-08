import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Sales5787Api } from "../services/Sales5787Api";

const emptyForm = {
  legalName: "",
  document: "",
  contactName: "",
  email: "",
  phone: "",
  storeUrl: "",
};

export default function AffiliateSupplierForm5787() {
  const [form, setForm] = useState(emptyForm);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setSuccess("");
    setError("");
    try {
      const row = await Sales5787Api.createAffiliateSupplier({
        ...form,
        acceptedTerms: accepted,
      });
      setSuccess(
        `${row.legalName} foi cadastrado como fornecedor afiliado e ficará em análise.`,
      );
      setForm(emptyForm);
      setAccepted(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar cadastro.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>
        Quero ser fornecedor afiliado
      </Typography>

      {success && <Alert severity="success">{success}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        label="Razão social / Nome"
        value={form.legalName}
        onChange={(e) => setForm({ ...form, legalName: e.target.value })}
      />
      <TextField
        label="CNPJ/CPF"
        value={form.document}
        onChange={(e) => setForm({ ...form, document: e.target.value })}
      />
      <TextField
        label="Responsável"
        value={form.contactName}
        onChange={(e) => setForm({ ...form, contactName: e.target.value })}
      />
      <TextField
        label="E-mail"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <TextField
        label="WhatsApp"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <TextField
        label="Link da loja do fornecedor"
        value={form.storeUrl}
        onChange={(e) => setForm({ ...form, storeUrl: e.target.value })}
      />

      <Alert severity="info">
        Ao aceitar a afiliação, as vendas atribuídas a clientes originados pelo
        DentalPos One gerarão comissão de <strong>10%</strong> para o DentalPos
        One, de responsabilidade do fornecedor, salvo percentual diferente
        configurado em contrato.
      </Alert>

      <FormControlLabel
        control={
          <Checkbox
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
        }
        label="Li e aceito as condições comerciais e a comissão configurada."
      />

      <Button
        disabled={!accepted || busy}
        variant="contained"
        onClick={() => void submit()}
      >
        {busy ? "Enviando..." : "Enviar cadastro para análise"}
      </Button>
    </Stack>
  );
}
