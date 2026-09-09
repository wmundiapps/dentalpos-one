import { Alert, Box } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import SpecializedClinicalWorkspace from "../components/clinical/SpecializedClinicalWorkspace";

export default function SpecializedClinical() {
  const [params] = useSearchParams();
  const patientId = params.get("patientId") || "";

  return <Box>
    <PageHeader
      title="Núcleo clínico especializado"
      description="Ortodontia, Ortopedia Funcional e DTM/Dor Orofacial integrados ao prontuário."
    />
    {patientId
      ? <SpecializedClinicalWorkspace patientId={patientId} />
      : <Alert severity="warning">Abra este módulo a partir de um paciente do prontuário.</Alert>}
  </Box>;
}
