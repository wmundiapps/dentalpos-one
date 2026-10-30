import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Box, Typography } from "@mui/material";

const Academic = lazy(() => import("../pages/Academic"));
const FacialReception = lazy(() => import("../pages/FacialReception"));
const StockPartners = lazy(() => import("../pages/StockPartners"));
const DailyCash = lazy(() => import("../pages/DailyCash"));
const CondoSplit = lazy(() => import("../pages/CondoSplit"));
const Accounting = lazy(() => import("../pages/Accounting"));
const Agenda = lazy(() => import("../pages/Agenda"));
const Backup = lazy(() => import("../pages/Backup"));
const Backoffice = lazy(() => import("../pages/Backoffice"));
const Benchmark = lazy(() => import("../pages/Benchmark"));
const BusinessIntelligence = lazy(() => import("../pages/BusinessIntelligence"));
const ClinicHealth = lazy(() => import("../pages/ClinicHealth"));
const Clinics = lazy(() => import("../pages/Clinics"));
const ClinicalDocuments = lazy(() => import("../pages/ClinicalDocuments"));
const BrandKit = lazy(() => import("../pages/BrandKit"));
const ClinicalRecord = lazy(() => import("../pages/ClinicalRecord"));
const PatientFile = lazy(() => import("../pages/PatientFile"));
import WmundiStaffOnly from "../components/WmundiStaffOnly";
const ClinicalFiles = lazy(() => import("../pages/ClinicalFiles"));
const Scans = lazy(() => import("../pages/Scans"));
const OdontogramPeriodontogram = lazy(() => import("../pages/OdontogramPeriodontogram"));
const SurgeryImplantProsthesis = lazy(() => import("../pages/SurgeryImplantProsthesis"));
const SpecializedClinical = lazy(() => import("../pages/SpecializedClinical"));
const CommandCenter = lazy(() => import("../pages/CommandCenter"));
const Commercial = lazy(() => import("../pages/Commercial"));
const Communications = lazy(() => import("../pages/Communications"));
const CRM = lazy(() => import("../pages/CRM"));
const CRMKanban = lazy(() => import("../pages/CRMKanban"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const ExecutiveAssistant = lazy(() => import("../pages/ExecutiveAssistant"));
const ExecutiveDashboard = lazy(() => import("../pages/ExecutiveDashboard"));
const Feedback = lazy(() => import("../pages/Feedback"));
const ClinicalTeam = lazy(() => import("../pages/ClinicalTeam"));
const Channels = lazy(() => import("../pages/Channels"));
const AiAssistant = lazy(() => import("../pages/AiAssistant"));
const Credits = lazy(() => import("../pages/Credits"));
const Financial = lazy(() => import("../pages/Financial"));
const FinancialScanner = lazy(() => import("../pages/FinancialScanner"));
const FiscalAutomation = lazy(() => import("../pages/FiscalAutomation"));
const HumanResources = lazy(() => import("../pages/HumanResources"));
const MyTimeclock = lazy(() => import("../pages/MyTimeclock"));
const Laboratory = lazy(() => import("../pages/Laboratory"));
const Marketing = lazy(() => import("../pages/Marketing"));
const MarketingHub = lazy(() => import("../pages/MarketingHub"));
const Notifications = lazy(() => import("../pages/Notifications"));
const Operations = lazy(() => import("../pages/Operations"));
const OperationalEvidence = lazy(() => import("../pages/OperationalEvidence"));
const PatientFlow = lazy(() => import("../pages/PatientFlow"));
const PatientJourney = lazy(() => import("../pages/PatientJourney"));
const PaymentCenter = lazy(() => import("../pages/PaymentCenter"));
const Revah = lazy(() => import("../pages/Revah"));
const RevahChatbot = lazy(() => import("../pages/RevahChatbot"));
const Patients = lazy(() => import("../pages/Patients"));
const ProfitIntelligence = lazy(() => import("../pages/ProfitIntelligence"));
const Recall = lazy(() => import("../pages/Recall"));
const Reports = lazy(() => import("../pages/Reports"));
const ServiceEvaluations = lazy(() => import("../pages/ServiceEvaluations"));
const Sales = lazy(() => import("../pages/Sales"));
const Settings = lazy(() => import("../pages/Settings"));
const Stock = lazy(() => import("../pages/Stock"));
const TreatmentPlanning = lazy(() => import("../pages/TreatmentPlanning"));
const PlatformAdministration = lazy(() => import("../pages/PlatformAdministration"));
const LeadDiscovery = lazy(() => import("../pages/LeadDiscovery"));
const Prospecting = lazy(() => import("../pages/Prospecting"));
const Integrations = lazy(() => import("../pages/Integrations"));
const ImportPatients = lazy(() => import("../pages/ImportPatients"));
const ImportData = lazy(() => import("../pages/ImportData"));
const LabServiceOrders = lazy(() => import("../pages/LabServiceOrders"));
const Team = lazy(() => import("../pages/Team"));
const Permissions = lazy(() => import("../pages/Permissions"));
const OnlineReceipts = lazy(() => import("../pages/OnlineReceipts"));
const Homologation = lazy(() => import("../pages/Homologation"));

// Design oculto (sigilo): import preservado para retomar depois.
// import DentalPosDesign from "../dentalpos-design/pages/DentalPosDesign";
import {
  getDemoModuleStatus,
  moduleForPath,
  readDemoAccess,
} from "../services/DemoAccess";

function DemoInDevelopmentPage() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: "60vh",
        textAlign: "center",
        px: 3,
      }}
    >
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 1.5 }}>
        Em desenvolvimento
      </Typography>
      <Typography sx={{ color: "text.secondary", maxWidth: 420 }}>
        Esta funcionalidade está em desenvolvimento e será disponibilizada em breve no CompletoDonto.
      </Typography>
    </Box>
  );
}

