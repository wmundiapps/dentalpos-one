import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Chip, CircularProgress, Paper, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PageHeader from "../components/PageHeader";
import ScanFolderView from "../components/ScanFolderView";
import { listScanFolders, type ScanFolder } from "../services/ClinicalFileService";

type Mode = "alpha" | "name" | "date";
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

// Pastas de escaneamentos dos pacientes: ordem alfabética, busca por nome ou por data.
export default function Scans() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const openId = params.get("patientId") || "";
  const [mode, setMode] = useState<Mode>("alpha");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);
  const [rows, setRows] = useState<ScanFolder[] | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setRows(null); setError("");
    const t = setTimeout(() => {
      listScanFolders({ sort: mode, search: mode === "name" ? search.trim() : undefined, from: mode === "date" ? from : undefined, to: mode === "date" ? to : undefined, order: newestFirst ? "desc" : "asc" })
        .then((r) => { if (active) setRows(r); })
        .catch((e) => { if (active) { setRows([]); setError(e instanceof Error ? e.message : "Não foi possível carregar as pastas."); } });
    }, mode === "name" ? 250 : 0);
    return () => { active = false; clearTimeout(t); };
  }, [mode, search, from, to, newestFirst, version]);

  const opened = rows?.find((r) => r.patientId === openId);

  if (openId) {
    return (
      <Box>
        <PageHeader title={`Escaneamentos${opened ? ` • ${opened.patientName}` : ""}`} description="Pasta de escaneamentos do paciente." />
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => setParams({})}>Todas as pastas</Button>
          <Button variant="outlined" onClick={() => navigate(`/ficha-paciente?patientId=${encodeURIComponent(openId)}&aba=escaneamentos`)}>Abrir ficha do paciente</Button>
        </Box>
        <ScanFolderView patientId={openId} onChanged={() => setVersion((v) => v + 1)} />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader title="Escaneamentos" description="Uma pasta por paciente com os arquivos dos escaneamentos (STL, PLY e OBJ). Procure por ordem alfabética, por nome ou por data." />
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3, display: "grid", gap: 1.5 }}>
        <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v: Mode | null) => { if (v) setMode(v); }} aria-label="Como procurar">
          <ToggleButton value="alpha" sx={{ fontWeight: 800, px: 2 }}>Ordem alfabética</ToggleButton>
          <ToggleButton value="name" sx={{ fontWeight: 800, px: 2 }}>Por nome</ToggleButton>
          <ToggleButton value="date" sx={{ fontWeight: 800, px: 2 }}>Por data</ToggleButton>
        </ToggleButtonGroup>
        {mode === "name" && <TextField autoFocus size="small" label="Nome do paciente ou nº da ficha" value={search} onChange={(e) => setSearch(e.target.value)} />}
        {mode === "date" && (
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
            <TextField size="small" type="date" label="De" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="Até" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <Button size="small" onClick={() => setNewestFirst((v) => !v)}>{newestFirst ? "Mais recentes primeiro" : "Mais antigos primeiro"}</Button>
            {(from || to) && <Button size="small" onClick={() => { setFrom(""); setTo(""); }}>Limpar datas</Button>}
          </Box>
        )}
      </Paper>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!rows && <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress /></Box>}
      {rows && rows.length === 0 && !error && <Alert severity="info">{mode === "alpha" ? "Nenhum paciente tem escaneamento ainda. Abra a ficha de um paciente, aba Prontuário clínico, Escaneamentos." : "Nenhuma pasta encontrada com esse filtro."}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" }, gap: 1.5 }}>
        {rows?.map((r) => (
          <Paper key={r.patientId} variant="outlined" role="button" tabIndex={0} onClick={() => setParams({ patientId: r.patientId })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setParams({ patientId: r.patientId }); } }}
            sx={{ p: 2, borderRadius: 3, cursor: "pointer", display: "flex", gap: 1.5, alignItems: "center", "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" } }}>
            <FolderIcon sx={{ fontSize: 44, color: "warning.main" }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 900, overflowWrap: "anywhere" }}>{r.patientName}</Typography>
              <Typography variant="body2" color="text.secondary">{`${r.recordNumber != null ? `Ficha ${r.recordNumber} • ` : ""}Último: ${day(r.lastAt)}`}</Typography>
              <Chip size="small" sx={{ mt: 0.5 }} label={`${r.fileCount} arquivo(s)`} />
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
