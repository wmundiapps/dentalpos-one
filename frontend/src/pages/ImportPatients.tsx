import { useMemo, useState } from "react";
import { Alert, Box, Button, Chip, LinearProgress, List, ListItem, ListItemText, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { readSheet } from "read-excel-file/browser";
import PageHeader from "../components/PageHeader";
import { bulkImportPatients } from "../services/PatientApi";

type Target = "fullName" | "phone" | "cpf" | "rg" | "birthDate" | "gender" | "email" | "address" | "city" | "state" | "zipCode" | "notes";
type Grid = { headers: string[]; rows: string[][] };

const TARGETS: Array<[Target, string]> = [
  ["fullName", "Nome do paciente"], ["phone", "Telefone / celular"], ["cpf", "CPF"], ["rg", "RG"], ["birthDate", "Data de nascimento"],
  ["gender", "Sexo"], ["email", "E-mail"], ["address", "Endereço"], ["city", "Cidade"], ["state", "Estado"], ["zipCode", "CEP"], ["notes", "Observações"],
];

const ALIASES: Record<Target, string[]> = {
  fullName: ["nome", "nome completo", "paciente", "name", "nome do paciente"],
  phone: ["telefone", "celular", "whatsapp", "fone", "phone", "tel"],
  cpf: ["cpf"],
  rg: ["rg"],
  birthDate: ["nascimento", "data de nascimento", "data nascimento", "dt nascimento", "birthdate", "aniversario"],
  gender: ["sexo", "genero"],
  email: ["email", "e-mail"],
  address: ["endereco", "logradouro", "rua"],
  city: ["cidade", "city", "municipio"],
  state: ["estado", "uf"],
  zipCode: ["cep"],
  notes: ["observacao", "observacoes", "obs"],
};

const normalize = (h: string) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const EXCLUDED = /(mae|pai|responsavel|conjuge|indicacao|profissional|empresa|trabalho|comercial)/;

function autoMap(headers: string[]): Record<number, Target | ""> {
  const map: Record<number, Target | ""> = {};
  const used = new Set<Target>();
  const targets = Object.keys(ALIASES) as Target[];
  for (const mode of ["exact", "starts"] as const) {
    headers.forEach((raw, index) => {
      if (map[index]) return;
      const header = normalize(raw);
      if (!header) return;
      const found = targets.find((t) => {
        // Vários campos de telefone podem ser lidos (celular, telefone, WhatsApp): o primeiro válido vale.
        if (used.has(t) && t !== "phone") return false;
        return ALIASES[t].some((a) => (mode === "exact" ? header === a : header.startsWith(a) && !EXCLUDED.test(header)));
      });
      if (found) { map[index] = found; used.add(found); }
    });
  }
  headers.forEach((_, index) => { if (!map[index]) map[index] = ""; });
  return map;
}

// Leitor de CSV que respeita aspas (nomes como "Silva, João" e campos com quebra de linha).
function splitCsv(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n") { row.push(cell.trim()); out.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); out.push(row); }
  return out.filter((r) => r.some((c) => c));
}

// CSV salvo pelo Excel costuma vir em Windows-1252; tenta UTF-8 e cai para ele se houver acento quebrado.
async function readCsv(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { text = new TextDecoder("windows-1252").decode(buffer); }
  text = text.replace(/^﻿/, "");
  const firstLine = text.split("\n")[0] || "";
  const delimiter = [";", "\t", ","].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  return splitCsv(text, delimiter);
}

const pad = (n: number) => String(n).padStart(2, "0");
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  return String(value).trim();
}

async function readFileGrid(file: File): Promise<Grid> {
  const name = file.name.toLowerCase();
  let matrix: string[][];
  if (name.endsWith(".xlsx")) {
    const data = (await readSheet(file)) as unknown[][];
    matrix = data.map((r) => r.map(cellToString)).filter((r) => r.some((c) => c));
  } else if (name.endsWith(".xls")) {
    throw new Error('Arquivo .xls (Excel antigo) não é suportado. Abra no Excel e use "Salvar como" → .xlsx ou CSV.');
  } else {
    matrix = await readCsv(file);
  }
  if (!matrix.length) return { headers: [], rows: [] };
  const width = Math.max(...matrix.map((r) => r.length));
  const full = matrix.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  return { headers: full[0].map((h, i) => h || `Coluna ${i + 1}`), rows: full.slice(1) };
}

type Built = Record<Target, string>;
const emptyBuilt = (): Built => ({ fullName: "", phone: "", cpf: "", rg: "", birthDate: "", gender: "", email: "", address: "", city: "", state: "", zipCode: "", notes: "" });
const digits = (v: string) => v.replace(/\D/g, "");

function buildRows(grid: Grid, mapping: Record<number, Target | "">): Built[] {
  return grid.rows.map((cells) => {
    const out = emptyBuilt();
    const phones: string[] = [];
    grid.headers.forEach((_, index) => {
      const target = mapping[index];
      const value = (cells[index] || "").trim();
      if (!target || !value) return;
      if (target === "phone") phones.push(value);
      else if (!out[target]) out[target] = value;
    });
    out.phone = phones.find((p) => digits(p).length >= 10) || phones[0] || "";
    // Excel guarda CPF como número e perde o zero à esquerda.
    if (out.cpf && digits(out.cpf).length >= 9 && digits(out.cpf).length < 11) out.cpf = digits(out.cpf).padStart(11, "0");
    return out;
  }).filter((r) => r.fullName || r.phone);
}

const BATCH = 1000;

