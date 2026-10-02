import { useEffect, useRef, useState } from "react";
import { Alert, Autocomplete, Box, Chip, TextField, Typography } from "@mui/material";
import { loadBackendPatients, type BackendPatient } from "../services/PatientApi";

/**
 * DentalPod Design — simulação digital de sorriso (DSD) + CAD para facetas, coroas e próteses.
 * Módulo independente (pasta /dentalpoddesign do repositório) servido em /dentalpoddesign/ e
 * embutido aqui por iframe. A ponte usa postMessage:
 *   Dentalpos One → DentalPod: { type: "dpd:init", patient: { id, name }, clinic }
 *   DentalPod → Dentalpos One: { type: "dpd:ready" } | { type: "dpd:saved", project: {...} }
 */
export default function SmileDesign() {
  const [patients, setPatients] = useState<BackendPatient[]>([]);
  const [patient, setPatient] = useState<BackendPatient | null>(null);
  const [ready, setReady] = useState(false);
  const [lastSaved, setLastSaved] = useState<string>("");
  const frame = useRef<HTMLIFrameElement>(null);
  const src = `${import.meta.env.BASE_URL || "/"}dentalpoddesign/index.html?embedded=1`;

  useEffect(() => {
    loadBackendPatients().then(setPatients).catch(() => setPatients([]));
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "dpd:ready") setReady(true);
      if (e.data?.type === "dpd:saved") setLastSaved(new Date(e.data.project?.updatedAt || Date.now()).toLocaleTimeString("pt-BR"));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready || !patient) return;
    frame.current?.contentWindow?.postMessage(
      { type: "dpd:init", patient: { id: patient.id, name: patient.fullName }, caseName: `Sorriso — ${patient.fullName}` },
      "*",
    );
  }, [ready, patient]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", minHeight: 560, gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>DentalPod Design</Typography>
        <Chip size="small" label="Simulação de sorriso + CAD 3D" />
        <Autocomplete
          size="small"
          sx={{ minWidth: 320 }}
          options={patients}
          value={patient}
          onChange={(_, v) => setPatient(v)}
          getOptionLabel={(p) => p.fullName}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label="Paciente (abre ou cria o caso)" />}
        />
        {lastSaved && <Typography variant="caption" color="text.secondary">Último salvamento: {lastSaved}</Typography>}
      </Box>
      {!patient && <Alert severity="info" sx={{ py: 0 }}>Selecione um paciente para vincular o caso, ou use o módulo livremente (os casos ficam salvos neste navegador).</Alert>}
      <Box sx={{ flex: 1, border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden", bgcolor: "#0b1118" }}>
        <iframe
          ref={frame}
          title="DentalPod Design"
          src={src}
          style={{ width: "100%", height: "100%", border: 0 }}
          allow="clipboard-write; fullscreen"
        />
      </Box>
    </Box>
  );
}
