import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Menu, MenuItem, Paper, TextField, Typography } from "@mui/material";
import ChargeDialog, { type ChargeEntry } from "../ChargeDialog";
import NewChargeDialog, { type ChargeMethod } from "./NewChargeDialog";
import { cancelFinancialEntry, loadFinancialEntries, settleFinancialEntry, type FinancialEntry } from "../../services/FinancialApi";
import type { BackendPatient } from "../../services/PatientApi";
import { printDebtReport } from "../../utils/debtReport";
import { errorMessage, toast } from "../../utils/toast";

type Row = FinancialEntry & { fiscalDocumentType?: string | null; documentNumber?: string | null };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const METHODS: Array<[ChargeMethod, string]> = [["BOLETO", "Boleto"], ["PIX", "Pix"], ["CARTAO_ONLINE", "Cartão"], ["CHEQUE", "Cheque pré-datado"], ["DINHEIRO", "Dinheiro"]];
const CANCEL_REASONS = ["Boleto duplicado (já constava em outro lançamento)", "Parcela já está paga", "Lançado por engano", "Negociação / desconto concedido", "Tratamento cancelado"];
const RECEIVE_OPTIONS = ["Dinheiro", "Cartão (maquininha)", "Pix", "Transferência", "Cheque compensado"];

function situation(r: Row): { label: string; color: "success" | "error" | "warning" | "default" } {
  if (r.status === "PAID") return { label: r.type === "EXPENSE" ? "Pago" : "Recebido", color: "success" };
  if (r.status === "CANCELLED") return { label: "Cancelado", color: "default" };
  return new Date(r.dueDate).getTime() < Date.now() - 86400000 ? { label: "Atrasado", color: "error" } : { label: "A vencer", color: "warning" };
}

