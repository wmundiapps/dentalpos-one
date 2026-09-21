import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, MenuItem, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { deactivateRecurringBill, frequencyLabels, listRecurringBills, loadDebtors, loadForecast, loadReminders, updateRecurringBill, type Debtors, type Forecast, type RecurringBill, type Reminders } from "../services/FinancialPlanningApi";

const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const brDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "-");
const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }); };

export default function FinancialPlanningPanel({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [months, setMonths] = useState(6);
  const [reminders, setReminders] = useState<Reminders | null>(null);
  const [debtors, setDebtors] = useState<Debtors | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const [r, d, f, b] = await Promise.all([loadReminders(), loadDebtors(), loadForecast(months), listRecurringBills()]);
      setReminders(r); setDebtors(d); setForecast(f); setBills(b);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar o planejamento financeiro."); }
  };
  useEffect(() => { void load(); }, [reloadKey, months]);

  const goTo = (text: string) => navigate(`/financeiro?paciente=${encodeURIComponent(text)}`);
  const editAmount = async (b: RecurringBill) => {
    const raw = window.prompt(`Novo valor para ${b.description} (as contas futuras em aberto ser\u00e3o atualizadas):`, String(b.amount).replace(".", ","));
    if (!raw) return;
    const n = Number(raw.replace(/\./g, "").replace(",", "."));
    if (!(n > 0)) { setError("Valor inv\u00e1lido."); return; }
    try { await updateRecurringBill(b.id, { amount: n }); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar."); }
  };
  const toggleAuto = async (b: RecurringBill) => {
    try { await updateRecurringBill(b.id, { autoDebit: !b.autoDebit }); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar."); }
  };
  const endBill = async (b: RecurringBill) => {
    if (!window.confirm(`Encerrar a recorr\u00eancia de ${b.description}? A conta deste m\u00eas continua no relat\u00f3rio; as dos pr\u00f3ximos meses em aberto s\u00e3o canceladas.`)) return;
    try { await deactivateRecurringBill(b.id); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Erro ao encerrar."); }
  };

  const high = reminders?.high || 0;
  return (
    <Paper variant="outlined" sx={{ mb: 2, borderRadius: 3, overflow: "hidden" }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: "1px solid", borderColor: "divider", px: 1 }}>
        <Tab label={`Lembretes (${reminders?.total ?? 0})`} sx={{ color: high ? "error.main" : undefined, fontWeight: high ? 800 : undefined }} />
        <Tab label={`Quem est\u00e1 devendo (${debtors?.debtors ?? 0})`} />
        <Tab label={"Previs\u00e3o"} />
        <Tab label={`Contas recorrentes (${bills.filter((b) => b.isActive).length})`} />
      </Tabs>
      {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

      {tab === 0 && <Box sx={{ p: 2 }}>
        {!reminders ? <Typography color="text.secondary">Carregando...</Typography>
          : reminders.items.length === 0 ? <Alert severity="success">{"Nenhuma pend\u00eancia: as contas do m\u00eas est\u00e3o lan\u00e7adas e em dia."}</Alert>
          : <Box sx={{ display: "grid", gap: 1 }}>{reminders.items.map((r, i) => (
            <Alert key={i} severity={r.severity === "HIGH" ? "error" : "warning"} action={<Button color="inherit" size="small" onClick={() => goTo(r.detail.split(" - ")[0])}>Ver</Button>}>
              <b>{r.title}</b>{` \u2014 ${r.detail} \u2022 ${money(r.amount)} \u2022 venc. ${brDate(r.dueDate)}`}
            </Alert>))}</Box>}
      </Box>}

      {tab === 1 && <Box sx={{ p: 2 }}>
        {!debtors ? <Typography color="text.secondary">Carregando...</Typography>
          : debtors.list.length === 0 ? <Alert severity="success">{"Nenhum paciente com parcela vencida."}</Alert>
          : <>
            <Typography sx={{ mb: 1, fontWeight: 800 }}>{`Total vencido: ${money(debtors.totalOverdue)} \u2022 ${debtors.debtors} devedor(es)`}</Typography>
            {debtors.list.map((d) => {
              const digits = (d.phone || "").replace(/\D/g, "");
              const wa = digits ? `https://wa.me/${digits.length <= 11 ? "55" + digits : digits}?text=${encodeURIComponent(`Ol\u00e1, ${d.name}! Consta em aberto na cl\u00ednica o valor de ${money(d.total)}. Podemos ajudar com a regulariza\u00e7\u00e3o?`)}` : "";
              return (
                <Box key={d.key} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr auto" }, gap: 1, py: 1.25, borderBottom: "1px solid", borderColor: "divider", alignItems: "center" }}>
                  <Box><Typography sx={{ fontWeight: 800 }}>{d.name}</Typography><Typography variant="body2" color="text.secondary">{`${d.count} parcela(s) \u2022 mais antiga ${brDate(d.oldestDueDate)}${d.phone ? ` \u2022 ${d.phone}` : ""}`}</Typography></Box>
                  <Typography sx={{ fontWeight: 800 }} color="error.main">{money(d.total)}</Typography>
                  <Chip size="small" color={d.daysOverdue > 60 ? "error" : d.daysOverdue > 30 ? "warning" : "default"} label={`${d.daysOverdue} dia(s) de atraso`} />
                  <Box sx={{ display: "flex", gap: 0.5 }}><Button size="small" onClick={() => goTo(d.name)}>{"Lan\u00e7amentos"}</Button>{wa && <Button size="small" href={wa} target="_blank" rel="noopener">WhatsApp</Button>}</Box>
                </Box>);
            })}
          </>}
      </Box>}

      {tab === 2 && <Box sx={{ p: 2 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1, flexWrap: "wrap" }}>
          <TextField select size="small" label="Horizonte" value={months} onChange={(e) => setMonths(Number(e.target.value))} sx={{ width: 160 }}>{[3, 6, 12].map((m) => <MenuItem key={m} value={m}>{`${m} meses`}</MenuItem>)}</TextField>
          <Typography variant="caption" color="text.secondary">{forecast ? `Inclui lan\u00e7amentos em aberto, contas recorrentes e estimativa pela ${forecast.basis.toLowerCase()}. Passe o mouse no valor para ver a composi\u00e7\u00e3o.` : ""}</Typography>
        </Box>
        {!forecast ? <Typography color="text.secondary">Carregando...</Typography> :
          <Box sx={{ overflowX: "auto" }}>
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { p: 1, borderBottom: "1px solid", borderColor: "divider", textAlign: "right", whiteSpace: "nowrap" }, "& td:first-of-type, & th:first-of-type": { textAlign: "left" } }}>
              <thead><tr><th>{"M\u00eas"}</th><th>Receitas previstas</th><th>Despesas previstas</th><th>Saldo do m\u00eas</th><th>Saldo acumulado</th></tr></thead>
              <tbody>{(() => { let acc = 0; return forecast.rows.map((r) => { acc += r.balance; return (
                <tr key={r.month}>
                  <td>{monthLabel(r.month)}</td>
                  <td title={`Recebido ${money(r.income.realized)} \u2022 em aberto ${money(r.income.open)} \u2022 recorrente ${money(r.income.recurring)} \u2022 estimado ${money(r.income.estimated)}`}>{money(r.income.total)}</td>
                  <td title={`Pago ${money(r.expense.realized)} \u2022 em aberto ${money(r.expense.open)} \u2022 recorrente ${money(r.expense.recurring)} \u2022 estimado ${money(r.expense.estimated)}`}>{money(r.expense.total)}</td>
                  <td style={{ color: r.balance < 0 ? "#d32f2f" : "#2e7d32", fontWeight: 800 }}>{money(r.balance)}</td>
                  <td style={{ color: acc < 0 ? "#d32f2f" : undefined }}>{money(acc)}</td>
                </tr>); }); })()}</tbody>
            </Box>
          </Box>}
      </Box>}

      {tab === 3 && <Box sx={{ p: 2 }}>
        {bills.length === 0 ? <Alert severity="info">{"Nenhuma conta recorrente. Em \u201cNovo lan\u00e7amento\u201d, marque \u201cConta recorrente\u201d para cadastrar aluguel, energia, sistemas etc."}</Alert>
          : bills.map((b) => (
            <Box key={b.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr auto" }, gap: 1, py: 1.25, borderBottom: "1px solid", borderColor: "divider", alignItems: "center", opacity: b.isActive ? 1 : 0.55 }}>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>{b.description}</Typography>
                <Typography variant="body2" color="text.secondary">{`${b.personName} \u2022 ${frequencyLabels[b.frequency] || b.frequency} \u2022 dia ${b.dueDay}${b.occurrences ? ` \u2022 ${b.occurrences} vez(es)` : " \u2022 sem fim"}${b.endDate ? ` \u2022 at\u00e9 ${brDate(b.endDate)}` : ""}`}</Typography>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>{b.autoDebit && <Chip size="small" label={"D\u00e9bito autom\u00e1tico"} />}{b.amountIsVariable && <Chip size="small" variant="outlined" label={"Valor vari\u00e1vel"} />}{!b.isActive && <Chip size="small" label="Encerrada" />}</Box>
              </Box>
              <Typography sx={{ fontWeight: 800 }} color={b.type === "INCOME" ? "success.main" : "error.main"}>{money(b.amount)}</Typography>
              <Typography variant="body2" color="text.secondary">{b.type === "INCOME" ? "Receita" : "Despesa"}</Typography>
              {b.isActive ? <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                <Button size="small" onClick={() => void editAmount(b)}>Alterar valor</Button>
                <Button size="small" onClick={() => void toggleAuto(b)}>{b.autoDebit ? "Tirar d\u00e9bito autom." : "D\u00e9bito autom."}</Button>
                <Button size="small" color="inherit" onClick={() => void endBill(b)}>Encerrar</Button>
              </Box> : <span />}
            </Box>))}
      </Box>}
    </Paper>
  );
}