export default function AppRoutes() {
  const location = useLocation();
  const demo = readDemoAccess();

  if (demo?.isDemo) {
    const moduleName = moduleForPath(location.pathname);
    // Só intercepta rotas reconhecidas e explicitamente marcadas como em
    // desenvolvimento. URLs inexistentes seguem para o catch-all "*" abaixo.
    if (moduleName) {
      const status = getDemoModuleStatus(location.pathname, demo);
      if (status === "EM_DESENVOLVIMENTO") {
        return <DemoInDevelopmentPage />;
      }
    }
  }

  return (
    <Suspense fallback={<Box sx={{ p: 4 }}><Typography color="text.secondary">Carregando...</Typography></Box>}>
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

      <Route path="/backup" element={<WmundiStaffOnly><Backup /></WmundiStaffOnly>} />

      <Route path="/benchmark" element={<Benchmark />} />

      <Route path="/backoffice" element={<Backoffice />} />

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

      <Route
        path="/kit-clinica"
        element={<BrandKit />}
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

      <Route path="/chegada-por-rosto" element={<FacialReception />} />
      <Route path="/fechamento-caixa" element={<DailyCash />} />
      <Route path="/rateio-condominio" element={<CondoSplit />} />

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
      <Route path="/marketing/central" element={<MarketingHub />} />

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

      <Route path="/revah-chatbot" element={<RevahChatbot />} />

      <Route path="/pacientes" element={<Patients />} />
      <Route path="/ficha-paciente" element={<PatientFile />} />

      <Route
        path="/prontuario"
        element={<ClinicalRecord />}
      />
      <Route path="/odontograma-periodontograma" element={<OdontogramPeriodontogram />} />
      <Route path="/arquivos-exames-clinicos" element={<ClinicalFiles />} />
      <Route path="/escaneamentos" element={<Scans />} />
      <Route path="/cirurgia-implantes-protese" element={<SurgeryImplantProsthesis />} />
      <Route path="/clinico-especializado" element={<SpecializedClinical />} />

      <Route path="/corpo-clinico" element={<ClinicalTeam />} />
      <Route path="/canais-envio" element={<Channels />} />
        <Route path="/assistente-ia" element={<AiAssistant />} />
        <Route path="/creditos" element={<Credits />} />
      <Route path="/recall" element={<Recall />} />

      <Route path="/relatorios" element={<Reports />} />

      <Route path="/rh" element={<HumanResources />} />
      <Route path="/meu-ponto" element={<MyTimeclock />} />

      <Route
        path="/sugestoes-problemas"
        element={<Feedback />}
      />

      <Route path="/plataforma-saas" element={<PlatformAdministration />} />
      <Route path="/revah-leads" element={<LeadDiscovery />} />
      <Route path="/parceiros-estoque" element={<WmundiStaffOnly><StockPartners /></WmundiStaffOnly>} />
      <Route path="/prospeccao" element={<WmundiStaffOnly><Prospecting /></WmundiStaffOnly>} />
      <Route path="/integracoes" element={<Integrations />} />
      <Route path="/importar-pacientes" element={<ImportPatients />} />
      <Route path="/importar-dados" element={<ImportData />} />
      <Route path="/ordens-laboratorio" element={<LabServiceOrders />} />
      <Route path="/equipe" element={<Team />} />
      <Route path="/permissoes" element={<Permissions />} />
      <Route path="/recebimentos-online" element={<OnlineReceipts />} />
      <Route path="/homologacao" element={<WmundiStaffOnly><Homologation /></WmundiStaffOnly>} />

      <Route
        path="/design"
        element={<Navigate to="/" replace />}
      />

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
    </Suspense>
  );
}