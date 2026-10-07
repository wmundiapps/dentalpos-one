import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, Chip, CircularProgress, Menu, MenuItem, Paper, Typography } from "@mui/material";
import ChargeDialog, { type ChargeEntry } from "../ChargeDialog";
import NewChargeDialog, { type ChargeMethod } from "./NewChargeDialog";
import { loadFinancialEntries, settleFinancialEntry, type FinancialEntry } from "../../services/FinancialApi";
import type { BackendPatient } from "../../services/PatientApi";
import { errorMessage, toast } from "../../utils/toast";

type Row = FinancialEntry & { fiscalDocumentType?: string | null; documentNumber?: string | null };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const METHODS: Array<[ChargeMethod, string]> = [["BOLETO", "Boleto"], ["PIX", "Pix"], ["CARTAO_ONLINE", "Cartão"], ["CHEQUE", "Cheque pré-datado"], ["DINHEIRO", "Dinheiro"]];
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
          <Paper key={t} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="body2" color="text.secondary">{t}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, color: c }}>{brl(v)}</Typography>
          </Paper>
        ))}
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Histórico financeiro (contas a receber e a pagar)</Typography>
        <Button size="small" variant="outlined" onClick={() => navigate(`/financeiro?paciente=${encodeURIComponent(patient.fullName)}`)}>Abrir financeiro completo</Button>
      </Box>
      {rows.length === 0 ? <Typography color="text.secondary">Nenhum lançamento para este paciente ainda. Use os botões acima para gerar o primeiro financeiro.</Typography> : (
        <Box sx={{ display: "grid", gap: 1 }}>
          {rows.map((r) => {
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
                {open && (
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.25 }}>
                    <Button size="small" variant="contained" onClick={() => setCharging({ id: r.id, description: r.description, personName: patient.fullName, amount: r.amount, dueDate: r.dueDate, phone: patient.phone })}>Gerar boleto / Pix / cartão</Button>
                    <Button size="small" variant="outlined" color="success" onClick={(e) => setMenu({ el: e.currentTarget, row: r })}>Receber agora</Button>
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
      <NewChargeDialog patient={patient} open={Boolean(newMethod)} initialMethod={newMethod || undefined} onClose={() => setNewMethod(null)} onDone={load} />
      <ChargeDialog entry={charging} onClose={() => setCharging(null)} onChanged={load} />
    </Box>
  );
}
