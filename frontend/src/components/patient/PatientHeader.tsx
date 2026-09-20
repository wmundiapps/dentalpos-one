import { useEffect, useRef, useState } from "react";
import { Alert, Avatar, Box, Chip, CircularProgress, IconButton, Paper, Tooltip, Typography } from "@mui/material";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { clinicalFileAccess, listClinicalFiles, uploadClinicalFile } from "../../services/ClinicalFileService";
import type { BackendPatient } from "../../services/PatientApi";

export type ClinicalAlerts = { allergies: string[]; diseases: string[]; medications: string[]; alerts: string[] };

const PHOTO_TAG = "foto-perfil";

function age(birth?: string | null) {
  if (!birth) return "";
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years -= 1;
  return years >= 0 && years < 130 ? `${years} anos` : "";
}

export default function PatientHeader({ patient, alerts }: { patient: BackendPatient; alerts?: ClinicalAlerts }) {
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    setPhoto("");
    listClinicalFiles(patient.id, { kind: "PHOTO" })
      .then(async (rows) => {
        const row = rows.filter((r) => (r.tags || []).includes(PHOTO_TAG)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
        if (!row || !active) return;
        const access = await clinicalFileAccess(row.id);
        if (active && access?.url) setPhoto(access.url);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [patient.id]);

  const pick = async (file: File | null) => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      await uploadClinicalFile({ patientId: patient.id, file, kind: "PHOTO", title: `Foto de ${patient.fullName}`, tags: [PHOTO_TAG], description: "Foto de identificação do paciente" });
      const rows = await listClinicalFiles(patient.id, { kind: "PHOTO" });
      const row = rows.filter((r) => (r.tags || []).includes(PHOTO_TAG)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
      if (row) {
        const access = await clinicalFileAccess(row.id);
        if (access?.url) setPhoto(access.url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar a foto.");
    } finally { setBusy(false); }
  };

  const linhas: Array<[string, string[], "error" | "warning" | "info"]> = [
    ["Alergias", alerts?.allergies || [], "error"],
    ["Doenças", alerts?.diseases || [], "warning"],
    ["Medicamentos", alerts?.medications || [], "info"],
    ["Atenção", alerts?.alerts || [], "warning"],
  ];
  const temAlerta = linhas.some(([, v]) => v.length > 0);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Box sx={{ position: "relative" }}>
          <Avatar src={photo || undefined} sx={{ width: 84, height: 84, fontSize: 30, bgcolor: "primary.main" }}>
            {patient.fullName.slice(0, 1).toUpperCase()}
          </Avatar>
          <Tooltip title={photo ? "Trocar foto" : "Adicionar foto"}>
            <IconButton size="small" onClick={() => input.current?.click()} disabled={busy} sx={{ position: "absolute", right: -6, bottom: -6, bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}>
              {busy ? <CircularProgress size={16} /> : <PhotoCameraIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <input ref={input} hidden type="file" accept="image/*" onChange={(e) => { void pick(e.target.files?.[0] || null); e.target.value = ""; }} />
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 220 }}>
          <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.2 }}>{patient.fullName}</Typography>
          <Typography color="text.secondary">
            {[age(patient.birthDate), patient.phone, patient.cpf ? `CPF ${patient.cpf}` : "", patient.email || ""].filter(Boolean).join("  •  ")}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
            <Chip size="small" color={patient.status === "Inativo" ? "default" : "success"} label={patient.status || "Ativo"} />
            {patient.treatment && <Chip size="small" variant="outlined" label={patient.treatment} />}
          </Box>
        </Box>
      </Box>
      {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {temAlerta && (
        <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: "error.main", color: "#fff" }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 0.5 }}>
            <WarningAmberIcon fontSize="small" />
            <Typography sx={{ fontWeight: 900 }}>{"Atenção antes de atender"}</Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {linhas.filter(([, v]) => v.length > 0).map(([titulo, valores]) => (
              <Typography key={titulo} variant="body2">
                <b>{titulo}:</b> {valores.join(", ")}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  );
}