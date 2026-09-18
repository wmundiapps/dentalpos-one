import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Autocomplete, Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import PersonSearchIcon from "@mui/icons-material/PersonSearch";
import { loadBackendPatients, type BackendPatient } from "../../services/PatientApi";

/** Tela mostrada quando nenhum paciente foi escolhido ainda. */
export default function PatientPicker({ titulo, descricao }: { titulo: string; descricao: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<BackendPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [escolhido, setEscolhido] = useState<BackendPatient | null>(null);

  useEffect(() => {
    let active = true;
    loadBackendPatients()
      .then((r) => { if (active) setRows(r); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Erro ao carregar pacientes."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const abrir = (p: BackendPatient | null) => {
    if (!p) return;
    const next = new URLSearchParams(params);
    next.set("patientId", p.id);
    next.set("patient", p.fullName);
    next.set("paciente", p.fullName);
    setParams(next, { replace: true });
  };

  return (
    <Box sx={{ display: "grid", placeItems: "center", minHeight: 320 }}>
      <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, maxWidth: 560, width: "100%", textAlign: "center" }}>
        <PersonSearchIcon sx={{ fontSize: 48, color: "primary.main" }} />
        <Typography variant="h6" sx={{ fontWeight: 900, mt: 1 }}>{titulo}</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>{descricao}</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? <CircularProgress /> : (
          <>
            <Autocomplete
              options={rows}
              value={escolhido}
              onChange={(_, v) => { setEscolhido(v); abrir(v); }}
              getOptionLabel={(o) => `${o.fullName}${o.phone ? ` \u2014 ${o.phone}` : ""}`}
              noOptionsText="Nenhum paciente encontrado"
              renderInput={(p) => <TextField {...p} autoFocus label="Buscar paciente por nome ou telefone" />}
            />
            <Button sx={{ mt: 2 }} onClick={() => navigate("/pacientes")}>Ir para a lista de pacientes</Button>
          </>
        )}
      </Paper>
    </Box>
  );
}