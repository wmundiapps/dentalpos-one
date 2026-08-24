import { Navigate, Route, Routes } from "react-router-dom";

import Academic from "../pages/Academic";
import Accounting from "../pages/Accounting";
import Agenda from "../pages/Agenda";
import Backup from "../pages/Backup";
import Benchmark from "../pages/Benchmark";
import BusinessIntelligence from "../pages/BusinessIntelligence";
import ClinicHealth from "../pages/ClinicHealth";
import Clinics from "../pages/Clinics";
import ClinicalDocuments from "../pages/ClinicalDocuments";
import ClinicalRecord from "../pages/ClinicalRecord";
import CommandCenter from "../pages/CommandCenter";
import Commercial from "../pages/Commercial";
import Communications from "../pages/Communications";
import CRM from "../pages/CRM";
import CRMKanban from "../pages/CRMKanban";
import Dashboard from "../pages/Dashboard";
import ExecutiveAssistant from "../pages/ExecutiveAssistant";
import ExecutiveDashboard from "../pages/ExecutiveDashboard";
import Feedback from "../pages/Feedback";
import Financial from "../pages/Financial";
import FinancialScanner from "../pages/FinancialScanner";
import FiscalAutomation from "../pages/FiscalAutomation";
import HumanResources from "../pages/HumanResources";
import Laboratory from "../pages/Laboratory";
import Marketing from "../pages/Marketing";
import Notifications from "../pages/Notifications";
import Operations from "../pages/Operations";
import OperationalEvidence from "../pages/OperationalEvidence";
import PatientFlow from "../pages/PatientFlow";
import PatientJourney from "../pages/PatientJourney";
import PaymentCenter from "../pages/PaymentCenter";
import Revah from "../pages/Revah";
import Patients from "../pages/Patients";
import ProfitIntelligence from "../pages/ProfitIntelligence";
import Recall from "../pages/Recall";
import Reports from "../pages/Reports";
import ServiceEvaluations from "../pages/ServiceEvaluations";
import Sales from "../pages/Sales";
import Settings from "../pages/Settings";
import Stock from "../pages/Stock";
import TreatmentPlanning from "../pages/TreatmentPlanning";
import PlatformAdministration from "../pages/PlatformAdministration";
import LeadDiscovery from "../pages/LeadDiscovery";
import Integrations from "../pages/Integrations";

import DentalPosDesign from "../dentalpos-design/pages/DentalPosDesign";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />

      <Route path="/academico" element={<Academic />} />

      <Route path="/agenda" element={<Agenda />} />

      <Route
        path="/automacao-fiscal"
        element={<FiscalAutomation />}
      />

      <Route
        path="/avaliacoes-atendimento"
        element={<ServiceEvaluations />}
      />

      <Route path="/backup" element={<Backup />} />

      <Route path="/benchmark" element={<Benchmark />} />

      <Route
        path="/ceo-ia"
        element={<ExecutiveAssistant />}
      />

      <Route
        path="/centro-de-comando"
        element={<CommandCenter />}
      />

      <Route
        path="/centro-de-inteligencia"
        element={<BusinessIntelligence />}
      />

      <Route path="/clinicas" element={<Clinics />} />

      <Route path="/comercial" element={<Commercial />} />

      <Route path="/sales" element={<Sales />} />

      <Route
        path="/comunicacoes"
        element={<Communications />}
      />

      <Route
        path="/configuracoes"
        element={<Settings />}
      />

      <Route
        path="/contabil-fiscal"
        element={<Accounting />}
      />

      <Route path="/crm" element={<CRM />} />

      <Route
        path="/crm-inteligente"
        element={<CRMKanban />}
      />

      <Route
        path="/documentos-clinicos"
        element={<ClinicalDocuments />}
      />

      <Route path="/estoque" element={<Stock />} />

      <Route
        path="/evidencias-operacionais"
        element={<OperationalEvidence />}
      />

      <Route
        path="/financeiro"
        element={<Financial />}
      />
      <Route path="/financeiro/digitalizar" element={<FinancialScanner />} />

      <Route
        path="/indice-saude-clinica"
        element={<ClinicHealth />}
      />

      <Route
        path="/inteligencia-financeira"
        element={<ProfitIntelligence />}
      />

      <Route
        path="/jornada-paciente"
        element={<PatientJourney />}
      />

      <Route
        path="/laboratorio"
        element={<Laboratory />}
      />

      <Route path="/marketing" element={<Marketing />} />

      <Route
        path="/notificacoes"
        element={<Notifications />}
      />

      <Route
        path="/operacional"
        element={<Operations />}
      />

      <Route
        path="/orcamentos-tratamentos"
        element={<TreatmentPlanning />}
      />

      <Route
        path="/painel-atendimentos"
        element={<PatientFlow />}
      />

      <Route
        path="/painel-executivo"
        element={<ExecutiveDashboard />}
      />

      <Route path="/pagamentos" element={<PaymentCenter />} />

      <Route path="/revah" element={<Revah />} />

      <Route path="/pacientes" element={<Patients />} />

      <Route
        path="/prontuario"
        element={<ClinicalRecord />}
      />

      <Route path="/recall" element={<Recall />} />

      <Route path="/relatorios" element={<Reports />} />

      <Route path="/rh" element={<HumanResources />} />

      <Route
        path="/sugestoes-problemas"
        element={<Feedback />}
      />

      <Route path="/plataforma-saas" element={<PlatformAdministration />} />
      <Route path="/revah-leads" element={<LeadDiscovery />} />
      <Route path="/integracoes" element={<Integrations />} />

      {/* DENTALPOS DESIGN */}
      <Route
        path="/design"
        element={<DentalPosDesign />}
      />

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}