import { useMemo, useState, type ReactNode } from "react";
import { Alert, Box, Button, LinearProgress, List, ListItem, ListItemText, MenuItem, Paper, TextField, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { normalize, readFileGrid, type Grid } from "../pages/ImportPatients";
import { sendImport, type ImportResult, type ImportSkipped } from "../services/ImportApi";

type Mapping = Record<number, string>;
const BATCH = 500;

export interface ImportWizardProps {
  kind: "appointments" | "financial";
  title: string;
  help: string;
  targets: Array<[string, string]>;
  aliases: Record<string, string[]>;
  required: string[];
  // Monta as linhas enviadas ao servidor; "extra" carrega as planilhas auxiliares (ex.: cadastro de pacientes).
  buildRows: (grid: Grid, mapping: Mapping) => Array<Record<string, string>>;
  options?: Record<string, unknown>;
  optionsPanel?: ReactNode;
  extraReady?: boolean;
  unit: string;
  verbs?: { preview: string; done: string; button: string };
}

function autoMap(headers: string[], aliases: Record<string, string[]>): Mapping {
  const map: Mapping = {};
  const used = new Set<string>();
  headers.forEach((raw, index) => {
    const h = normalize(raw);
    const hit = Object.keys(aliases).find((t) => !used.has(t) && aliases[t].includes(h));
    if (hit) { map[index] = hit; used.add(hit); } else map[index] = "";
  });
  return map;
}

export default function ImportWizard(props: ImportWizardProps) {
  const { kind, title, help, targets, aliases, required, buildRows, options = {}, optionsPanel, extraReady = true, unit, verbs = { preview: "podem ser importados", done: "importado(s) com sucesso", button: "Importar" } } = props;
  const [grid, setGrid] = useState<Grid | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const rows = useMemo(() => (grid ? buildRows(grid, mapping) : []), [grid, mapping, buildRows]);
  const missing = required.filter((key) => !Object.values(mapping).includes(key));

  const handleFile = async (file: File) => {
    setError(""); setPreview(null); setResult(null); setFileName(file.name);
    try {
      const parsed = await readFileGrid(file);
      setGrid(parsed);
      setMapping(autoMap(parsed.headers, aliases));
    } catch (e) {
      setGrid(null);
      setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    }
  };

  const run = async (dryRun: boolean) => {
    setBusy(true); setError(""); setProgress(0);
    const skipped: ImportSkipped[] = [];
    let createdCount = 0; let total = 0; let overdue = 0;
    try {
      for (let start = 0; start < rows.length; start += BATCH) {
        const res = await sendImport(kind, rows.slice(start, start + BATCH), options, dryRun);
        createdCount += res.createdCount; total += res.total || 0; overdue += res.overdue || 0;
        res.skipped.forEach((s) => skipped.push({ row: s.row + start, reason: s.reason }));
        setProgress(Math.round(((start + BATCH) / rows.length) * 100));
      }
      const out: ImportResult = { dryRun, createdCount, skipped, total, overdue };
      if (dryRun) setPreview(out); else { setResult(out); setPreview(null); }
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Não foi possível importar."}${!dryRun && createdCount ? ` Já importados antes do erro: ${createdCount}. Reenvie o arquivo: os repetidos são ignorados.` : ""}`);
    } finally {
      setBusy(false);
    }
  };

  const reasons = (list: ImportSkipped[]) => {
    const count = new Map<string, number>();
    list.forEach((s) => count.set(s.reason, (count.get(s.reason) || 0) + 1));
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  };
  const money = (v?: number) => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>{help}</Alert>
      {optionsPanel}
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography sx={{ fontWeight: 900, mb: 1 }}>{title}</Typography>
        <Button component="label" variant="contained" startIcon={<UploadFileIcon />}>
          Escolher arquivo (.xlsx ou .csv)
          <input type="file" hidden accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
        </Button>
        {fileName && grid && <Typography sx={{ mt: 1 }} color="text.secondary">{`Arquivo: ${fileName} — ${rows.length} ${unit}(s) lidos.`}</Typography>}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </Paper>

      {grid && grid.headers.length > 0 && !result && (
        <>
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
            <Typography sx={{ fontWeight: 900, mb: 0.5 }}>Correspondência das colunas</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Para cada coluna do arquivo, escolha o campo do CompletoDonto. Colunas sem campo são ignoradas.</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 2 }}>
              {grid.headers.map((header, index) => (
                <TextField key={index} select size="small" label={header} value={mapping[index] || ""}
                  onChange={(e) => { setMapping({ ...mapping, [index]: e.target.value }); setPreview(null); }}
                  helperText={grid.rows[0]?.[index] ? `Ex.: ${grid.rows[0][index].slice(0, 40)}` : " "}>
                  <MenuItem value="">Ignorar esta coluna</MenuItem>
                  {targets.map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
                </TextField>
              ))}
            </Box>
            {missing.length > 0 && <Alert severity="warning" sx={{ mt: 2 }}>{`Falta escolher a coluna de: ${missing.map((k) => targets.find((t) => t[0] === k)?.[1] || k).join(", ")}.`}</Alert>}
          </Paper>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
            <Typography sx={{ fontWeight: 900, mb: 1 }}>Conferir antes de importar</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>A conferência mostra quantas linhas entram e quantas ficam de fora, sem gravar nada.</Typography>
            <Button variant="outlined" disabled={busy || rows.length === 0 || missing.length > 0 || !extraReady} onClick={() => void run(true)}>
              {busy && !preview ? `Conferindo... ${Math.min(100, progress)}%` : "Conferir"}
            </Button>
            {busy && <LinearProgress variant="determinate" value={Math.min(100, progress)} sx={{ mt: 2 }} />}
            {preview && (
              <Box sx={{ mt: 2 }}>
                <Alert severity={preview.createdCount ? "success" : "warning"}>
                  {`${preview.createdCount} ${unit}(s) ${verbs.preview}${preview.total ? `, somando ${money(preview.total)}` : ""}${preview.overdue ? ` (${money(preview.overdue)} já vencidos)` : ""}. ${preview.skipped.length} ficam de fora.`}
                </Alert>
                {reasons(preview.skipped).length > 0 && (
                  <List dense>{reasons(preview.skipped).map(([reason, n]) => <ListItem key={reason}><ListItemText primary={`${n} linha(s): ${reason}`} /></ListItem>)}</List>
                )}
                <Button sx={{ mt: 1 }} variant="contained" disabled={busy || preview.createdCount === 0} onClick={() => void run(false)}>
                  {busy ? `Importando... ${Math.min(100, progress)}%` : `${verbs.button} ${preview.createdCount} ${unit}(s) agora`}
                </Button>
              </Box>
            )}
          </Paper>
        </>
      )}

      {result && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Alert severity="success" sx={{ mb: 2 }}>{result.createdCount} {unit}(s) {verbs.done}.</Alert>
          {result.skipped.length > 0 && (
            <>
              <Typography sx={{ fontWeight: 900, mb: 1 }}>{result.skipped.length} linha(s) ignorada(s)</Typography>
              <List dense sx={{ maxHeight: 360, overflow: "auto" }}>
                {result.skipped.map((item, i) => <ListItem key={i}><ListItemText primary={`Linha ${item.row + 1} do arquivo: ${item.reason}`} /></ListItem>)}
              </List>
            </>
          )}
        </Paper>
      )}
    </Box>
  );
}
