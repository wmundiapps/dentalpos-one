import { useCallback, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, TextField, Typography } from "@mui/material";
import ImportWizard from "./ImportWizard";
import { normalize, readFileGrid, type Grid } from "../pages/ImportPatients";

const TARGETS: Array<[string, string]> = [
  ["patientName", "Nome do paciente"], ["patientCode", "Código do paciente (sistema antigo)"], ["amount", "Valor da parcela"], ["dueDate", "Vencimento"],
  ["description", "Descrição"], ["installment", "Número da parcela"], ["installments", "Total de parcelas"], ["paymentMethod", "Forma de pagamento"],
  ["paidDate", "Data do pagamento"], ["paid", "Pago? (X ou sim)"], ["sourceId", "Código da parcela (evita repetir)"], ["headerId", "Código do pagamento (cabeçalho)"],
];
const ALIASES: Record<string, string[]> = {
  patientName: ["paciente", "nome do paciente", "patientname", "nome"],
  patientCode: ["patientid", "codigo do paciente", "id do paciente"],
  amount: ["valor", "amount", "valor da parcela"],
  dueDate: ["vencimento", "duedate", "data de vencimento"],
  description: ["descricao", "description", "paymentdescription"],
  installment: ["parcela", "installmentnumber", "numero da parcela"],
  installments: ["parcelas", "installmentscount", "total de parcelas"],
  paymentMethod: ["forma de pagamento", "paymentform", "forma"],
  paidDate: ["receiveddate", "data do pagamento", "data de recebimento", "pago em"],
  paid: ["paymentreceived", "pago", "recebido"],
  sourceId: ["id", "codigo", "codigo da parcela"],
  headerId: ["paymentheaderid"],
};
const FLAG_COLUMNS = ["canceled", "cancelled", "cancelado", "deleted", "apagado"];

function pickColumn(grid: Grid, names: string[]) {
  return grid.headers.findIndex((h) => names.includes(normalize(h)));
}

export default function ImportFinancial() {
  const [mode, setMode] = useState<"OPEN" | "ALL">("OPEN");
  const [pause, setPause] = useState(true);
  const [codes, setCodes] = useState<Map<string, string>>(new Map());
  const [deletedHeaders, setDeletedHeaders] = useState<Set<string>>(new Set());
  const [info, setInfo] = useState("");

  const loadPatients = async (file: File) => {
    try {
      const g = await readFileGrid(file);
      const idCol = pickColumn(g, ["id", "codigo", "patientid"]);
      const nameCol = pickColumn(g, ["name", "nome", "paciente", "nome do paciente"]);
      const delCol = pickColumn(g, ["deleted", "apagado"]);
      if (idCol < 0 || nameCol < 0) { setInfo("Não achei as colunas de código e nome nessa planilha de pacientes."); return; }
      const map = new Map<string, string>();
      g.rows.forEach((r) => { if (delCol >= 0 && (r[delCol] || "").trim().toUpperCase() === "X") return; if (r[idCol] && r[nameCol]) map.set(r[idCol].trim(), r[nameCol].trim()); });
      setCodes(map); setInfo(`${map.size} paciente(s) lidos para ligar as parcelas pelo código.`);
    } catch (e) { setInfo(e instanceof Error ? e.message : "Não foi possível ler a planilha de pacientes."); }
  };
  const loadHeaders = async (file: File) => {
    try {
      const g = await readFileGrid(file);
      const idCol = pickColumn(g, ["id"]);
      const delCol = pickColumn(g, ["deleted", "apagado"]);
      if (idCol < 0 || delCol < 0) { setInfo("Não achei as colunas de código e apagado nessa planilha de pagamentos."); return; }
      const set = new Set<string>();
      g.rows.forEach((r) => { if ((r[delCol] || "").trim().toUpperCase() === "X" && r[idCol]) set.add(r[idCol].trim()); });
      setDeletedHeaders(set); setInfo(`${set.size} pagamento(s) apagado(s) no sistema antigo serão ignorados.`);
    } catch (e) { setInfo(e instanceof Error ? e.message : "Não foi possível ler a planilha de pagamentos."); }
  };

  const buildRows = useCallback((grid: Grid, mapping: Record<number, string>) => {
    const flags = grid.headers.map((h, i) => (FLAG_COLUMNS.includes(normalize(h)) ? i : -1)).filter((i) => i >= 0);
    return grid.rows
      .filter((cells) => !flags.some((i) => (cells[i] || "").trim().toUpperCase() === "X"))
      .map((cells) => {
        const out: Record<string, string> = {};
        grid.headers.forEach((_, i) => { const t = mapping[i]; const v = (cells[i] || "").trim(); if (t && v && !out[t]) out[t] = v; });
        if (!out.patientName && out.patientCode && codes.get(out.patientCode)) out.patientName = codes.get(out.patientCode)!;
        return out;
      })
      .filter((r) => !(r.headerId && deletedHeaders.has(r.headerId)))
      .filter((r) => r.amount || r.dueDate);
  }, [codes, deletedHeaders]);

  return (
    <ImportWizard
      kind="financial"
      unit="parcela"
      title="Planilha do financeiro (parcelas a receber)"
      help="Envie a exportação das parcelas do outro sistema (.xlsx ou .csv). Importe os pacientes antes: cada parcela é ligada ao paciente pelo nome. Parcelas canceladas não entram, e parcelas já importadas (mesmo código) são ignoradas, então é seguro reenviar."
      targets={TARGETS}
      aliases={ALIASES}
      required={["amount", "dueDate"]}
      buildRows={buildRows}
      options={{ mode, pauseDebtorNotices: pause }}
      optionsPanel={
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2, display: "grid", gap: 2 }}>
          <Box>
            <Typography sx={{ fontWeight: 900, mb: 1 }}>O que importar</Typography>
            <TextField select size="small" value={mode} onChange={(e) => setMode(e.target.value as "OPEN" | "ALL")} sx={{ minWidth: 320 }}>
              <MenuItem value="OPEN">Só o que está a receber (recomendado)</MenuItem>
              <MenuItem value="ALL">Tudo, incluindo parcelas já pagas</MenuItem>
            </TextField>
          </Box>
          <FormControlLabel control={<Checkbox checked={pause} onChange={(e) => setPause(e.target.checked)} />}
            label="Pausar os avisos automáticos aos devedores ao importar (recomendado: parcelas vencidas passam a contar como inadimplência; ligue os avisos de novo depois de conferir)" />
          <Box>
            <Typography sx={{ fontWeight: 900 }}>Planilhas auxiliares (opcionais)</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Se a planilha de parcelas traz só o código do paciente (e não o nome), envie também a planilha de pacientes do sistema antigo. Para ignorar pagamentos apagados, envie a planilha de pagamentos (cabeçalho).</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button component="label" size="small" variant="outlined">Planilha de pacientes<input hidden type="file" accept=".xlsx,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadPatients(f); e.target.value = ""; }} /></Button>
              <Button component="label" size="small" variant="outlined">Planilha de pagamentos (cabeçalho)<input hidden type="file" accept=".xlsx,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadHeaders(f); e.target.value = ""; }} /></Button>
            </Box>
            {info && <Alert severity="info" sx={{ mt: 1 }}>{info}</Alert>}
          </Box>
        </Paper>
      }
    />
  );
}
