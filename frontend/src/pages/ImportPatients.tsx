import { useState } from "react";
import { Alert, Box, Button, Chip, List, ListItem, ListItemText, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PageHeader from "../components/PageHeader";
import { bulkImportPatients } from "../services/PatientApi";

type ParsedRow = { fullName: string; phone: string; cpf: string; birthDate: string; city: string; email: string };

const HEADER_ALIASES: Record<keyof ParsedRow, string[]> = {
  fullName: ["nome", "nome completo", "paciente", "name"],
  phone: ["telefone", "celular", "whatsapp", "fone", "phone"],
  cpf: ["cpf"],
  birthDate: ["nascimento", "data de nascimento", "data nascimento", "birthdate"],
  city: ["cidade", "city"],
  email: ["email", "e-mail"],
};

const normalizeHeader = (h: string) => h.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

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

function parseCsv(text: string): { rows: ParsedRow[]; unmapped: string[] } {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split("\n")[0] || "";
  const delimiter = [";", "\t", ","].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const table = splitCsv(clean, delimiter);
  if (!table.length) return { rows: [], unmapped: [] };
  const headers = table[0].map(normalizeHeader);

  const keys = Object.keys(HEADER_ALIASES) as Array<keyof ParsedRow>;
  const columnMap: Partial<Record<keyof ParsedRow, number>> = {};
  // 1º passo: nome de coluna exatamente igual; 2º passo: começa com o apelido (evita "Nome da mãe" virar Nome).
  for (const mode of ["exact", "starts"] as const) {
    headers.forEach((header, index) => {
      if (Object.values(columnMap).includes(index)) return;
      const found = keys.find((key) => columnMap[key] === undefined && HEADER_ALIASES[key].some((alias) => {
        const a = normalizeHeader(alias);
        return mode === "exact" ? header === a : header.startsWith(a) && !/(mae|pai|responsavel)/.test(header);
      }));
      if (found) columnMap[found] = index;
    });
  }
  const used = new Set(Object.values(columnMap));
  const unmapped = headers.filter((header, index) => header && !used.has(index));

  const rows: ParsedRow[] = table.slice(1).map((cells) => {
    const get = (key: keyof ParsedRow) => (columnMap[key] !== undefined ? cells[columnMap[key] as number] || "" : "");
    return {
      fullName: get("fullName"),
      phone: get("phone"),
      cpf: get("cpf"),
      birthDate: get("birthDate"),
      city: get("city"),
      email: get("email"),
    };
  }).filter((row) => row.fullName || row.phone);

  return { rows, unmapped };
}

// CSV salvo pelo Excel costuma vir em Windows-1252; tenta UTF-8 e cai para ele se houver acento quebrado.
async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { return new TextDecoder("windows-1252").decode(buffer); }
}

export default function ImportPatients() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ createdCount: number; skipped: Array<{ row: number; reason: string }> } | null>(null);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setError("");
    setResult(null);
    setFileName(file.name);
    const text = await readFileText(file);
    const parsed = parseCsv(text);
    setRows(parsed.rows);
    setUnmapped(parsed.unmapped);
  };

  const runImport = async () => {
    setImporting(true);
    setError("");
    try {
      const result = await bulkImportPatients(rows as unknown as Array<Record<string, string>>);
      setResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível importar.");
    } finally {
      setImporting(false);
    }
  };

  const validCount = rows.filter((r) => r.fullName.trim() && r.phone.replace(/\D/g, "").length >= 10).length;

  return (
    <Box>
      <PageHeader
        title="Importar pacientes de outro sistema"
        description="Traga o cadastro dos seus pacientes (nome, telefone, CPF, cidade) de outro sistema, como Clinicorp. Dados financeiros não são importados — permanecem no sistema de origem."
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        No sistema de origem, procure por um relatório de pacientes com exportação para Excel ou CSV (geralmente em "Relatórios &gt; Pacientes"). Salve o arquivo e envie aqui. Se o arquivo for Excel (.xlsx), abra e use "Salvar como" → CSV. Colunas reconhecidas automaticamente: Nome, Telefone, CPF, Data de nascimento, Cidade, E-mail — não precisa estar na mesma ordem. Pacientes sem telefone com DDD não são importados e aparecem na lista de linhas ignoradas. Pacientes já cadastrados (mesmo nome e telefone, ou mesmo CPF) são ignorados.
      </Alert>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Button component="label" variant="contained" startIcon={<UploadFileIcon />}>
          Escolher arquivo CSV
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </Button>
        {fileName && <Typography sx={{ mt: 1 }} color="text.secondary">Arquivo: {fileName} — {rows.length} linha(s) encontrada(s), {validCount} com nome e telefone válidos.</Typography>}
        {unmapped.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Colunas não reconhecidas (ignoradas): {unmapped.join(", ")}
          </Alert>
        )}
      </Paper>

      {rows.length > 0 && !result && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
          <Typography sx={{ fontWeight: 900, mb: 2 }}>Pré-visualização (primeiras 10 linhas)</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Telefone</TableCell>
                <TableCell>CPF</TableCell>
                <TableCell>Nascimento</TableCell>
                <TableCell>Cidade</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.slice(0, 10).map((row, index) => (
                <TableRow key={index}>
                  <TableCell>{row.fullName || <Chip size="small" color="error" label="sem nome" />}</TableCell>
                  <TableCell>{row.phone || <Chip size="small" color="error" label="sem telefone" />}</TableCell>
                  <TableCell>{row.cpf}</TableCell>
                  <TableCell>{row.birthDate}</TableCell>
                  <TableCell>{row.city}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button
            sx={{ mt: 2 }}
            variant="contained"
            disabled={importing || validCount === 0}
            onClick={() => void runImport()}
          >
            {importing ? "Importando..." : `Importar ${validCount} paciente(s)`}
          </Button>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </Paper>
      )}

      {result && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Alert severity="success" sx={{ mb: 2 }}>{result.createdCount} paciente(s) importado(s) com sucesso.</Alert>
          {result.skipped.length > 0 && (
            <>
              <Typography sx={{ fontWeight: 900, mb: 1 }}>{result.skipped.length} linha(s) ignorada(s)</Typography>
              <List dense>
                {result.skipped.map((item) => (
                  <ListItem key={item.row}>
                    <ListItemText primary={`Linha ${item.row}: ${item.reason}`} />
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
