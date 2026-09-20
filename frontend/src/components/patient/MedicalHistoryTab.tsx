import { Alert, Box, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { ClinicalRecordData } from "../../types/clinicalAnamnesis";
import type { BackendPatient } from "../../services/PatientApi";

const SIM_NAO: Record<string, string> = { YES: "Sim", NO: "Não", FORMER: "Anterior", NEVER: "Nunca", CURRENT: "Atual", SUSPECTED: "Suspeita", NOT_INFORMED: "Não informado" };

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Typography sx={{ fontWeight: 900, mb: 1.5 }}>{titulo}</Typography>
      {children}
    </Paper>
  );
}

function Lista({ itens, cor = "default", vazio = "Nada registrado" }: { itens: string[]; cor?: "default" | "error" | "warning" | "info"; vazio?: string }) {
  if (!itens.length) return <Typography color="text.secondary">{vazio}</Typography>;
  return <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>{itens.map((x) => <Chip key={x} label={x} color={cor} size="small" />)}</Box>;
}

function Texto({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  if (!valor || !String(valor).trim()) return null;
  return <Typography sx={{ mb: 1 }}><b>{rotulo}:</b> {valor}</Typography>;
}

export default function MedicalHistoryTab({ patient, data, loading }: { patient: BackendPatient; data: ClinicalRecordData | null; loading: boolean }) {
  if (loading) return <Box sx={{ display: "grid", placeItems: "center", minHeight: 200 }}><CircularProgress /></Box>;

  const alergias = data?.allergies?.length ? data.allergies : (patient.allergies ? [patient.allergies] : []);
  const remedios = data?.medications?.length ? data.medications : (patient.medications ? [patient.medications] : []);
  const vitais = data?.vitalSigns;
  const pressao = vitais?.systolic && vitais?.diastolic ? `${vitais.systolic}/${vitais.diastolic} mmHg` : "";

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {!data && <Alert severity="info">{"O prontuário ainda não foi preenchido. Abra a aba Prontuário para registrar a anamnese."}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <Bloco titulo={"Alergias"}><Lista itens={alergias} cor="error" vazio="Nenhuma alergia registrada" /></Bloco>
        <Bloco titulo={"Medicamentos em uso"}><Lista itens={remedios} cor="info" vazio="Nenhum medicamento registrado" /></Bloco>
        <Bloco titulo={"Doenças sistêmicas"}><Lista itens={data?.systemicDiseases || []} cor="warning" /></Bloco>
        <Bloco titulo={"Alertas clínicos e riscos"}><Lista itens={[...(data?.clinicalAlerts || []), ...(data?.riskConditions || [])]} cor="error" vazio="Sem alertas" /></Bloco>
        <Bloco titulo={"Cirurgias e internações"}>
          <Lista itens={[...(data?.previousSurgeries || []), ...(data?.hospitalizations || [])]} />
        </Bloco>
        <Bloco titulo={"Hábitos"}>
          <Texto rotulo="Tabagismo" valor={data ? `${SIM_NAO[data.smoking.status] || data.smoking.status}${data.smoking.details ? ` — ${data.smoking.details}` : ""}` : ""} />
          <Texto rotulo={"Álcool"} valor={data ? `${SIM_NAO[data.alcohol.status] || data.alcohol.status}${data.alcohol.details ? ` — ${data.alcohol.details}` : ""}` : ""} />
          {data?.pregnancy?.applicable && <Texto rotulo={"Gestação"} valor={`${SIM_NAO[data.pregnancy.status] || data.pregnancy.status}${data.pregnancy.weeks ? ` — ${data.pregnancy.weeks} semanas` : ""}`} />}
          <Lista itens={data?.parafunctionalHabits || []} vazio="Sem hábitos parafuncionais registrados" />
        </Bloco>
      </Box>
      <Bloco titulo={"Histórico e queixa"}>
        <Texto rotulo="Queixa principal" valor={data?.mainComplaint || patient.mainComplaint} />
        <Texto rotulo={"História da doença atual"} valor={data?.currentDiseaseHistory} />
        <Texto rotulo={"Histórico médico"} valor={data?.medicalHistory || patient.medicalHistory} />
        <Texto rotulo={"Histórico odontológico"} valor={data?.dentalHistory} />
        <Texto rotulo="Antecedentes familiares" valor={data?.relevantFamilyHistory} />
        <Texto rotulo={"Observações"} valor={data?.observations || patient.notes} />
      </Bloco>
      {(pressao || vitais?.glucoseMgDl) && (
        <Bloco titulo={"Sinais vitais"}>
          <Texto rotulo={"Pressão arterial"} valor={pressao} />
          <Texto rotulo="Glicemia" valor={vitais?.glucoseMgDl ? `${vitais.glucoseMgDl} mg/dL` : ""} />
          <Texto rotulo={"Aferido em"} valor={vitais?.measuredAt ? new Date(vitais.measuredAt).toLocaleString("pt-BR") : ""} />
        </Bloco>
      )}
    </Box>
  );
}