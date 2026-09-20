import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, LinearProgress, MenuItem, Paper, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PageHeader from "../components/PageHeader";
import { loadBackendPatients, type BackendPatient } from "../services/PatientApi";
import { createTreatmentItem, getTreatmentPlan, importOdontogram, updateTreatmentItem, type TreatmentPlanItem } from "../services/TreatmentPlanApi";
import { approveBudget, cancelBudget, createBudget, listBudgets, type BudgetRow } from "../services/BudgetApi";
import { createClinicalDocument } from "../services/ClinicalDocumentService";
import { readSessionUser } from "../services/DemoAccess";
import { formatBRL, money, parseBRL } from "../utils/money";

type BudgetExtra = BudgetRow & { entryAmount?: number; paymentMethod?: string; discountPercent?: number; validUntil?: string; optionsJson?: { treatmentItemIds?: unknown } | null };
type Planning = Record<string, unknown>;

const ITEM_STATUS: Record<string, string> = { PLANNED: "Planejado", APPROVED: "Aprovado", IN_PROGRESS: "Em andamento", COMPLETED: "Concluído", CANCELLED: "Cancelado" };
const PRIORITY: Record<string, string> = { URGENT: "Urgente", HIGH: "Alta", NORMAL: "Normal", LOW: "Baixa" };
const BUDGET_STATUS: Record<string, string> = { PENDING: "Pendente", APPROVED: "Aprovado", CANCELLED: "Cancelado", REJECTED: "Recusado", EXPIRED: "Vencido" };
const PAYMENT_METHODS = ["PIX", "Cartão", "Boleto", "Transferência", "Dinheiro", "Promissória", "Cheque"];
const EMPTY_ITEM = { procedure: "", tooth: "", region: "", phase: "1", priority: "NORMAL", specialty: "", professionalName: "", estimatedMinutes: 60, unitValue: "", laboratoryRequired: false, status: "PLANNED" };
const EMPTY_TERMS = { discountPercent: "0", entryAmount: "", installments: "1", paymentMethod: "PIX", validDays: "30" };
const txt = (v: unknown) => (v === undefined || v === null ? "" : String(v));

