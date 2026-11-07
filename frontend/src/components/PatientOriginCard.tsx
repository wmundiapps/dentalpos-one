import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { loadClubOptions, loadPatientOrigin, savePatientOrigin, type ClubOptions, type PatientOrigin } from "../services/ClubApi";

// Indicativo na ficha: de onde veio o paciente. So "Campanha dos funcionarios" entra na comissao da equipe.
export default function PatientOriginCard({ patientId }: { patientId: string }) {
  const [opts, setOpts] = useState<ClubOptions | null>(null);
  const [origin, setOrigin] = useState<PatientOrigin | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [edit, setEdit] = useState(false);
  const [value, setValue] = useState("");
  const [detail, setDetail] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    loadClubOptions().then((o) => { if (active) setOpts(o); }).catch(() => undefined);
    loadPatientOrigin(patientId).then((d) => { if (active) { setOrigin(d.origin); setLoaded(true); } }).catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [patientId]);

  if (!opts || !loaded) return null;
  const canChange = !origin || opts.isManager;
  const save = async () => {
    setErr("");
    try { const d = await savePatientOrigin(patientId, { origin: value, detail: detail || undefined }); setOrigin(d.origin); setEdit(false); }
    catch (e) { setErr(e instanceof Error ? e.message : "Não foi possível salvar."); }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 3, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>Origem do paciente:</Typography>
      {origin && !edit && (
        <>
          <Chip size="small" color={origin.commission ? "success" : "default"} label={origin.label} />
          {origin.detail && <Typography variant="body2" color="text.secondary">{origin.detail}</Typography>}
          <Typography variant="caption" color="text.secondary">{origin.commission ? "Entra na campanha da equipe" : "Não entra na comissão da equipe"}</Typography>
        </>
      )}
      {!origin && !edit && <Chip size="small" color="warning" label="Não informada" />}
      {!edit && canChange && <Button size="small" onClick={() => { setValue(origin?.origin || ""); setDetail(origin?.detail || ""); setEdit(true); }}>{origin ? "Alterar" : "Informar"}</Button>}
      {edit && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", flex: 1 }}>
          <TextField select size="small" label="Origem" value={value} onChange={(e) => setValue(e.target.value)} sx={{ minWidth: 280 }}>
            {Object.entries(opts.origins).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Detalhe (quem indicou, qual anúncio...)" value={detail} onChange={(e) => setDetail(e.target.value)} sx={{ minWidth: 260 }} />
          <Button size="small" variant="contained" disabled={!value} onClick={save}>Salvar</Button>
          <Button size="small" onClick={() => setEdit(false)}>Cancelar</Button>
        </Box>
      )}
      {err && <Alert severity="error" sx={{ width: "100%" }}>{err}</Alert>}
    </Paper>
  );
}
