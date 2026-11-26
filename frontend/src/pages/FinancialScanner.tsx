import { useRef, useState } from "react";
import { Alert, Box, Button, Chip, IconButton, Paper, TextField, Typography } from "@mui/material";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import DeleteIcon from "@mui/icons-material/Delete";
import PageHeader from "../components/PageHeader";
import { createFinancialEntry } from "../services/FinancialApi";
import { parseBoleto } from "../utils/boleto";
import { readBoletoFile } from "../utils/boletoFile";

interface Row { key: number; fileName: string; line: string; payee: string; description: string; amount: string; dueDate: string; bank: string; valid: boolean | null; status: "novo" | "lancado" | "erro"; message: string }

// Contas a pagar: envie o PDF ou a foto do boleto (ou cole a linha digitável) e o sistema lê valor, vencimento e banco. Você confere e lança.
export default function FinancialScanner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const seqRef = useRef(Date.now());
  const nextKey = () => seqRef.current++;
  const patch = (key: number, p: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const fromInfo = (fileName: string, info: ReturnType<typeof parseBoleto>, payee: string, textAmounts: number[] = [], labeled: number | null = null): Row => {
    // Confere o valor do código com os valores escritos no documento; se não bater, prefere o "Valor do documento" lido no texto.
    let amount = info?.amount ?? null; let warn = "";
    if (amount && textAmounts.length && !textAmounts.some((v) => Math.abs(v - (amount as number)) < 0.005)) { if (labeled) { warn = `O valor do código (${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) não aparece no documento; usei o “Valor do documento” (${labeled.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Confira.`; amount = labeled; } else { warn = "O valor do código não aparece no documento. Confira o valor antes de lançar."; amount = null; } }
    else if (amount && amount > 200000) warn = "Valor muito alto para um boleto: confira o valor antes de lançar.";
    return {
    key: nextKey(), fileName, line: info?.digitableLine || info?.barcode || "", payee, description: payee ? `Boleto ${payee}` : "", amount: amount ? String(amount) : "", dueDate: info?.dueDate || "", bank: info?.bank || "", valid: info ? info.valid : null, status: "novo",
    message: info ? (info.valid ? warn : `A linha digitável não confere (dígito verificador ou moeda). Confira os números com o boleto.${warn ? " " + warn : ""}`) : "Não encontrei o código no arquivo. Cole a linha digitável abaixo ou preencha à mão.",
  };
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setNotice("");
    const added: Row[] = [];
    for (const f of Array.from(files)) {
      try { const r = await readBoletoFile(f); added.push(fromInfo(f.name, r.info, r.payee, r.textAmounts, r.labeledAmount)); }
      catch (e) { added.push({ ...fromInfo(f.name, null, ""), message: e instanceof Error ? e.message : "Não consegui abrir o arquivo." }); }
    }
    setRows((r) => [...added, ...r]); setBusy(false);
  };
  const addManual = () => setRows((r) => [fromInfo("", null, ""), ...r].map((x, i) => (i === 0 ? { ...x, message: "" } : x)));

  const onLine = (key: number, value: string) => {
    const info = parseBoleto(value);
    patch(key, info ? { line: value, amount: info.amount ? String(info.amount) : "", dueDate: info.dueDate || "", bank: info.bank || "", valid: info.valid, message: info.valid ? "" : "A linha digitável não confere. Confira os números." } : { line: value, valid: null, message: "" });
  };

  const launch = async (row: Row) => {
    const info = parseBoleto(row.line);
    try {
      await createFinancialEntry({
        type: "EXPENSE", description: row.description || `Boleto ${row.payee}`, personName: row.payee, supplier: row.payee, amount: Number(row.amount), dueDate: row.dueDate, category: "FORNECEDOR", paymentMethod: "Boleto", status: "PENDING", origin: "BOLETO_LIDO",
        barcode: info?.barcode, digitableLine: info?.digitableLine, notes: row.fileName ? `Boleto lido do arquivo ${row.fileName}${row.bank ? ` (${row.bank})` : ""}` : row.bank ? `Banco: ${row.bank}` : undefined,
      });
      patch(row.key, { status: "lancado", message: "Lançado em contas a pagar." });
    } catch (e) { patch(row.key, { status: "erro", message: e instanceof Error ? e.message : "Não foi possível lançar." }); }
  };
  const ready = (r: Row) => r.status !== "lancado" && r.payee.trim() && Number(r.amount) > 0 && r.dueDate;
  const launchAll = async () => { for (const r of rows.filter(ready)) await launch(r); setNotice("Conferido. Os boletos lançados estão em Financeiro → contas a pagar."); };

  return (
    <Box>
      <PageHeader title="Boletos de fornecedores" description="Envie o PDF ou a foto do boleto: o sistema lê valor, vencimento e banco e lança em contas a pagar, depois da sua conferência." />
      <Alert severity="info" sx={{ mb: 2 }}>Aceita vários arquivos de uma vez. Se o boleto estiver em um e-mail, salve o PDF e envie aqui. Boleto já lançado (mesma linha digitável) é bloqueado para não duplicar. O pagamento continua manual por enquanto.</Alert>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Button component="label" variant="contained" startIcon={<CameraAltIcon />} disabled={busy}>{busy ? "Lendo…" : "Enviar PDF ou foto"}<input hidden multiple type="file" accept="application/pdf,image/*" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} /></Button>
        <Button variant="outlined" onClick={addManual}>Colar linha digitável</Button>
        {rows.some(ready) && <Button variant="contained" color="success" onClick={() => void launchAll()}>Lançar todos os conferidos</Button>}
      </Box>
      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
      {rows.map((r) => (
        <Paper key={r.key} variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3, opacity: r.status === "lancado" ? 0.65 : 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
            <Typography sx={{ fontWeight: 800, flex: 1 }}>{r.fileName || "Boleto digitado"}</Typography>
            {r.bank && <Chip size="small" label={r.bank} />}
            {r.valid === true && <Chip size="small" color="success" label="Código conferido" />}
            {r.status === "lancado" && <Chip size="small" color="success" label="Lançado" />}
            <IconButton size="small" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
          {r.message && <Alert severity={r.status === "lancado" ? "success" : r.status === "erro" ? "error" : "warning"} sx={{ mb: 1 }}>{r.message}</Alert>}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr" }, gap: 2 }}>
            <TextField label="Linha digitável / código de barras" value={r.line} onChange={(e) => onLine(r.key, e.target.value)} sx={{ gridColumn: { md: "1 / -1" } }} />
            <TextField required label="Fornecedor (quem recebe)" value={r.payee} onChange={(e) => patch(r.key, { payee: e.target.value, description: r.description || (e.target.value ? `Boleto ${e.target.value}` : "") })} />
            <TextField required type="number" label="Valor (R$)" value={r.amount} onChange={(e) => patch(r.key, { amount: e.target.value })} />
            <TextField required type="date" label="Vencimento" value={r.dueDate} onChange={(e) => patch(r.key, { dueDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Descrição" value={r.description} onChange={(e) => patch(r.key, { description: e.target.value })} sx={{ gridColumn: { md: "1 / -1" } }} />
          </Box>
          <Button sx={{ mt: 2 }} variant="contained" disabled={!ready(r)} onClick={() => void launch(r)}>Conferir e lançar</Button>
        </Paper>
      ))}
    </Box>
  );
}