// Aba de cobrança do paciente: histórico de contas a receber e a pagar + gerar cobrança (boleto, Pix, cartão, cheque pré-datado, dinheiro).
export default function PatientBillingTab({ patient, startMethod }: { patient: BackendPatient; startMethod?: ChargeMethod }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [newMethod, setNewMethod] = useState<ChargeMethod | null>(startMethod || null);
  const [charging, setCharging] = useState<ChargeEntry | null>(null);
  const [menu, setMenu] = useState<{ el: HTMLElement; row: Row } | null>(null);
  const [cancelRow, setCancelRow] = useState<Row | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [debtOpen, setDebtOpen] = useState(false);
  const [debtInterest, setDebtInterest] = useState(false);
  const [debtFine, setDebtFine] = useState("2");
  const [debtRate, setDebtRate] = useState("1");
  const [filter, setFilter] = useState<"" | "Recebido" | "Atrasado" | "A vencer" | "A pagar ao paciente">("");
  const matches = (r: Row) => {
    if (!filter) return true;
    const s = situation(r).label;
    if (filter === "A pagar ao paciente") return r.type === "EXPENSE" && s !== "Pago" && s !== "Cancelado";
    return r.type !== "EXPENSE" && s === filter;
  };

  const load = useCallback(() => {
    loadFinancialEntries()
      .then((all) => setRows((all as Row[]).filter((r) => r.patientId === patient.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate))))
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar o financeiro do paciente."));
  }, [patient.id]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const t = { received: 0, overdue: 0, open: 0, payable: 0 };
    for (const r of rows || []) {
      const s = situation(r).label;
      if (r.type === "EXPENSE") { if (s !== "Pago" && s !== "Cancelado") t.payable += r.amount; continue; }
      if (s === "Recebido") t.received += r.amount; else if (s === "Atrasado") t.overdue += r.amount; else if (s === "A vencer") t.open += r.amount;
    }
    return t;
  }, [rows]);

  const receive = async (row: Row, method: string) => {
    setMenu(null);
    if (!window.confirm(`Confirmar o recebimento de ${brl(row.amount)} (${method})?`)) return;
    try { await settleFinancialEntry(row.id, { paymentMethod: method, settlementNote: `Recebido: ${method}.` }); toast.success("Recebimento registrado."); load(); }
    catch (e) { toast.error(errorMessage(e, "Não foi possível registrar o recebimento.")); }
  };

  const confirmCancel = async () => {
    if (!cancelRow || cancelReason.trim().length < 5) return;
    setCancelBusy(true);
    try { await cancelFinancialEntry(cancelRow.id, cancelReason.trim()); toast.success("Boleto/parcela cancelado com o motivo registrado."); setCancelRow(null); setCancelReason(""); load(); }
    catch (e) { toast.error(errorMessage(e, "Não foi possível cancelar.")); }
    finally { setCancelBusy(false); }
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <Box sx={{ display: "grid", placeItems: "center", minHeight: 200 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, borderColor: "primary.main" }}>
        <Typography sx={{ fontWeight: 900, mb: 1 }}>Gerar financeiro para {patient.fullName}</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {METHODS.map(([m, label]) => <Button key={m} variant="contained" onClick={() => setNewMethod(m)}>{label}</Button>)}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Pagador: {`pessoa física — ${patient.fullName}${patient.cpf ? ` (CPF ${patient.cpf})` : ""}`}. Boleto, Pix e cartão online usam a conta Asaas da clínica; dinheiro, maquininha e cheque são lançados direto no caixa.
        </Typography>
      </Paper>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" }, gap: 2 }}>
        {([["Recebido", totals.received, "success.main"], ["Atrasado", totals.overdue, "error.main"], ["A vencer", totals.open, "warning.main"], ["A pagar ao paciente", totals.payable, "text.primary"]] as const).map(([t, v, c]) => (
          <Paper key={t} variant="outlined" onClick={() => setFilter((cur) => (cur === t ? "" : t))} sx={{ p: 2, borderRadius: 3, cursor: "pointer", borderColor: filter === t ? c : "divider", borderWidth: filter === t ? 2 : 1, bgcolor: filter === t ? "action.hover" : "background.paper", "&:hover": { borderColor: c } }}>
            <Typography variant="body2" color="text.secondary">{t}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, color: c }}>{brl(v)}</Typography>
          </Paper>
        ))}
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Histórico financeiro (contas a receber e a pagar)</Typography>
        {(rows || []).some((r) => r.type !== "EXPENSE" && situation(r).label === "Atrasado") && <Button size="small" variant="outlined" color="error" onClick={() => setDebtOpen(true)}>Relatório de débitos (cartório)</Button>}
        {filter && <Chip color="primary" label={`Filtrando: ${filter} (${rows.filter(matches).length}) — limpar`} onClick={() => setFilter("")} onDelete={() => setFilter("")} />}
        <Button size="small" variant="outlined" onClick={() => navigate(`/financeiro?paciente=${encodeURIComponent(patient.fullName)}`)}>Abrir financeiro completo</Button>
      </Box>
      {rows.length > 0 && rows.filter(matches).length === 0 ? <Typography color="text.secondary">Nenhum lançamento nesta situação. Clique no quadro de novo para ver todos.</Typography> : rows.length === 0 ? <Typography color="text.secondary">Nenhum lançamento para este paciente ainda. Use os botões acima para gerar o primeiro financeiro.</Typography> : (
        <Box sx={{ display: "grid", gap: 1 }}>
          {rows.filter(matches).map((r) => {
            const s = situation(r);
            const open = r.status === "PENDING" && r.type === "INCOME";
            const other = r.personName && r.personName.trim().toLowerCase() !== patient.fullName.trim().toLowerCase();
            return (
              <Paper key={r.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800 }}>{r.description}{r.installments && r.installments > 1 ? ` (${r.installment || 1}/${r.installments})` : ""}</Typography>
                    <Typography variant="body2" color="text.secondary">{r.type === "EXPENSE" ? "A pagar" : "A receber"} • vencimento {day(r.dueDate)} • {brl(r.amount)}{r.paymentMethod ? ` • ${r.paymentMethod}` : ""}{r.paidAt ? ` • em ${day(r.paidAt)}` : ""}</Typography>
                    {other && <Typography variant="body2" color="text.secondary">Pagador: {r.personName} (terceiro/empresa)</Typography>}
                  </Box>
                  <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <Chip size="small" color={s.color} label={s.label} />
                    <Chip size="small" variant="outlined" label={r.paymentReceipt ? "Recibo emitido" : "Sem recibo"} />
                    <Chip size="small" variant="outlined" label={r.documentNumber ? `${r.fiscalDocumentType || "Nota fiscal"} nº ${r.documentNumber}` : "Sem nota fiscal"} />
                  </Box>
                </Box>
                {r.status === "CANCELLED" && r.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, whiteSpace: "pre-line" }}>{r.notes}</Typography>}
                {open && (
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.25 }}>
                    <Button size="small" variant="contained" onClick={() => setCharging({ id: r.id, description: r.description, personName: patient.fullName, amount: r.amount, dueDate: r.dueDate, phone: patient.phone })}>Gerar boleto / Pix / cartão</Button>
                    <Button size="small" variant="outlined" color="success" onClick={(e) => setMenu({ el: e.currentTarget, row: r })}>Receber agora</Button>
                    <Button size="small" variant="outlined" color="error" onClick={() => { setCancelRow(r); setCancelReason(""); }}>Cancelar boleto / parcela</Button>
                  </Box>
                )}
              </Paper>
            );
          })}
        </Box>
      )}

      <Menu open={Boolean(menu)} anchorEl={menu?.el} onClose={() => setMenu(null)}>
        {RECEIVE_OPTIONS.map((o) => <MenuItem key={o} onClick={() => menu && void receive(menu.row, o)}>{o}</MenuItem>)}
      </Menu>
      <Dialog open={Boolean(cancelRow)} onClose={() => !cancelBusy && setCancelRow(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Cancelar boleto / parcela</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {cancelRow && <Alert severity="warning">{cancelRow.description} — vencimento {day(cancelRow.dueDate)} — {brl(cancelRow.amount)}. Se houver boleto ou Pix em aberto no Asaas, ele também será cancelado. O lançamento não é apagado: fica no histórico como Cancelado com o motivo.</Alert>}
          <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
            {CANCEL_REASONS.map((r) => <Chip key={r} clickable label={r} onClick={() => setCancelReason(r)} />)}
          </Box>
          <TextField required multiline minRows={3} label="Motivo do cancelamento" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Ex.: paciente estava com o boleto duplicado no Clinicorp; este que consta em aberto já está pago." />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelRow(null)} disabled={cancelBusy}>Voltar</Button>
          <Button color="error" variant="contained" disabled={cancelBusy || cancelReason.trim().length < 5} onClick={() => void confirmCancel()}>{cancelBusy ? "Cancelando..." : "Cancelar boleto / parcela"}</Button>
        </DialogActions>
      </Dialog>
      <NewChargeDialog patient={patient} open={Boolean(newMethod)} initialMethod={newMethod || undefined} onClose={() => setNewMethod(null)} onDone={load} />
      <Dialog open={debtOpen} onClose={() => setDebtOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 900 }}>Relatório de débitos — cartório</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <Typography variant="body2" color="text.secondary">Gera uma folha para imprimir com os dados da clínica e do paciente, as parcelas vencidas mês a mês e o total devido.</Typography>
          <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer" }}><input type="checkbox" checked={debtInterest} onChange={(e) => setDebtInterest(e.target.checked)} /> Incluir multa e juros (valor atualizado)</Box>
          {debtInterest && (<Box sx={{ display: "flex", gap: 2 }}>
            <TextField size="small" label="Multa (%)" value={debtFine} onChange={(e) => setDebtFine(e.target.value)} />
            <TextField size="small" label="Juros (% ao mês)" value={debtRate} onChange={(e) => setDebtRate(e.target.value)} />
          </Box>)}
          {!patient.cpf && <Alert severity="warning">Este paciente está sem CPF no cadastro. O cartório exige o CPF: complete em Dados pessoais antes de imprimir.</Alert>}
          <Typography variant="caption" color="text.secondary">Confira com seu advogado ou o cartório os percentuais e documentos exigidos para protesto/cobrança. Os juros aqui são simples, proporcionais aos dias de atraso.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDebtOpen(false)}>Fechar</Button>
          <Button variant="contained" onClick={async () => {
            const overdue = (rows || []).filter((r) => r.type !== "EXPENSE" && situation(r).label === "Atrasado");
            const ok = await printDebtReport(patient, overdue, { withInterest: debtInterest, finePercent: Number(debtFine.replace(",", ".")) || 0, monthlyInterestPercent: Number(debtRate.replace(",", ".")) || 0 });
            if (!ok) toast.error("O navegador bloqueou a janela. Permita pop-ups para este site."); else setDebtOpen(false);
          }}>Gerar relatório</Button>
        </DialogActions>
      </Dialog>
      <ChargeDialog entry={charging} onClose={() => setCharging(null)} onChanged={load} />
    </Box>
  );
}
