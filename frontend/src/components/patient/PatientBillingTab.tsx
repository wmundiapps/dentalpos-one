import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import { loadFinancialEntries, type FinancialEntry } from "../../services/FinancialApi";
import type { BackendPatient } from "../../services/PatientApi";

type Row = FinancialEntry & { fiscalDocumentType?: string | null; documentNumber?: string | null };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

function situation(r: Row): { label: string; color: "success" | "error" | "warning" | "default" } {
  if (r.status === "PAID") return { label: "Pago", color: "success" };
  if (r.status === "CANCELLED") return { label: "Cancelado", color: "default" };
  return new Date(r.dueDate).getTime() < Date.now() - 86400000 ? { label: "Atrasado", color: "error" } : { label: "A vencer", color: "warning" };
}

// Aba 2 do caderno: cobrança do paciente (pagador, recibo/nota fiscal, pago ou atrasado).
export default function PatientBillingTab({ patient }: { patient: BackendPatient }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    loadFinancialEntries()
      .then((all) => { if (active) setRows((all as Row[]).filter((r) => r.patientId === patient.id && r.type === "INCOME").sort((a, b) => b.dueDate.localeCompare(a.dueDate))); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Erro ao carregar a cobrança."); });
    return () => { active = false; };
  }, [patient.id]);

  const totals = useMemo(() => {
    const t = { paid: 0, overdue: 0, open: 0 };
    for (const r of rows || []) {
      const s = situation(r).label;
      if (s === "Pago") t.paid += r.amount; else if (s === "Atrasado") t.overdue += r.amount; else if (s === "A vencer") t.open += r.amount;
    }
    return t;
  }, [rows]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <Box sx={{ display: "grid", placeItems: "center", minHeight: 200 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Cobrança</Typography>
        <Button variant="outlined" onClick={() => navigate(`/financeiro?paciente=${encodeURIComponent(patient.fullName)}`)}>Abrir financeiro completo</Button>
      </Box>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="body2" color="text.secondary">Responsável pelo pagamento</Typography>
        <Typography sx={{ fontWeight: 800 }}>{`Pessoa física — ${patient.fullName}${patient.cpf ? ` (CPF ${patient.cpf})` : ""}`}</Typography>
        <Typography variant="caption" color="text.secondary">Quando o pagador for outra pessoa ou uma empresa (pessoa jurídica), o nome dele aparece em cada lançamento abaixo.</Typography>
      </Paper>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" }, gap: 2 }}>
        {([["Pago", totals.paid, "success.main"], ["Atrasado", totals.overdue, "error.main"], ["A vencer", totals.open, "warning.main"]] as const).map(([t, v, c]) => (
          <Paper key={t} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="body2" color="text.secondary">{t}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, color: c }}>{brl(v)}</Typography>
          </Paper>
        ))}
      </Box>
      {rows.length === 0 ? <Typography color="text.secondary">Nenhuma cobrança lançada para este paciente.</Typography> : (
        <Box sx={{ display: "grid", gap: 1 }}>
          {rows.map((r) => {
            const s = situation(r);
            const pj = r.personName && r.personName.trim().toLowerCase() !== patient.fullName.trim().toLowerCase();
            return (
              <Paper key={r.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800 }}>{r.description}{r.installments && r.installments > 1 ? ` (${r.installment || 1}/${r.installments})` : ""}</Typography>
                    <Typography variant="body2" color="text.secondary">Vencimento {day(r.dueDate)} • {brl(r.amount)}{r.paymentMethod ? ` • ${r.paymentMethod}` : ""}{r.paidAt ? ` • pago em ${day(r.paidAt)}` : ""}</Typography>
                    <Typography variant="body2" color="text.secondary">Pagador: {pj ? `${r.personName} (terceiro/empresa)` : "o próprio paciente (pessoa física)"}</Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <Chip size="small" color={s.color} label={s.label} />
                    <Chip size="small" variant="outlined" label={r.paymentReceipt ? "Recibo emitido" : "Sem recibo"} />
                    <Chip size="small" variant="outlined" label={r.documentNumber ? `${r.fiscalDocumentType || "Nota fiscal"} nº ${r.documentNumber}` : "Sem nota fiscal"} />
                  </Box>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
