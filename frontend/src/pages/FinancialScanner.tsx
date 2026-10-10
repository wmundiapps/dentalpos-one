import { useState } from "react";
import { Alert, Box, Button, CircularProgress, MenuItem, Paper, TextField, Typography } from "@mui/material";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import PageHeader from "../components/PageHeader";
import { DEMO_DATA_ON } from "../utils/demoMode";
import { readDemoAccess } from "../services/DemoAccess";
import { createFinancialEntry } from "../services/FinancialApi";
import { listFinanceEntries, saveFinanceEntries, type FinanceEntryType } from "../services/FinanceHubService";

const emptyForm = () => ({ description: "", personName: "", type: "Despesa" as FinanceEntryType, value: "", dueDate: "", barcode: "", accountingMode: "Empresa" as "Livro Caixa" | "Empresa", documentType: "Boleto" as "Boleto" | "Nota fiscal" | "Recibo" | "Comprovante" | "Outro" });
const MAX_FILE_MB = 15;

export default function FinancialScanner() {
  const [fileName, setFileName] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof ReturnType<typeof emptyForm>>(k: K, v: ReturnType<typeof emptyForm>[K]) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); };

  const onFile = (file?: File) => {
    if (!file) { setFileName(""); return; }
    if (file.size > MAX_FILE_MB * 1024 * 1024) { setError(`O arquivo excede ${MAX_FILE_MB} MB.`); setFileName(""); return; }
    setError(""); setFileName(file.name);
  };

  const save = async () => {
    setSaved(false);
    const value = Number(form.value);
    if (!form.description.trim() || !form.personName.trim()) { setError("Informe a descrição e a pessoa / fornecedor / paciente."); return; }
    if (!Number.isFinite(value) || value <= 0) { setError("Informe um valor maior que zero."); return; }
    if (!form.dueDate) { setError("Informe o vencimento ou a data do documento."); return; }
    setError(""); setSaving(true);
    const notes = [`Escrituração: ${form.accountingMode}`, form.barcode && `Código: ${form.barcode.trim()}`, fileName && `Arquivo capturado: ${fileName}`].filter(Boolean).join("\n");
    try {
      if (DEMO_DATA_ON || readDemoAccess()?.isDemo) {
        // Modo demonstração: guarda só neste navegador.
        saveFinanceEntries([{ id: Date.now(), description: form.description.trim(), category: "Digitalizado", personName: form.personName.trim(), type: form.type, status: form.dueDate < new Date().toISOString().slice(0, 10) ? "Vencido" : "Pendente", value, dueDate: form.dueDate, origin: "Manual", provider: "Manual", accountingMode: form.accountingMode, documentType: form.documentType, barcode: form.barcode, notes: fileName ? `Arquivo capturado: ${fileName}` : undefined }, ...listFinanceEntries()]);
      } else {
        await createFinancialEntry({ type: form.type === "Receita" ? "INCOME" : "EXPENSE", description: form.description.trim(), category: "Digitalizado", personName: form.personName.trim(), amount: value, dueDate: form.dueDate, provider: "Manual", notes });
      }
      setSaved(true); setForm(emptyForm()); setFileName("");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Não foi possível lançar o documento. Tente novamente.");
    } finally { setSaving(false); }
  };

  return <Box>
    <PageHeader title="Digitalizar financeiro" description="Contas a pagar, contas pagas, boletos, notas, recibos e comprovantes; classificação por Livro Caixa ou Empresa." />
    <Alert severity="info" sx={{ mb: 2 }}>Você confere e preenche os dados do documento antes de lançar no financeiro. A leitura automática do documento ainda não está disponível; o arquivo capturado serve de referência no lançamento.</Alert>
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, maxWidth: 900 }}>
      {saved && <Alert severity="success" sx={{ mb: 2 }}>Documento registrado no financeiro.</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      <Button component="label" variant="outlined" startIcon={<CameraAltIcon />}>Capturar foto / arquivo<input hidden type="file" accept="image/*,application/pdf" capture="environment" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} /></Button>
      {fileName && <Typography sx={{ mt: 1 }}>{fileName}</Typography>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mt: 3 }}>
        <TextField select label="Tipo de documento" value={form.documentType} onChange={e => set("documentType", e.target.value as typeof form.documentType)}>{["Boleto", "Nota fiscal", "Recibo", "Comprovante", "Outro"].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
        <TextField select label="Escrituração" value={form.accountingMode} onChange={e => set("accountingMode", e.target.value as typeof form.accountingMode)}><MenuItem value="Livro Caixa">Livro Caixa</MenuItem><MenuItem value="Empresa">Empresa</MenuItem></TextField>
        <TextField select label="Natureza" value={form.type} onChange={e => set("type", e.target.value as FinanceEntryType)}><MenuItem value="Despesa">Conta / despesa</MenuItem><MenuItem value="Receita">Recebimento / receita</MenuItem></TextField>
        <TextField label="Código de barras / linha digitável" value={form.barcode} onChange={e => set("barcode", e.target.value)} />
        <TextField required label="Descrição" value={form.description} onChange={e => set("description", e.target.value)} />
        <TextField required label="Pessoa / fornecedor / paciente" value={form.personName} onChange={e => set("personName", e.target.value)} />
        <TextField required type="number" label="Valor" value={form.value} onChange={e => set("value", e.target.value)} slotProps={{ htmlInput: { min: 0, step: "0.01" } }} />
        <TextField required type="date" label="Vencimento / data" slotProps={{ inputLabel: { shrink: true } }} value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
      </Box>
      <Button sx={{ mt: 3 }} variant="contained" disabled={saving} onClick={() => void save()} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>{saving ? "Lançando..." : "Conferir e lançar"}</Button>
    </Paper>
  </Box>;
}
