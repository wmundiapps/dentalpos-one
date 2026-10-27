import { useEffect, useMemo, useState } from "react";
import { Box, Button, Chip, Paper, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useNavigate } from "react-router-dom";
import { loadBackendPatient, type BackendPatient } from "../../services/PatientApi";
import { loadClinicalRecord } from "../../services/ClinicalAnamnesisApi";
import type { ClinicalRecordData } from "../../types/clinicalAnamnesis";

// Condições que exigem cuidado no atendimento: detectadas também no texto livre da ficha.
const SPECIAL = [
  ["Marcapasso", /marca[\s-]?passo/i], ["Cardiopatia", /cardiopat|cardíac|cardiac|infarto|arritmia/i], ["Hipertensão", /hipertens|press[aã]o alta/i],
  ["Diabetes", /diabet/i], ["Anticoagulante / sangramento", /anticoagul|varfarin|marevan|xarelto|hemofil|sangramento/i], ["Gestante", /gestante|gr[aá]vida|gravidez/i],
  ["Epilepsia", /epilep|convuls/i], ["Doença infecciosa", /\bhiv\b|hepatite|tuberculose/i], ["Prótese valvar / endocardite", /valvar|endocardite/i],
  ["Asma / problema respiratório", /asma|bronquite|dpoc/i], ["Uso de bisfosfonato", /bisfosfon|alendron|zoledr/i], ["Alergia a látex / anestésico", /l[aá]tex|anest[eé]sic/i],
] as const;

type Snapshot = { patient: BackendPatient | null; record: ClinicalRecordData | null; riskFlags: string[] };
const cache = new Map<string, { at: number; value: Promise<Snapshot> }>();

function fetchSnapshot(patientId: string): Promise<Snapshot> {
  const hit = cache.get(patientId);
  if (hit && Date.now() - hit.at < 30000) return hit.value;
  const value = Promise.all([
    loadBackendPatient(patientId).catch(() => null),
    loadClinicalRecord(patientId).then((b) => ({ data: b.record.data, flags: b.record.riskFlags || [] })).catch(() => null),
  ]).then(([patient, rec]) => ({ patient, record: rec?.data || null, riskFlags: rec?.flags || [] }));
  cache.set(patientId, { at: Date.now(), value });
  return value;
}

export default function PatientAlertBanner({ patientId, compact = false }: { patientId?: string | null; compact?: boolean }) {
  const navigate = useNavigate();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    let active = true;
    setSnap(null);
    if (patientId) void fetchSnapshot(patientId).then((s) => { if (active) setSnap(s); });
    return () => { active = false; };
  }, [patientId]);

  const info = useMemo(() => {
    if (!snap) return null;
    const { patient, record, riskFlags } = snap;
    const allergies = record?.allergies?.length ? record.allergies : patient?.allergies ? [patient.allergies] : [];
    const diseases = record?.systemicDiseases || [];
    const medications = record?.medications?.length ? record.medications : patient?.medications ? [patient.medications] : [];
    const risks = [...(record?.riskConditions || []), ...(record?.clinicalAlerts || []), ...riskFlags];
    const text = [patient?.medicalHistory, patient?.allergies, patient?.medications, patient?.notes, record?.observations, ...allergies, ...diseases, ...medications, ...risks].filter(Boolean).join(" | ");
    const special = SPECIAL.filter(([, re]) => re.test(text)).map(([label]) => label);
    const clean = (list: string[]) => [...new Set(list.map((s) => String(s).trim()).filter(Boolean))];
    return { allergies: clean(allergies), diseases: clean(diseases), medications: clean(medications), risks: clean(risks), special };
  }, [snap]);

  if (!patientId || !info) return null;
  const has = info.allergies.length || info.diseases.length || info.medications.length || info.risks.length || info.special.length;
  if (!has) return null;
  const line = (label: string, items: string[], color: "error" | "warning" | "info") => items.length ? (
    <Box sx={{ display: "flex", gap: 0.6, flexWrap: "wrap", alignItems: "center" }}>
      <Typography variant="caption" sx={{ fontWeight: 900, minWidth: 96 }}>{label}</Typography>
      {items.slice(0, compact ? 4 : 12).map((i) => <Chip key={i} size="small" color={color} label={i} />)}
    </Box>
  ) : null;
  return (
    <Paper variant="outlined" sx={{ p: compact ? 1 : 1.5, mb: 2, borderRadius: 2, borderColor: "error.main", borderWidth: 2, bgcolor: "rgba(211,47,47,0.08)" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.8, flexWrap: "wrap" }}>
        <WarningAmberIcon color="error" />
        <Typography sx={{ fontWeight: 900, color: "error.main" }}>ATENÇÃO — condições especiais do paciente</Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => navigate(`/ficha-paciente?patientId=${encodeURIComponent(patientId)}&aba=historico`)}>Ver / editar histórico médico</Button>
      </Box>
      <Box sx={{ display: "grid", gap: 0.6 }}>
        {line("Alergias", info.allergies, "error")}
        {line("Condições", info.special, "error")}
        {line("Doenças", info.diseases, "warning")}
        {line("Riscos", info.risks, "warning")}
        {line("Medicamentos", info.medications, "info")}
      </Box>
    </Paper>
  );
}
