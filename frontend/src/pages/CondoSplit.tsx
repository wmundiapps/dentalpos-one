import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, IconButton, InputAdornment, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import PageHeader from "../components/PageHeader";
import { type CondoMonth, loadCondoSplit, saveCondoSplit } from "../services/CondoSplitApi";

const ITEMS: [string, string][] = [["agua", "Água"], ["luz", "Luz"], ["telefone", "Telefone"], ["internet", "Internet"], ["iptu", "IPTU"], ["condominio", "Condomínio do prédio"], ["limpeza", "Material de limpeza"], ["contador", "Contador"], ["sindico", "Síndico"], ["fundoReserva", "Fundo de reserva"], ["bancarios", "Gastos bancários"], ["consertos", "Consertos"], ["outros", "Outros"]];
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Aceita "1.250,90", "1250,90" e "1250.90" (ponto como decimal quando há no máximo 2 casas).
const toNum = (raw: string) => {
  const t = raw.trim();
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, "");
  const n = Number(norm);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const show = (n: number) => (n ? String(n).replace(".", ",") : "");
const empty = (): CondoMonth => ({ employees: [], encargosPct: 0, items: {}, outrosDesc: "", condominos: 0 });
// Campo de valor: guarda o texto como a pessoa digita (vírgula e casas decimais) e só entrega o número ao formulário.
function MoneyField({ value, onChange, ...rest }: { value: number; onChange: (n: number) => void } & Omit<React.ComponentProps<typeof TextField>, "value" | "onChange">) {
  const [text, setText] = useState(show(value));
  useEffect(() => { if (toNum(text) !== value) setText(show(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <TextField {...rest} value={text} onChange={(e) => { const t = e.target.value.replace(/[^\d.,]/g, ""); setText(t); onChange(toNum(t)); }} onBlur={() => setText(show(value))} />;
}
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function CondoSplit() {
  const [months, setMonths] = useState<Record<string, CondoMonth>>({});
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<CondoMonth>(empty());
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { loadCondoSplit().then((m) => { setMonths(m); setLoaded(true); }).catch((e) => { setError(e instanceof Error ? e.message : "Não foi possível carregar."); setLoaded(true); }); }, []);
  useEffect(() => {
    if (!loaded) return;
    const saved = months[month];
    if (saved) { setData({ ...empty(), ...saved }); return; }
    const previous = Object.keys(months).filter((k) => k < month).sort().pop();
    setData(previous ? { ...months[previous] } : empty());
  }, [month, loaded, months]);

  const calc = useMemo(() => {
    const folha = data.employees.reduce((s, e) => s + (e.salary || 0), 0);
    const decimo = folha / 12;
    const ferias = (folha / 12) * (4 / 3);
    const encargos = ((folha + decimo + ferias) * (data.encargosPct || 0)) / 100;
    const fixas = ITEMS.reduce((s, [k]) => s + (data.items[k] || 0), 0);
    const total = folha + decimo + ferias + encargos + fixas;
    return { folha, decimo, ferias, encargos, fixas, total, each: data.condominos > 0 ? total / data.condominos : 0 };
  }, [data]);

    const setEmp = (i: number, patch: Partial<{ name: string; salary: number }>) => setData((d) => ({ ...d, employees: d.employees.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));

  const save = async () => {
    setBusy(true); setError(""); setMsg("");
    try { await saveCondoSplit(month, data); setMonths((m) => ({ ...m, [month]: data })); setMsg("Rateio salvo."); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  };

  const money = (label: string, value: number, bold = false) => <TableRow><TableCell sx={{ fontWeight: bold ? 800 : 400 }}>{label}</TableCell><TableCell align="right" sx={{ fontWeight: bold ? 800 : 400 }}>{brl(value)}</TableCell></TableRow>;

  return (
    <Box>
      <PageHeader title="Rateio do condomínio" description="Lance as despesas do mês e o número de condôminos. O sistema calcula 13º, férias, encargos e quanto cada um paga." />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {msg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMsg("")}>{msg}</Alert>}

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField type="month" label="Mês" size="small" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="Número de condôminos" size="small" value={data.condominos || ""} onChange={(e) => setData({ ...data, condominos: Math.max(0, Math.round(Number(e.target.value.replace(/\D/g, "")) || 0)) })} slotProps={{ htmlInput: { inputMode: "numeric" } }} sx={{ width: 220 }} />
        {!months[month] && Object.keys(months).length > 0 && <Typography variant="body2" color="text.secondary">Valores copiados do mês anterior. Ajuste e salve.</Typography>}
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Funcionários</Typography>
        <Table size="small">
          <TableHead><TableRow><TableCell>Nome</TableCell><TableCell align="right" sx={{ width: 220 }}>Salário (R$)</TableCell><TableCell sx={{ width: 56 }} /></TableRow></TableHead>
          <TableBody>
            {data.employees.map((e, i) => (
              <TableRow key={i}>
                <TableCell><TextField size="small" fullWidth value={e.name} onChange={(ev) => setEmp(i, { name: ev.target.value })} placeholder="Nome do funcionário" /></TableCell>
                <TableCell align="right"><MoneyField size="small" value={e.salary} onChange={(n) => setEmp(i, { salary: n })} slotProps={{ input: { startAdornment: <InputAdornment position="start">R$</InputAdornment> }, htmlInput: { inputMode: "decimal" } }} /></TableCell>
                <TableCell><IconButton aria-label="Remover funcionário" onClick={() => setData((d) => ({ ...d, employees: d.employees.filter((_, j) => j !== i) }))}><DeleteIcon /></IconButton></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button startIcon={<AddIcon />} sx={{ mt: 1 }} onClick={() => setData((d) => ({ ...d, employees: [...d.employees, { name: "", salary: 0 }] }))}>Adicionar funcionário</Button>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mt: 2 }}>
          <MoneyField label="Encargos (% sobre folha + 13º + férias)" size="small" value={data.encargosPct} onChange={(n) => setData((d) => ({ ...d, encargosPct: Math.min(100, n) }))} slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { inputMode: "decimal" } }} sx={{ width: 320 }} />
          <Typography variant="body2" color="text.secondary">Previsão de 13º = folha ÷ 12 · Previsão de férias = folha ÷ 12 + 1/3 · calculadas sozinhas.</Typography>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Despesas do mês</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" }, gap: 2 }}>
          {ITEMS.map(([k, label]) => (
            <MoneyField key={`${month}-${k}`} size="small" label={label} value={data.items[k] || 0} onChange={(n) => setData((d) => ({ ...d, items: { ...d.items, [k]: n } }))} slotProps={{ input: { startAdornment: <InputAdornment position="start">R$</InputAdornment> }, htmlInput: { inputMode: "decimal" } }} />
          ))}
        </Box>
        <TextField size="small" fullWidth label="Descrição de 'Outros' (opcional)" value={data.outrosDesc} onChange={(e) => setData({ ...data, outrosDesc: e.target.value })} sx={{ mt: 2 }} />
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Resumo e rateio</Typography>
        <Table size="small"><TableBody>
          {money("Folha de salários", calc.folha)}
          {money("Previsão de 13º", calc.decimo)}
          {money("Previsão de férias", calc.ferias)}
          {money("Encargos", calc.encargos)}
          {money("Demais despesas", calc.fixas)}
          {money("Total do mês", calc.total, true)}
          <TableRow><TableCell sx={{ fontWeight: 800 }}>Condôminos</TableCell><TableCell align="right" sx={{ fontWeight: 800 }}>{data.condominos || "—"}</TableCell></TableRow>
          {money("Valor por condômino", calc.each, true)}
        </TableBody></Table>
        {!data.condominos && <Alert severity="info" sx={{ mt: 2 }}>Informe o número de condôminos para ver o valor de cada um.</Alert>}
        <Box sx={{ display: "flex", gap: 1.5, mt: 2 }}>
          <Button variant="contained" disabled={busy} onClick={() => void save()}>Salvar rateio</Button>
          <Button variant="outlined" onClick={() => window.print()}>Imprimir</Button>
        </Box>
      </Paper>
    </Box>
  );
}
