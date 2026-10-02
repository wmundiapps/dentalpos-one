import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Panel, Stat, StatGrid, Tag, useSpaces } from "../infraestrutura/kit";

const EXEMPLO_CSV = "titulo;autores;isbn;editora;ano;exemplares\nAnatomia Humana;Sobotta;9788527726010;Guanabara Koogan;2018;3";

export default function ImportarPanel() {
  const [formato, setFormato] = useState("csv");
  const [dados, setDados] = useState("");
  const [dry, setDry] = useState(true);
  const [spaceId, setSpaceId] = useState("");
  const [estante, setEstante] = useState("");
  const [res, setRes] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const spaces = useSpaces();

  async function enviar() {
    setBusy(true); setErr(null);
    try { setRes(await eduApi.post("/biblioteca/obras/importar", { formato, dados, dryRun: dry, spaceId: spaceId || undefined, estante: estante || undefined })); }
    catch (e: any) { setErr(e?.message || "Falha na importação."); setRes(null); } finally { setBusy(false); }
  }
  return (
    <Panel title="Importar acervo em lote" subtitle="Cole um CSV (separador ; ou ,) ou um JSON com colunas: titulo, autores, isbn, editora, ano, cdd, assuntos, exemplares… Use primeiro a simulação.">
      <Box sx={{ display: "grid", gap: 2 }}>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <TextField select size="small" label="Formato" value={formato} onChange={(e) => setFormato(e.target.value)} sx={{ width: 120 }}><MenuItem value="csv">CSV</MenuItem><MenuItem value="json">JSON</MenuItem></TextField>
          <TextField select size="small" label="Local dos exemplares" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} sx={{ minWidth: 220 }}><MenuItem value="">—</MenuItem>{spaces.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}</TextField>
          <TextField size="small" label="Estante" value={estante} onChange={(e) => setEstante(e.target.value)} sx={{ width: 140 }} />
          <FormControlLabel control={<Checkbox checked={dry} onChange={(e) => setDry(e.target.checked)} />} label="Somente simular (não grava)" />
        </Box>
        <TextField multiline minRows={8} label="Dados" value={dados} onChange={(e) => setDados(e.target.value)} placeholder={formato === "csv" ? EXEMPLO_CSV : '[{"titulo":"...","autores":"A; B","exemplares":2}]'} slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: 12 } } }} />
        <Box><Button variant="contained" onClick={enviar} disabled={busy || !dados.trim()}>{dry ? "Simular importação" : "Importar agora"}</Button></Box>
        {err && <Alert severity="error">{err}</Alert>}
        {res && (
          <>
            <Alert severity={res.erros?.length ? "warning" : "success"}>{res.dryRun ? "Simulação concluída (nada foi gravado)." : "Importação concluída."}</Alert>
            <StatGrid min={140}><Stat label="Linhas" value={res.total} /><Stat label="Obras novas" value={res.obrasCriadas} tone="success" /><Stat label="Obras já existentes" value={res.obrasExistentes} /><Stat label="Exemplares" value={res.exemplaresCriados} /><Stat label="Erros" value={res.erros?.length || 0} tone={res.erros?.length ? "error" : "success"} /></StatGrid>
            {(res.erros || []).slice(0, 20).map((e: any, i: number) => <Typography key={i} variant="body2"><Tag text={`Linha ${e.linha}`} tone="error" /> {e.erro}</Typography>)}
            {(res.avisos || []).slice(0, 20).map((e: any, i: number) => <Typography key={i} variant="body2"><Tag text={`Linha ${e.linha}`} tone="warning" /> {e.aviso}</Typography>)}
          </>
        )}
      </Box>
    </Panel>
  );
}