export default function ImportPatients() {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [mapping, setMapping] = useState<Record<number, Target | "">>({});
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ createdCount: number; skipped: Array<{ row: number; reason: string }> } | null>(null);
  const [error, setError] = useState("");

  const rows = useMemo(() => (grid ? buildRows(grid, mapping) : []), [grid, mapping]);
  const validCount = rows.filter((r) => r.fullName.trim() && digits(r.phone).length >= 10).length;
  const hasName = Object.values(mapping).includes("fullName");
  const hasPhone = Object.values(mapping).includes("phone");

  const handleFile = async (file: File) => {
    setError("");
    setResult(null);
    setFileName(file.name);
    try {
      const parsed = await readFileGrid(file);
      setGrid(parsed);
      setMapping(autoMap(parsed.headers));
    } catch (e) {
      setGrid(null);
      setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    }
  };

  const runImport = async () => {
    setImporting(true);
    setError("");
    setProgress(0);
    let createdCount = 0;
    const skipped: Array<{ row: number; reason: string }> = [];
    try {
      for (let start = 0; start < rows.length; start += BATCH) {
        const chunk = rows.slice(start, start + BATCH);
        const res = await bulkImportPatients(chunk as unknown as Array<Record<string, string>>);
        createdCount += res.createdCount;
        res.skipped.forEach((s) => skipped.push({ row: s.row + start, reason: s.reason }));
        setProgress(Math.min(100, Math.round(((start + chunk.length) / rows.length) * 100)));
      }
      setResult({ createdCount, skipped });
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Não foi possível importar."}${createdCount ? ` Já importados antes do erro: ${createdCount}. Reenvie o arquivo: os repetidos são ignorados.` : ""}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Importar pacientes de outro sistema"
        description="Traga o cadastro dos seus pacientes de outro sistema. Somente dados cadastrais são importados — financeiro, recebimentos e agenda permanecem no sistema de origem."
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        No sistema de origem, procure o relatório ou a exportação de pacientes para Excel (.xlsx) ou CSV e envie aqui. Você confere e ajusta quais colunas correspondem a cada campo antes de importar. Pacientes sem telefone com DDD não são importados (aparecem na lista de ignorados). Pacientes já cadastrados — mesmo nome e telefone, ou mesmo CPF — são ignorados, então é seguro reenviar o arquivo.
      </Alert>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Button component="label" variant="contained" startIcon={<UploadFileIcon />}>
          Escolher arquivo (.xlsx ou .csv)
          <input
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = "";
            }}
          />
        </Button>
        {fileName && grid && (
          <Typography sx={{ mt: 1 }} color="text.secondary">
            {`Arquivo: ${fileName} — ${rows.length} linha(s) com nome ou telefone, ${validCount} com nome e telefone válidos.`}
          </Typography>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </Paper>

      {grid && grid.headers.length > 0 && !result && (
        <>
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
            <Typography sx={{ fontWeight: 900, mb: 0.5 }}>Correspondência das colunas</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Para cada coluna do arquivo, escolha o campo do DentalPos. Colunas sem campo são ignoradas. Se houver mais de uma coluna de telefone, vale a primeira com DDD válido.</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 2 }}>
              {grid.headers.map((header, index) => (
                <TextField
                  key={index}
                  select
                  size="small"
                  label={header}
                  value={mapping[index] || ""}
                  onChange={(e) => setMapping({ ...mapping, [index]: e.target.value as Target | "" })}
                  helperText={grid.rows[0]?.[index] ? `Ex.: ${grid.rows[0][index].slice(0, 40)}` : " "}
                >
                  <MenuItem value="">Ignorar esta coluna</MenuItem>
                  {TARGETS.map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
                </TextField>
              ))}
            </Box>
            {(!hasName || !hasPhone) && <Alert severity="warning" sx={{ mt: 2 }}>{`Falta escolher a coluna de ${!hasName ? "nome" : "telefone"}.`}</Alert>}
          </Paper>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
            <Typography sx={{ fontWeight: 900, mb: 2 }}>Pré-visualização (primeiras 10 linhas)</Typography>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Nome</TableCell><TableCell>Telefone</TableCell><TableCell>CPF</TableCell><TableCell>Nascimento</TableCell><TableCell>Cidade</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.slice(0, 10).map((row, index) => (
                    <TableRow key={index}>
                      <TableCell>{row.fullName || <Chip size="small" color="error" label="sem nome" />}</TableCell>
                      <TableCell>{digits(row.phone).length >= 10 ? row.phone : <Chip size="small" color="error" label={row.phone ? "telefone sem DDD" : "sem telefone"} />}</TableCell>
                      <TableCell>{row.cpf}</TableCell>
                      <TableCell>{row.birthDate}</TableCell>
                      <TableCell>{row.city}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Button sx={{ mt: 2 }} variant="contained" disabled={importing || validCount === 0 || !hasName || !hasPhone} onClick={() => void runImport()}>
              {importing ? `Importando... ${progress}%` : `Importar ${validCount} paciente(s)`}
            </Button>
            {importing && <LinearProgress variant="determinate" value={progress} sx={{ mt: 2 }} />}
          </Paper>
        </>
      )}

      {result && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Alert severity="success" sx={{ mb: 2 }}>{result.createdCount} paciente(s) importado(s) com sucesso.</Alert>
          {result.skipped.length > 0 && (
            <>
              <Typography sx={{ fontWeight: 900, mb: 1 }}>{result.skipped.length} linha(s) ignorada(s)</Typography>
              <List dense sx={{ maxHeight: 360, overflow: "auto" }}>
                {result.skipped.map((item, i) => (
                  <ListItem key={i}>
                    <ListItemText primary={`Linha ${item.row + 1} do arquivo: ${item.reason}`} />
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </Paper>
      )}
    </Box>
  );
}