function buildContract(p: BackendPatient | undefined, b: BudgetExtra, list: TreatmentPlanItem[], professional: string) {
  const pa = (p || {}) as BackendPatient & { address?: string | null; city?: string | null; state?: string | null };
  const ident = [pa.fullName || "Paciente", pa.cpf ? `CPF ${pa.cpf}` : "", pa.phone ? `telefone ${pa.phone}` : "", [pa.address, pa.city, pa.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const lines = list.map((i) => {
    const pd = (i.planningData || {}) as Planning;
    return `- ${i.procedure}${i.tooth ? ` (dente ${i.tooth})` : ""}${pd.region ? ` — ${txt(pd.region)}` : ""}: ${money(Number(pd.unitValue || 0))}`;
  });
  const entry = Number(b.entryAmount || 0);
  const disc = Number(b.discountPercent || 0);
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  return [
    "CONTRATO DE PRESTAÇÃO DE SERVIÇOS ODONTOLÓGICOS",
    "",
    `CONTRATANTE (PACIENTE): ${ident}.`,
    `CONTRATADA: a clínica responsável por este atendimento, representada pelo(a) profissional ${professional}.`,
    "",
    "1. OBJETO",
    "A CONTRATADA prestará ao CONTRATANTE os procedimentos abaixo, conforme o plano de tratamento apresentado e aprovado:",
    ...(lines.length ? lines : [`- Conforme o orçamento: ${b.description}`]),
    "",
    "2. VALOR E FORMA DE PAGAMENTO",
    `Valor total: ${money(b.totalAmount)}${disc > 0 ? ` (com desconto de ${disc.toLocaleString("pt-BR")}%)` : ""}.`,
    entry > 0 ? `Entrada: ${money(entry)}.` : "Sem entrada.",
    `Saldo: ${b.installments}x de ${money(b.installmentValue)}${b.paymentMethod ? `, via ${b.paymentMethod}` : ""}.`,
    "O atraso no pagamento poderá ser cobrado com os acréscimos permitidos em lei.",
    "",
    "3. OBRIGAÇÕES DO CONTRATANTE",
    "Comparecer às consultas agendadas, seguir as orientações clínicas, informar alterações de saúde e de medicamentos e efetuar os pagamentos nas datas combinadas.",
    "",
    "4. OBRIGAÇÕES DA CONTRATADA",
    "Executar os procedimentos com técnica adequada, manter o prontuário atualizado, esclarecer dúvidas e informar riscos, alternativas e cuidados de cada etapa.",
    "",
    "5. FALTAS E REMARCAÇÕES",
    "Faltas e remarcações devem ser comunicadas com antecedência mínima de 24 horas. Faltas sem aviso podem alterar o cronograma do tratamento.",
    "",
    "6. RESULTADOS E ALTERAÇÕES DO PLANO",
    "O resultado depende também da resposta biológica e da colaboração do CONTRATANTE. Qualquer alteração no plano ou nos valores será apresentada previamente e só será executada com a concordância do CONTRATANTE.",
    "",
    "7. RESCISÃO",
    "Qualquer das partes pode rescindir este contrato mediante aviso, ficando devidos os procedimentos já realizados.",
    "",
    "8. PROTEÇÃO DE DADOS",
    "Os dados pessoais e de saúde do CONTRATANTE são tratados conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), exclusivamente para a prestação dos serviços e o cumprimento de obrigações legais.",
    "",
    "9. FORO",
    "Fica eleito o foro do domicílio do CONTRATANTE.",
    "",
    `${pa.city ? `${pa.city}, ` : ""}${today}.`,
    "",
    "______________________________________",
    `CONTRATANTE: ${pa.fullName || ""}`,
    "",
    "______________________________________",
    `CONTRATADA: ${professional}`,
  ].join("\n");
}

export default function TreatmentPlanning({ initialPatientId }: { initialPatientId?: string } = {}) {
  const [searchParams] = useSearchParams();
  const user = readSessionUser();
  const sessionName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "";
  const [patients, setPatients] = useState<BackendPatient[]>([]);
  const [patientId, setPatientId] = useState(initialPatientId || searchParams.get("patientId") || "");
  const [items, setItems] = useState<TreatmentPlanItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [terms, setTerms] = useState(EMPTY_TERMS);

  const patient = patients.find((p) => p.id === patientId);
  const activeItems = useMemo(() => items.filter((i) => i.status !== "CANCELLED"), [items]);
  const total = useMemo(() => activeItems.reduce((s, i) => s + Number(((i.planningData || {}) as Planning).unitValue || 0), 0), [activeItems]);
  const discount = Math.min(100, Math.max(0, Number(terms.discountPercent.replace(",", ".")) || 0));
  const finalTotal = Math.round(total * (1 - discount / 100) * 100) / 100;
  const entry = Math.min(finalTotal, parseBRL(terms.entryAmount) || 0);
  const installments = Math.max(1, Number(terms.installments) || 1);
  const installmentValue = Math.round(((finalTotal - entry) / installments) * 100) / 100;

  async function refresh(id = patientId) {
    if (!id) { setItems([]); setProgress(0); setBudgets([]); return; }
    try {
      const r = await getTreatmentPlan(id);
      setItems(r.items);
      setProgress(r.progressPercent);
      setBudgets((await listBudgets()).filter((b) => b.patientId === id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar o plano.");
    }
  }

  useEffect(() => {
    loadBackendPatients().then(setPatients).catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar pacientes."));
  }, []);
  useEffect(() => { void refresh(patientId); }, [patientId]);

  async function run(action: () => Promise<unknown>, okMessage?: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await action();
      const text = typeof result === "string" ? result : okMessage;
      if (text) setNotice(text);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  const openItem = () => { setForm((f) => ({ ...f, professionalName: f.professionalName || sessionName })); setOpen(true); };

  const saveItem = () => run(async () => {
    await createTreatmentItem(patientId, { ...form, unitValue: parseBRL(form.unitValue) || 0 });
    setOpen(false);
    setForm({ ...EMPTY_ITEM, professionalName: form.professionalName, specialty: form.specialty, phase: form.phase });
  }, "Procedimento adicionado ao plano.");

  const importFromOdontogram = () => run(async () => {
    const r = await importOdontogram(patientId);
    return r.imported ? `${r.imported} procedimento(s) importado(s) do odontograma.` : "Nenhum achado novo para importar do odontograma.";
  });

  const createProposal = () => run(async () => {
    const valid = new Date();
    valid.setDate(valid.getDate() + (Number(terms.validDays) || 30));
    await createBudget({
      patientId,
      description: `Plano de tratamento • ${patient?.fullName || "Paciente"}`,
      totalAmount: finalTotal,
      installments,
      installmentValue,
      discountPercent: discount,
      entryAmount: entry,
      monthlyRatePercent: 0,
      paymentMethod: terms.paymentMethod,
      paymentProvider: "MANUAL",
      validUntil: valid.toISOString(),
      optionsJson: { treatmentItemIds: activeItems.map((i) => i.id), grossTotal: total, versioned: true },
    });
    setBudgetOpen(false);
    setTerms(EMPTY_TERMS);
  }, "Orçamento gerado.");

  const generateContract = (row: BudgetRow) => run(async () => {
    const b = row as BudgetExtra;
    const ids = Array.isArray(b.optionsJson?.treatmentItemIds) ? (b.optionsJson?.treatmentItemIds as string[]) : [];
    const list = ids.length ? items.filter((i) => ids.includes(i.id)) : activeItems;
    const professional = sessionName || "Profissional responsável";
    await createClinicalDocument({
      patientId: b.patientId,
      professionalName: professional,
      documentType: "CLINICAL_CONTRACT",
      title: `Contrato • ${patient?.fullName || "Paciente"}`,
      content: buildContract(patient, b, list, professional),
      templateId: undefined,
      status: "DRAFT",
    });
    return "Contrato gerado como rascunho na aba Documentos e Contratos. Revise o texto com a assessoria jurídica da clínica antes de emitir.";
  });

  return (
    <Box>
      <PageHeader title={"Plano de Tratamento e Orçamento"} description={"Procedimentos por dente e região, orçamento com condições de pagamento e contrato do paciente."} actionLabel="Novo procedimento" actionIcon={<AddIcon />} onAction={() => { if (patientId) openItem(); }} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}
      {!initialPatientId && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <TextField select fullWidth label="Paciente" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            {patients.map((p) => <MenuItem key={p.id} value={p.id}>{p.fullName}</MenuItem>)}
          </TextField>
        </Paper>
      )}
      {!patientId ? (
        <Alert severity="info">Selecione um paciente para montar o plano.</Alert>
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>{`Execução do tratamento: ${progress}%`}</Typography>
                <Typography variant="body2" color="text.secondary">{`${activeItems.length} procedimento(s) • Total ${money(total)}`}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button variant="outlined" startIcon={<AddIcon />} disabled={busy} onClick={openItem}>Novo procedimento</Button>
                <Button disabled={busy} onClick={() => void importFromOdontogram()}>Importar odontograma</Button>
                <Button variant="contained" disabled={busy || !activeItems.length} onClick={() => setBudgetOpen(true)}>{"Gerar orçamento"}</Button>
              </Box>
            </Box>
            <LinearProgress variant="determinate" value={progress} sx={{ mt: 1 }} />
          </Paper>

          {items.length === 0 && <Alert severity="info" sx={{ mb: 2 }}>{"Nenhum procedimento ainda. Use “Novo procedimento” ou “Importar odontograma”."}</Alert>}
          {items.map((i) => {
            const pd = (i.planningData || {}) as Planning;
            const info = [i.tooth ? `Dente ${i.tooth}` : "", txt(pd.region), `Fase ${txt(pd.phase) || "1"}`, PRIORITY[txt(pd.priority) || "NORMAL"] || txt(pd.priority), txt(pd.specialty), txt(pd.professionalName), money(Number(pd.unitValue || 0))].filter(Boolean).join(" • ");
            return (
              <Paper key={i.id} variant="outlined" sx={{ p: 2, mb: 1, opacity: i.status === "CANCELLED" ? 0.6 : 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800 }}>{i.procedure}</Typography>
                    <Typography variant="body2" color="text.secondary">{info}</Typography>
                  </Box>
                  <TextField select size="small" label="Status" value={i.status} disabled={busy} onChange={(e) => void run(() => updateTreatmentItem(i.id, { status: e.target.value, planningData: i.planningData }), "Status atualizado.")} sx={{ minWidth: 170 }}>
                    {Object.entries(ITEM_STATUS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                  </TextField>
                </Box>
              </Paper>
            );
          })}

          <Typography variant="h6" sx={{ mt: 3, mb: 1, fontWeight: 800 }}>{"Orçamentos"}</Typography>
          {budgets.length === 0 ? (
            <Typography color="text.secondary">{"Nenhum orçamento para este paciente."}</Typography>
          ) : budgets.map((row) => {
            const b = row as BudgetExtra;
            const details = [money(b.totalAmount), b.entryAmount ? `entrada ${money(b.entryAmount)}` : "", `${b.installments}x de ${money(b.installmentValue)}`, b.paymentMethod || "", b.validUntil ? `válido até ${new Date(b.validUntil).toLocaleDateString("pt-BR")}` : ""].filter(Boolean).join(" • ");
            return (
              <Paper key={b.id} variant="outlined" sx={{ p: 2, mb: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800 }}>{b.description}</Typography>
                    <Typography variant="body2" color="text.secondary">{details}</Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Chip size="small" label={BUDGET_STATUS[b.status] || b.status} color={b.status === "APPROVED" ? "success" : b.status === "CANCELLED" ? "default" : "warning"} />
                    {b.status !== "APPROVED" && b.status !== "CANCELLED" && <Button size="small" variant="contained" color="success" disabled={busy} onClick={() => void run(() => approveBudget(b.id), "Orçamento aprovado.")}>Aprovar</Button>}
                    {b.status !== "CANCELLED" && <Button size="small" disabled={busy} onClick={() => void generateContract(b)}>Gerar contrato</Button>}
                    {b.status !== "CANCELLED" && <Button size="small" color="error" disabled={busy} onClick={() => { if (window.confirm("Cancelar este orçamento?")) void run(() => cancelBudget(b.id), "Orçamento cancelado."); }}>Cancelar</Button>}
                  </Box>
                </Box>
              </Paper>
            );
          })}
        </>
      )}

      <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} maxWidth="md" fullWidth>
        <DialogTitle>Novo procedimento</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr" }, gap: 2 }}>
            <TextField required label="Procedimento" value={form.procedure} onChange={(e) => setForm({ ...form, procedure: e.target.value })} />
            <TextField label="Dente (FDI)" value={form.tooth} onChange={(e) => setForm({ ...form, tooth: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
            <TextField label={"Região"} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
            <TextField label="Fase" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} />
            <TextField select label="Prioridade" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {Object.entries(PRIORITY).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
            <TextField label="Especialidade" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
            <TextField label="Profissional" value={form.professionalName} onChange={(e) => setForm({ ...form, professionalName: e.target.value })} />
            <TextField type="number" label={"Duração (min)"} value={form.estimatedMinutes} onChange={(e) => setForm({ ...form, estimatedMinutes: Number(e.target.value) })} />
            <TextField label="Valor (R$)" placeholder="Ex.: 1.250,90" value={form.unitValue} onChange={(e) => setForm({ ...form, unitValue: e.target.value.replace(/[^\d.,]/g, "") })} onBlur={() => setForm((f) => ({ ...f, unitValue: formatBRL(f.unitValue) }))} slotProps={{ htmlInput: { inputMode: "decimal" }, input: { startAdornment: <InputAdornment position="start">R$</InputAdornment> } }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || !patientId || !form.procedure.trim()} onClick={() => void saveItem()}>Salvar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={budgetOpen} onClose={() => { if (!busy) setBudgetOpen(false); }} maxWidth="sm" fullWidth>
        <DialogTitle>{"Gerar orçamento"}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <Typography>{`Soma dos procedimentos: ${money(total)}`}</Typography>
          {total <= 0 && <Alert severity="warning">{"Informe o valor dos procedimentos para gerar o orçamento."}</Alert>}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            <TextField label="Desconto (%)" value={terms.discountPercent} onChange={(e) => setTerms({ ...terms, discountPercent: e.target.value.replace(/[^\d.,]/g, "") })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            <TextField label="Entrada (R$)" placeholder="0,00" value={terms.entryAmount} onChange={(e) => setTerms({ ...terms, entryAmount: e.target.value.replace(/[^\d.,]/g, "") })} onBlur={() => setTerms((t) => ({ ...t, entryAmount: formatBRL(t.entryAmount) }))} slotProps={{ htmlInput: { inputMode: "decimal" }, input: { startAdornment: <InputAdornment position="start">R$</InputAdornment> } }} />
            <TextField select label="Parcelas" value={terms.installments} onChange={(e) => setTerms({ ...terms, installments: e.target.value })}>
              {Array.from({ length: 24 }, (_, k) => String(k + 1)).map((n) => <MenuItem key={n} value={n}>{`${n}x`}</MenuItem>)}
            </TextField>
            <TextField select label="Forma de pagamento" value={terms.paymentMethod} onChange={(e) => setTerms({ ...terms, paymentMethod: e.target.value })}>
              {PAYMENT_METHODS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </TextField>
            <TextField select label="Validade" value={terms.validDays} onChange={(e) => setTerms({ ...terms, validDays: e.target.value })}>
              {["7", "15", "30", "60", "90"].map((d) => <MenuItem key={d} value={d}>{`${d} dias`}</MenuItem>)}
            </TextField>
          </Box>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography sx={{ fontWeight: 800 }}>{`Total: ${money(finalTotal)}`}</Typography>
            <Typography variant="body2">{`Entrada: ${money(entry)} • Saldo: ${installments}x de ${money(installmentValue)}`}</Typography>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setBudgetOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || finalTotal <= 0} onClick={() => void createProposal()}>{busy ? "Gerando..." : "Gerar orçamento"}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}