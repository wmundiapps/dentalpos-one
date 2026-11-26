import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, TextField, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { getTreatmentPlan } from "../../services/TreatmentPlanApi";
import { loadClinicalRecord } from "../../services/ClinicalAnamnesisApi";
import { updateBackendPatient, type BackendPatient } from "../../services/PatientApi";
import { printDebtReport, type DebtRow, type ExecutedLine, type PlanLine } from "../../utils/debtReport";
import { errorMessage, toast } from "../../utils/toast";

interface Line { key: number; procedure: string; tooth: string; value: string; executed: boolean; date: string; professional: string }
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dayInput = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) : "");
const toNum = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;
let seq = 1;

const FIELDS: Array<[keyof Debtor, string, number]> = [["fullName", "Nome completo", 2], ["cpf", "CPF", 1], ["rg", "RG", 1], ["phone", "Telefone", 1], ["email", "E-mail", 1], ["address", "Endereço (rua, número, bairro)", 2], ["city", "Cidade", 1], ["state", "UF", 1], ["zipCode", "CEP", 1]];
type Debtor = { fullName: string; cpf: string; rg: string; phone: string; email: string; address: string; city: string; state: string; zipCode: string };

// Antes de emitir o relatório de débitos: confere/edita os dados do paciente e informa os procedimentos do orçamento e o que foi executado (quando não estão no sistema).
export default function DebtReportDialog({ open, patient, overdue, onClose, onPatientSaved }: { open: boolean; patient: BackendPatient; overdue: DebtRow[]; onClose: () => void; onPatientSaved?: (p: BackendPatient) => void }) {
  const [debtor, setDebtor] = useState<Debtor>({ fullName: "", cpf: "", rg: "", phone: "", email: "", address: "", city: "", state: "", zipCode: "" });
  const [saveToRecord, setSaveToRecord] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [registered, setRegistered] = useState<ExecutedLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [interest, setInterest] = useState(false);
  const [fine, setFine] = useState("2");
  const [rate, setRate] = useState("1");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDebtor({ fullName: patient.fullName || "", cpf: patient.cpf || "", rg: patient.rg || "", phone: patient.phone || "", email: patient.email || "", address: patient.address || "", city: patient.city || "", state: patient.state || "", zipCode: patient.zipCode || "" });
    setSaveToRecord(true); setLoaded(false); setLines([]); setRegistered([]);
    Promise.all([getTreatmentPlan(patient.id).catch(() => ({ items: [] })), loadClinicalRecord(patient.id).catch(() => ({ evolutions: [] }))]).then(([tp, rec]) => {
      setLines(tp.items.filter((i) => i.status !== "CANCELLED").map((i) => ({ key: seq++, procedure: i.procedure, tooth: i.tooth ? String(i.tooth) : "", value: String(Number(i.planningData?.unitValue || 0) || ""), executed: i.status === "COMPLETED", date: i.status === "COMPLETED" ? dayInput(i.updatedAt) : "", professional: i.planningData?.professionalName || "" })));
      setRegistered([...rec.evolutions].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((e) => ({ date: e.createdAt, procedure: e.procedure, professional: e.professionalName, notes: e.notes })));
      setLoaded(true);
    });
    // Só reinicia ao abrir ou trocar de paciente (a ficha recarrega e recria o objeto enquanto o diálogo está aberto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patient.id]);

  const set = (k: keyof Debtor) => (e: React.ChangeEvent<HTMLInputElement>) => setDebtor((d) => ({ ...d, [k]: e.target.value }));
  const setLine = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const missing = useMemo(() => FIELDS.filter(([k]) => ["fullName", "cpf", "address", "city", "phone"].includes(k) && !String(debtor[k]).trim()).map(([, l]) => l), [debtor]);
  const cpfDigits = debtor.cpf.replace(/\D/g, "");
  const cpfBad = Boolean(cpfDigits) && cpfDigits.length !== 11 && cpfDigits.length !== 14;
  const execValue = lines.filter((l) => l.executed).reduce((a, l) => a + toNum(l.value), 0);
  const overdueTotal = overdue.reduce((a, r) => a + r.amount, 0);
  const nothing = loaded && registered.length === 0 && !lines.some((l) => l.executed && l.procedure.trim());

  const emit = async () => {
    setBusy(true);
    try {
      const clean = lines.filter((l) => l.procedure.trim());
      const plan: PlanLine[] = clean.map((l) => ({ procedure: l.procedure.trim(), tooth: l.tooth ? Number(l.tooth) || null : null, value: toNum(l.value), executed: l.executed, executedAt: l.executed && l.date ? new Date(`${l.date}T12:00:00`).toISOString() : null, professional: l.professional.trim() || null }));
      const manualExec: ExecutedLine[] = clean.filter((l) => l.executed && l.date).map((l) => ({ date: new Date(`${l.date}T12:00:00`).toISOString(), procedure: l.procedure.trim(), professional: l.professional.trim() || "—", notes: "Informado manualmente na emissão do relatório" }));
      const merged = [...registered, ...manualExec].sort((a, b) => a.date.localeCompare(b.date));
      const edited = { ...patient, ...debtor } as BackendPatient;
      const changed = FIELDS.some(([k]) => String(debtor[k] || "") !== String((patient as unknown as Record<string, unknown>)[k] || ""));
      if (saveToRecord && changed) {
        try { const saved = await updateBackendPatient(patient.id, { fullName: debtor.fullName, phone: debtor.phone, email: debtor.email || undefined, cpf: debtor.cpf || undefined, rg: debtor.rg || undefined, address: debtor.address || undefined, city: debtor.city || undefined, state: debtor.state || undefined, zipCode: debtor.zipCode || undefined }); onPatientSaved?.(saved); toast.success("Dados do paciente atualizados no cadastro."); }
        catch (e) { toast.error(errorMessage(e, "Não foi possível atualizar o cadastro; o relatório usará os dados digitados.")); }
      }
      const ok = await printDebtReport(edited, overdue, { withInterest: interest, finePercent: Number(fine.replace(",", ".")) || 0, monthlyInterestPercent: Number(rate.replace(",", ".")) || 0 }, plan, merged);
      if (!ok) toast.error("O navegador bloqueou a janela. Permita pop-ups para este site."); else onClose();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 900 }}>Relatório de débitos — cartório</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2.5, pt: "12px!important" }}>
        <Typography variant="body2" color="text.secondary">Confira os dados do devedor e os procedimentos antes de emitir. O que você ajustar aqui sai no relatório.</Typography>

        <Box>
          <Typography sx={{ fontWeight: 800, mb: 1 }}>1. Dados do paciente (devedor)</Typography>
          {missing.length > 0 && <Alert severity="warning" sx={{ mb: 1 }}>Faltando: {missing.join(", ")}. O cartório exige esses dados; preencha abaixo.</Alert>}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
            {FIELDS.map(([k, label, span]) => (
              <TextField key={k} size="small" label={label} value={debtor[k]} onChange={set(k)} error={(k === "cpf" && cpfBad) || (!String(debtor[k]).trim() && ["fullName", "cpf", "address", "city"].includes(k))} helperText={k === "cpf" && cpfBad ? "CPF/CNPJ deve ter 11 ou 14 números" : undefined} sx={{ gridColumn: { md: `span ${span}` } }} />
            ))}
          </Box>
          <FormControlLabel sx={{ mt: 0.5 }} control={<Checkbox checked={saveToRecord} onChange={(_, v) => setSaveToRecord(v)} />} label="Salvar essas correções também no cadastro do paciente" />
        </Box>

        <Box>
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>2. Procedimentos do orçamento e o que foi executado</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Só se cobra o que foi executado. Marque “Executado” apenas no que foi realizado e informe a data. {loaded && lines.length > 0 ? "Os procedimentos abaixo vieram do plano de tratamento do paciente; edite se precisar." : ""}</Typography>
          {registered.length > 0 && <Alert severity="info" sx={{ mb: 1 }}>{registered.length} procedimento(s) já registrado(s) no prontuário entram automaticamente no relatório.</Alert>}
          {nothing && <Alert severity="error" sx={{ mb: 1 }}>Não há procedimento executado registrado no sistema para este paciente. Preencha abaixo o que consta no orçamento e o que foi realizado (e guarde o comprovante, como o histórico do Clinicorp).</Alert>}
          {lines.map((l) => (
            <Box key={l.key} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "3fr 70px 110px 100px 140px 2fr 40px" }, gap: 1, alignItems: "center", mb: 1 }}>
              <TextField size="small" label="Procedimento" value={l.procedure} onChange={(e) => setLine(l.key, { procedure: e.target.value })} sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }} />
              <TextField size="small" label="Dente" value={l.tooth} onChange={(e) => setLine(l.key, { tooth: e.target.value.replace(/\D/g, "") })} />
              <TextField size="small" label="Valor (R$)" value={l.value} onChange={(e) => setLine(l.key, { value: e.target.value })} />
              <FormControlLabel control={<Checkbox checked={l.executed} onChange={(_, v) => setLine(l.key, { executed: v, date: v && !l.date ? dayInput(new Date().toISOString()) : l.date })} />} label="Executado" sx={{ m: 0 }} />
              <TextField size="small" type="date" label="Data da execução" value={l.date} disabled={!l.executed} onChange={(e) => setLine(l.key, { date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" label="Profissional" value={l.professional} disabled={!l.executed} onChange={(e) => setLine(l.key, { professional: e.target.value })} />
              <IconButton size="small" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          ))}
          <Button size="small" variant="outlined" onClick={() => setLines((ls) => [...ls, { key: seq++, procedure: "", tooth: "", value: "", executed: false, date: "", professional: "" }])}>+ Adicionar procedimento</Button>
          {lines.length > 0 && <Typography variant="body2" sx={{ mt: 1 }}>Valor dos procedimentos executados: <b>{brl(execValue)}</b> · Valor em atraso: <b>{brl(overdueTotal)}</b></Typography>}
          {execValue > 0 && overdueTotal > execValue && <Alert severity="warning" sx={{ mt: 1 }}>O valor em atraso é maior que o dos procedimentos executados. Confira para cobrar apenas o que foi realizado.</Alert>}
        </Box>

        <Box>
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>3. Multa e juros</Typography>
          <FormControlLabel control={<Checkbox checked={interest} onChange={(_, v) => setInterest(v)} />} label="Incluir multa e juros (valor atualizado)" />
          {interest && <Box sx={{ display: "flex", gap: 2, mt: 0.5 }}><TextField size="small" label="Multa (%)" value={fine} onChange={(e) => setFine(e.target.value)} /><TextField size="small" label="Juros (% ao mês)" value={rate} onChange={(e) => setRate(e.target.value)} /></Box>}
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>Confira com seu advogado ou o cartório os percentuais e documentos exigidos. Os juros aqui são simples, proporcionais aos dias de atraso.</Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>Fechar</Button>
        <Button variant="contained" disabled={busy || !debtor.fullName.trim() || cpfBad} onClick={() => void emit()}>{busy ? "Gerando..." : "Gerar relatório"}</Button>
      </DialogActions>
    </Dialog>
  );
}
