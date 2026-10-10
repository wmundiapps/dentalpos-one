import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Divider, MenuItem, TextField, Typography } from "@mui/material";
import { HrApi, money, type Employee, type Suggestion } from "../../services/HrApi";

const monthNow = () => new Date().toISOString().slice(0, 7);
const TYPES = ["Provento", "Bônus", "Prêmio", "Assiduidade", "Hora extra", "Benefício", "Desconto", "Encargo"];
const DISCOUNT = ["Desconto"];

export default function PayrollTab({ employees }: { employees: Employee[] }) {
  const [ref, setRef] = useState(monthNow());
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof HrApi.payrollEntries>>>([]);
  const [closings, setClosings] = useState<Awaited<ReturnType<typeof HrApi.closings>>>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [form, setForm] = useState({ employeeId: "", type: "Provento", description: "Salário-base", value: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [e, c, s] = await Promise.all([HrApi.payrollEntries(ref), HrApi.closings(), HrApi.suggestions(ref)]);
      setEntries(e); setClosings(c); setSuggestions(s); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao carregar a folha."); }
  }, [ref]);
  useEffect(() => { void load(); }, [load]);

  const add = async (b: { employeeId: string; type: string; description: string; value: number }) => {
    try { await HrApi.addPayroll({ ...b, reference: ref }); await load(); return true; }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível lançar."); return false; }
  };
  const launch = async (s: Suggestion) => { if (await add({ employeeId: s.employeeId, type: s.type, description: s.description, value: s.value })) setNotice("Lançado na folha."); };
  const close = async () => {
    try { await HrApi.closePayroll({ reference: ref }); setNotice("Folha fechada. Líquido e encargos foram enviados ao Contas a Pagar."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível fechar."); }
  };
  const done = new Set(entries.map((e) => e.description));
  const total = entries.reduce((a, e) => a + (DISCOUNT.includes(e.type) ? -Number(e.value) : e.type === "Encargo" ? 0 : Number(e.value)), 0);

  return (
    <Box sx={{ p: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
        <TextField size="small" type="month" label="Mês de referência" value={ref} onChange={(e) => setRef(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Typography sx={{ fontWeight: 800 }}>Líquido lançado: {money(total)}</Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" onClick={() => void close()}>Fechar folha do mês</Button>
      </Box>

      <Typography variant="h6" sx={{ fontWeight: 800 }}>Sugestões a partir do ponto</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Calculadas com faltas, atrasos e horas extras do mês. Confira com a contabilidade antes de lançar (descanso semanal remunerado, acordo de banco de horas e convenção coletiva podem mudar os valores).</Typography>
      {suggestions.length === 0 && <Typography color="text.secondary" sx={{ mb: 2 }}>Sem sugestões neste mês (ou colaboradores sem salário-base cadastrado).</Typography>}
      {suggestions.map((s) => (
        <Box key={s.key} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 4fr 1fr auto" }, gap: 1.5, py: 1, borderTop: "1px solid", borderColor: "divider", alignItems: "center" }}>
          <Typography sx={{ fontWeight: 700 }}>{s.employeeName}</Typography>
          <Typography variant="body2">{s.type} • {s.description}</Typography>
          <Typography>{money(s.value)}</Typography>
          <Button size="small" variant="outlined" disabled={done.has(s.description)} onClick={() => void launch(s)}>{done.has(s.description) ? "Lançado" : "Lançar"}</Button>
        </Box>
      ))}

      <Divider sx={{ my: 3 }} />
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Lançar proventos, bônus, prêmios e descontos</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 3fr 1fr auto" }, gap: 1.5, mb: 2 }}>
        <TextField select size="small" label="Colaborador" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>{employees.filter((e) => e.status !== "TERMINATED").map((e) => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}</TextField>
        <TextField select size="small" label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
        <TextField size="small" label="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <TextField size="small" label="Valor (R$)" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
        <Button variant="contained" disabled={!form.employeeId || !Number(form.value)} onClick={async () => { if (await add({ employeeId: form.employeeId, type: form.type, description: form.description, value: Number(form.value) })) setForm({ ...form, value: "" }); }}>Lançar</Button>
      </Box>
      {entries.map((e) => (
        <Box key={e.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 4fr 1fr" }, gap: 1.5, py: 0.9, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontWeight: 700 }}>{e.employee?.name}</Typography>
          <Typography variant="body2">{e.type} • {e.description}</Typography>
          <Typography color={DISCOUNT.includes(e.type) ? "error.main" : "text.primary"}>{DISCOUNT.includes(e.type) ? "-" : ""}{money(e.value)}</Typography>
        </Box>
      ))}

      <Divider sx={{ my: 3 }} />
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Fechamentos</Typography>
      {closings.length === 0 && <Typography color="text.secondary">Nenhum fechamento ainda.</Typography>}
      {closings.map((c) => (
        <Box key={c.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 3fr 1fr" }, gap: 1.5, py: 0.9, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontWeight: 700 }}>{c.reference}</Typography>
          <Typography variant="body2" color="text.secondary">Bruto {money(c.grossPayroll)} • Descontos {money(c.discounts)} • Encargos {money(c.employerCharges)} • {c.employeeCount} colaborador(es)</Typography>
          <Typography>{money(c.netPayroll)} • {c.status}</Typography>
        </Box>
      ))}
    </Box>
  );
}
