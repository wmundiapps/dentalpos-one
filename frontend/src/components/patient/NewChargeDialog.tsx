import { useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import ChargeDialog, { type ChargeEntry } from "../ChargeDialog";
import { createFinancialEntry, settleFinancialEntry } from "../../services/FinancialApi";
import type { BackendPatient } from "../../services/PatientApi";
import { errorMessage, toast } from "../../utils/toast";

export type ChargeMethod = "BOLETO" | "PIX" | "CARTAO_ONLINE" | "CARTAO_MAQUININHA" | "CHEQUE" | "DINHEIRO";
const LABEL: Record<ChargeMethod, string> = { BOLETO: "Boleto", PIX: "Pix", CARTAO_ONLINE: "Cartão (link online)", CARTAO_MAQUININHA: "Cartão (maquininha)", CHEQUE: "Cheque pré-datado", DINHEIRO: "Dinheiro" };
const todayISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const addDays = (iso: string, days: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + days); return d.toLocaleDateString("sv-SE"); };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Gerar cobrança do paciente: boleto, Pix, cartão, cheque pré-datado ou dinheiro, a partir da ficha do paciente.
export default function NewChargeDialog({ patient, open, initialMethod, onClose, onDone }: { patient: BackendPatient; open: boolean; initialMethod?: ChargeMethod; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState<ChargeMethod>("BOLETO");
  const [description, setDescription] = useState("Tratamento odontológico");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [count, setCount] = useState("1");
  const [interval, setIntervalDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState<{ entry: ChargeEntry; type: "PIX" | "BOLETO" | "CARTAO" } | null>(null);

  useEffect(() => { if (open) { setMethod(initialMethod || "BOLETO"); setError(""); setAmount(""); setCount("1"); setDueDate(todayISO()); } }, [open, initialMethod]);

  const value = Number(amount.replace(/\./g, "").replace(",", "."));
  const instant = method === "DINHEIRO" || method === "CARTAO_MAQUININHA";

  const submit = async () => {
    if (!(value > 0)) { setError("Informe o valor da cobrança."); return; }
    if (description.trim().length < 3) { setError("Descreva o que está sendo cobrado."); return; }
    setBusy(true); setError("");
    try {
      const base = { patientId: patient.id, type: "INCOME" as const, category: "Tratamento", personName: patient.fullName, description: description.trim() };
      if (method === "CHEQUE") {
        const n = Math.min(24, Math.max(1, Math.round(Number(count) || 1)));
        const cents = Math.round(value * 100);
        const part = Math.floor(cents / n);
        for (let i = 0; i < n; i++) {
          const cheque = i === n - 1 ? cents - part * (n - 1) : part;
          await createFinancialEntry({ ...base, description: n > 1 ? `${base.description} (cheque ${i + 1}/${n})` : base.description, amount: cheque / 100, dueDate: addDays(dueDate, i * (Number(interval) || 30)), paymentMethod: "Cheque pré-datado", status: "PENDING", notes: `Cheque pré-datado ${i + 1}/${n}` });
        }
        toast.success(n > 1 ? `${n} cheques pré-datados lançados.` : "Cheque pré-datado lançado.");
        onDone(); onClose();
      } else if (instant) {
        const label = method === "DINHEIRO" ? "Dinheiro" : "Cartão (maquininha)";
        const entry = await createFinancialEntry({ ...base, amount: value, dueDate: todayISO(), paymentMethod: label, status: "PENDING" });
        await settleFinancialEntry(entry.id, { paymentMethod: label, settlementNote: `Recebido na clínica (${label}).` });
        toast.success(`Recebimento de ${brl(value)} registrado (${label}).`);
        onDone(); onClose();
      } else {
        const type = method === "BOLETO" ? "BOLETO" : method === "PIX" ? "PIX" : "CARTAO";
        const entry = await createFinancialEntry({ ...base, amount: value, dueDate, paymentMethod: method === "BOLETO" ? "Boleto" : method === "PIX" ? "PIX" : "Cartão", provider: "Asaas", status: "PENDING" });
        onDone();
        setOnline({ entry: { id: entry.id, description: entry.description, personName: patient.fullName, amount: entry.amount, dueDate: entry.dueDate, phone: patient.phone }, type });
      }
    } catch (e) { const m = errorMessage(e, "Não foi possível gerar a cobrança."); setError(m); toast.error(m); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Dialog open={open && !online} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Gerar financeiro — {patient.fullName}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75 }}>Forma de cobrança</Typography>
            <ToggleButtonGroup exclusive value={method} onChange={(_, v) => v && setMethod(v)} size="small" sx={{ flexWrap: "wrap", gap: 0.5 }}>
              {(Object.keys(LABEL) as ChargeMethod[]).map((m) => <ToggleButton key={m} value={m} sx={{ textTransform: "none", fontWeight: 700 }}>{LABEL[m]}</ToggleButton>)}
            </ToggleButtonGroup>
          </Box>
          <TextField label="O que está sendo cobrado" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            <TextField label="Valor total (R$)" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" />
            {!instant && <TextField type="date" label={method === "CHEQUE" ? "Vencimento do 1º cheque" : "Vencimento"} value={dueDate} onChange={(e) => setDueDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />}
          </Box>
          {method === "CHEQUE" && (
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField select label="Quantidade de cheques" value={count} onChange={(e) => setCount(e.target.value)}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <MenuItem key={n} value={String(n)}>{n}x</MenuItem>)}</TextField>
              <TextField select label="Intervalo entre cheques" value={interval} onChange={(e) => setIntervalDays(e.target.value)}>{[7, 15, 30].map((n) => <MenuItem key={n} value={String(n)}>{n} dias</MenuItem>)}</TextField>
            </Box>
          )}
          <Alert severity="info">
            {method === "BOLETO" && "Na próxima tela você confirma a geração do boleto pelo Asaas e já pode enviar o link ao paciente."}
            {method === "PIX" && "Na próxima tela você gera o Pix (QR Code e copia e cola) pelo Asaas."}
            {method === "CARTAO_ONLINE" && "Na próxima tela você gera o link de pagamento no cartão (parcelado em até 12x) pelo Asaas."}
            {method === "CARTAO_MAQUININHA" && "O valor é lançado como recebido agora, no cartão passado na maquininha da clínica."}
            {method === "CHEQUE" && "Cada cheque vira um lançamento a receber no vencimento dele. Dê baixa quando o cheque for compensado."}
            {method === "DINHEIRO" && "O valor é lançado como recebido agora, em dinheiro, no caixa da clínica."}
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="contained" disabled={busy} onClick={() => void submit()}>{busy ? "Gerando..." : instant ? "Registrar recebimento" : method === "CHEQUE" ? "Lançar cheque(s)" : "Continuar"}</Button>
        </DialogActions>
      </Dialog>
      <ChargeDialog entry={online?.entry || null} initialBillingType={online?.type} onClose={() => { setOnline(null); onClose(); }} onChanged={onDone} />
    </>
  );
}
