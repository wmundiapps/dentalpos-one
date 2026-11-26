import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { clinicalFileAccess, isScanFile, listClinicalFiles, SCAN_TAG, uploadClinicalFile } from "../services/ClinicalFileService";
import type { ClinicalFile, ClinicalFileKind } from "../types/clinicalFile";

const dateOf = (f: ClinicalFile) => new Date(f.examDate || f.createdAt);
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const kindFor = (name: string): ClinicalFileKind => {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "stl" ? "STL" : ext === "ply" ? "PLY" : ext === "obj" ? "OBJ" : "OTHER";
};

// Pasta de escaneamentos de um paciente: arquivos da data mais nova para a mais antiga, com abertura e envio de novos arquivos.
export default function ScanFolderView({ patientId, onChanged }: { patientId: string; onChanged?: () => void }) {
  const [rows, setRows] = useState<ClinicalFile[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const all = await listClinicalFiles(patientId);
      setRows(all.filter(isScanFile).sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime()));
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Não foi possível carregar a pasta.");
    }
  }, [patientId]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  const open = async (f: ClinicalFile) => {
    try { window.open((await clinicalFileAccess(f.id)).url, "_blank", "noopener,noreferrer"); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível abrir o arquivo."); }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      for (const file of Array.from(files)) {
        await uploadClinicalFile({ patientId, file, kind: kindFor(file.name), title: file.name.replace(/\.[^.]+$/, ""), tags: [SCAN_TAG], origin: "Escaneamento" });
      }
      setNotice(`${files.length} arquivo(s) enviado(s) para a pasta.`);
      await load(); onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar o arquivo.");
    } finally { setBusy(false); }
  };

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ fontWeight: 800 }}>{rows ? `${rows.length} arquivo(s) de escaneamento` : "Carregando..."}</Typography>
        <Button variant="contained" component="label" startIcon={<CloudUploadIcon />} disabled={busy}>
          {busy ? "Enviando..." : "Adicionar escaneamento"}
          <input type="file" hidden multiple accept=".stl,.ply,.obj,.zip,.dcm" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
        </Button>
      </Box>
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}
      {!rows && <Box sx={{ display: "grid", placeItems: "center", py: 4 }}><CircularProgress /></Box>}
      {rows && rows.length === 0 && <Alert severity="info">Nenhum escaneamento nesta pasta ainda. Toque em “Adicionar escaneamento” (arquivos STL, PLY ou OBJ).</Alert>}
      {rows?.map((f) => (
        <Paper key={f.id} variant="outlined" sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography sx={{ fontWeight: 800 }}>{f.title || f.originalName}</Typography>
            <Typography variant="body2" color="text.secondary">{`${dateOf(f).toLocaleDateString("pt-BR")} • ${f.originalName} • ${size(f.sizeBytes)}${f.tooth ? ` • dente ${f.tooth}` : ""}`}</Typography>
          </Box>
          <Chip size="small" label={f.kind} />
          {f.storageStatus !== "AVAILABLE" && <Chip size="small" color="warning" label="Envio pendente" />}
          <Button size="small" startIcon={<OpenInNewIcon />} onClick={() => void open(f)}>Abrir</Button>
        </Paper>
      ))}
    </Box>
  );
}
