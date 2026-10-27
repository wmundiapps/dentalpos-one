import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, List, ListItem, ListItemText, Paper, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DownloadIcon from "@mui/icons-material/Download";
import { readSheet } from "read-excel-file/browser";
import { StockApi, type StockRule } from "../services/StockApi";
import { downloadCsv, parseCsvText } from "../utils/exportTable";

const FIELDS: Array<[string, string[]]> = [
  ["procedure", ["procedimento", "servico", "tratamento"]],
  ["product", ["produto", "item", "material", "codigo", "sku", "codigo do produto"]],
  ["quantity", ["quantidade", "qtd", "qtde", "quantidade por procedimento"]],
  ["mode", ["modo", "tipo", "baixa"]],
  ["perTooth", ["por dente", "dente", "multiplica por dente"]],
];
const norm = (h: string) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
const cellText = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toLocaleDateString("pt-BR") : String(v).trim());

async function readRows(file: File): Promise<Array<Record<string, string>>> {
  let matrix: string[][];
  if (file.name.toLowerCase().endsWith(".xlsx")) matrix = ((await readSheet(file)) as unknown[][]).map((r) => r.map(cellText));
  else if (file.name.toLowerCase().endsWith(".xls")) throw new Error('Arquivo .xls (Excel antigo) não é suportado. Use "Salvar como" .xlsx ou CSV.');
  else { const t = parseCsvText(await file.text()); matrix = [t.headers, ...t.rows]; }
  matrix = matrix.filter((r) => r.some((c) => c));
  if (matrix.length < 2) throw new Error("A planilha está vazia.");
  const keys = matrix[0].map((h) => { const n = norm(h); return FIELDS.find(([, aliases]) => aliases.includes(n))?.[0] || ""; });
  if (!keys.includes("procedure") || !keys.includes("product")) throw new Error("A planilha precisa das colunas Procedimento e Produto. Baixe o modelo para ver o formato.");
  return matrix.slice(1).map((r) => { const o: Record<string, string> = {}; keys.forEach((k, i) => { if (k && !o[k]) o[k] = r[i] || ""; }); return o; }).filter((o) => o.procedure || o.product);
}

// Planilha que liga cada procedimento aos materiais que ele consome (baixa automática e contagem de usos).
export default function StockRulesCard({ onChanged }: { onChanged?: () => void }) {
  const [rules, setRules] = useState<StockRule[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [skipped, setSkipped] = useState<Array<{ row: number; reason: string }>>([]);

  const load = useCallback(() => { StockApi.rules().then(setRules).catch(() => undefined); }, []);
  useEffect(load, [load]);

  const template = () => downloadCsv({
    title: "Consumo por procedimento",
    fileBase: "modelo-consumo-por-procedimento",
    headers: ["Procedimento", "Produto (código ou nome)", "Quantidade por procedimento", "Modo (baixa ou contagem)", "Por dente (sim ou não)"],
    rows: [
      ["Implante", "Implante cone morse", 1, "baixa", "sim"],
      ["Restauração", "Resina composta A2", 1, "contagem", "não"],
      ["Clareamento", "Gel clareador", 1, "contagem", "não"],
    ],
  });

  const pick = async (file: File) => {
    setBusy(true); setError(""); setNotice(""); setSkipped([]);
    try {
      const res = await StockApi.importRules(await readRows(file));
      setNotice(`${res.createdCount} regra(s) nova(s) e ${res.updatedCount} atualizada(s).`);
      setSkipped(res.skipped);
      load(); onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível importar a planilha.");
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Remover esta regra de consumo?")) return;
    try { await StockApi.removeRule(id); load(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível remover."); }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 2, borderRadius: 3 }}>
      <Typography sx={{ fontWeight: 900 }}>Consumo por procedimento</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Diga quais materiais cada procedimento usa. Ao registrar o procedimento no prontuário, o estoque se ajusta sozinho: <b>baixa</b> tira a quantidade (ex.: 1 implante) e <b>contagem</b> só conta o uso (ex.: uma bisnaga de resina serve para várias restaurações) para mostrar quantos procedimentos ela durou.
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <Button variant="contained" component="label" startIcon={<UploadFileIcon />} disabled={busy}>
          Enviar planilha (.xlsx ou .csv)
          <input type="file" hidden accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
        </Button>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={template}>Baixar modelo da planilha</Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 1 }} onClose={() => setNotice("")}>{notice}</Alert>}
      {skipped.length > 0 && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {`${skipped.length} linha(s) ignorada(s):`}
          <List dense disablePadding>{skipped.slice(0, 8).map((s, i) => <ListItem key={i} disableGutters><ListItemText primary={`Linha ${s.row + 1}: ${s.reason}`} /></ListItem>)}</List>
        </Alert>
      )}
      {rules.length === 0 ? <Typography color="text.secondary">Nenhuma regra ainda. Baixe o modelo, preencha e envie.</Typography> : (
        <Box sx={{ display: "grid", gap: 0.5, maxHeight: 280, overflow: "auto" }}>
          {rules.map((r) => (
            <Box key={r.id} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 160 }}>{r.procedureLabel}</Typography>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 160 }}>{r.productName || r.productSku}</Typography>
              <Chip size="small" color={r.mode === "DEBIT" ? "primary" : "default"} label={r.mode === "DEBIT" ? `baixa ${r.quantity}${r.perTooth ? " por dente" : ""}` : "contagem de uso"} />
              <Button size="small" color="error" onClick={() => void remove(r.id)}>Remover</Button>
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}
