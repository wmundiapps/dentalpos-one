import { APP_NAME, EDU_ONLY } from "../config/appMode";
import { lazy, Suspense } from "react";
import AppErrorBoundary from "../components/AppErrorBoundary";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { readSessionUser } from "../services/DemoAccess";
import { Box, Typography } from "@mui/material";

const EduReitoria = lazy(() => import("../pages/edu/EduReitoria"));
const EduMinhaMesa = lazy(() => import("../pages/edu/EduMinhaMesa"));
const EduReitoriaGestao = lazy(() => import("../pages/edu/EduReitoriaGestao"));
const EduJornadas = lazy(() => import("../pages/edu/EduJornadas"));
const EduAdmissoes = lazy(() => import("../pages/edu/EduAdmissoes"));
const EduSecretaria = lazy(() => import("../pages/edu/EduSecretaria"));
const EduCalendario = lazy(() => import("../pages/edu/EduCalendario"));
const EduNotas = lazy(() => import("../pages/edu/EduNotas"));
const EduModalidades = lazy(() => import("../pages/edu/EduModalidades"));
const EduPolosEad = lazy(() => import("../pages/edu/EduPolosEad"));
const EduDesempenho = lazy(() => import("../pages/edu/EduDesempenho"));
const EduExames = lazy(() => import("../pages/edu/EduExames"));
const EduBiblioteca = lazy(() => import("../pages/edu/EduBiblioteca"));
const EduPresenca = lazy(() => import("../pages/edu/EduPresenca"));
const EduCamposPratica = lazy(() => import("../pages/edu/EduCamposPratica"));
const EduQuiosque = lazy(() => import("../pages/edu/EduQuiosque"));
const EduMinhaBiometria = lazy(() => import("../pages/edu/EduMinhaBiometria"));
const EduRegulatorio = lazy(() => import("../pages/edu/EduRegulatorio"));
const EduGovernanca = lazy(() => import("../pages/edu/EduGovernanca"));
const EduInfraestrutura = lazy(() => import("../pages/edu/EduInfraestrutura"));
const EduSuprimentos = lazy(() => import("../pages/edu/EduSuprimentos"));
const EduPesquisa = lazy(() => import("../pages/edu/EduPesquisa"));
const EduApoio = lazy(() => import("../pages/edu/EduApoio"));
const EduComunicacao = lazy(() => import("../pages/edu/EduComunicacao"));
const EduPortalAluno = lazy(() => import("../pages/edu/EduPortalAluno"));
const EduPortalProfessor = lazy(() => import("../pages/edu/EduPortalProfessor"));
const EduInicio = lazy(() => import("../pages/edu/EduInicio"));
const EduLgpd = lazy(() => import("../pages/edu/EduLgpd"));
const EduAcessoPorCargo = lazy(() => import("../pages/edu/EduAcessoPorCargo"));
const EduFinanceiro = lazy(() => import("../pages/edu/EduFinanceiro"));
const EduJuridico = lazy(() => import("../pages/edu/EduJuridico"));
const EduAtendimento = lazy(() => import("../pages/edu/EduAtendimento"));
const EduMensagens = lazy(() => import("../pages/edu/EduMensagens"));
const EduContabilAbertura = lazy(() => import("../pages/edu/EduContabilAbertura"));
const EduContabilRhDp = lazy(() => import("../pages/edu/EduContabilRhDp"));
const EduContabilIr = lazy(() => import("../pages/edu/EduContabilIr"));
const EduContabilAssistente = lazy(() => import("../pages/edu/EduContabilAssistente"));
const EduCarteira = lazy(() => import("../pages/edu/EduCarteira"));
const EduPortalContabil = lazy(() => import("../pages/edu/EduPortalContabil"));
const EduContabil = lazy(() => import("../pages/edu/EduContabil"));
const EduAnaliseDocs = lazy(() => import("../pages/edu/EduAnaliseDocs"));
const EduMarketing = lazy(() => import("../pages/edu/EduMarketing"));
const EduFeedback = lazy(() => import("../pages/edu/EduFeedback"));
const EduCobranca = lazy(() => import("../pages/edu/EduCobranca"));
const EduAlunos = lazy(() => import("../pages/edu/EduAlunos"));
const EduCriarAcessos = lazy(() => import("../pages/edu/EduCriarAcessos"));
const EduMatrizes = lazy(() => import("../pages/edu/EduMatrizes"));
const EduSalas = lazy(() => import("../pages/edu/EduSalas"));
const EduDesenvolvimento = lazy(() => import("../pages/edu/EduDesenvolvimento"));
const EduPesquisaExtensao = lazy(() => import("../pages/edu/EduPesquisaExtensao"));
const EduRh = lazy(() => import("../pages/edu/EduRh"));
const EduAlertas = lazy(() => import("../pages/edu/EduAlertas"));
const EduColaborador = lazy(() => import("../pages/edu/EduColaborador"));
const EduCipa = lazy(() => import("../pages/edu/EduCipa"));
const EduLavanderia = lazy(() => import("../pages/edu/EduLavanderia"));
const EduComprasRastreio = lazy(() => import("../pages/edu/EduComprasRastreio"));
const EduAcessoPolos = lazy(() => import("../pages/edu/EduAcessoPolos"));
const AccountSecurity = lazy(() => import("../pages/AccountSecurity"));
const SecurityEvents = lazy(() => import("../pages/SecurityEvents"));
const EduIdentity = lazy(() => import("../pages/EduIdentity"));
const EduSegurancaCertificacoes = lazy(() => import("../pages/edu/EduSegurancaCertificacoes"));
const EduDispositivos = lazy(() => import("../pages/edu/EduDispositivos"));

const Academic = lazy(() => import("../pages/Academic"));
const FacialReception = lazy(() => import("../pages/FacialReception"));
const StockPartners = lazy(() => import("../pages/StockPartners"));
const DailyCash = lazy(() => import("../pages/DailyCash"));
const Club = lazy(() => import("../pages/Club"));
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
const AlertDetail = lazy(() => import("../pages/AlertDetail"));
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
const FacePunchKiosk = lazy(() => import("../pages/FacePunchKiosk"));
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
const YearEndCampaign = lazy(() => import("../pages/YearEndCampaign"));
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
const Membership = lazy(() => import("../pages/Membership"));
const Homologation = lazy(() => import("../pages/Homologation"));
const PlatformActivity = lazy(() => import("../pages/PlatformActivity"));

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
        Esta funcionalidade está em desenvolvimento e será disponibilizada em breve no {APP_NAME}.
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
    <AppErrorBoundary resetKey={location.pathname}>
    <Suspense fallback={<Box sx={{ p: 4 }}><Typography color="text.secondary">Carregando…</Typography></Box>}>
    <Routes>
      <Route path="/" element={EDU_ONLY ? <Navigate to="/edu" replace /> : <Dashboard />} />

      <Route path="/academico" element={<Academic />} />
      <Route path="/edu" element={readSessionUser()?.role === "CLIENTE_CONTABIL" ? <Navigate to="/edu/contabil/portal" replace /> : readSessionUser()?.role === "STUDENT" ? <Navigate to="/edu/portal-aluno" replace /> : readSessionUser()?.role === "TEACHER" ? <Navigate to="/edu/portal-professor" replace /> : <EduReitoria />} />
      <Route path="/edu/minha-mesa" element={<EduMinhaMesa />} />
      {(["agenda", "dou", "paineis", "convenios", "pessoas", "niveis", "comparativo"] as const).map((s) => <Route key={s} path={`/edu/reitoria/${s}`} element={<EduReitoriaGestao secao={s} />} />)}
      <Route path="/edu/jornadas" element={<EduJornadas />} />
      <Route path="/edu/admissoes" element={<EduAdmissoes />} />
      <Route path="/edu/secretaria" element={<EduSecretaria />} />
      <Route path="/edu/calendario" element={<EduCalendario />} />
      <Route path="/edu/notas" element={<EduNotas />} />
      <Route path="/edu/modalidades" element={<EduModalidades />} />
      <Route path="/edu/polos-ead" element={<EduPolosEad />} />
      <Route path="/edu/desempenho" element={<EduDesempenho />} />
      <Route path="/edu/exames" element={<EduExames />} />
      <Route path="/edu/biblioteca" element={<EduBiblioteca />} />
      <Route path="/edu/campos-pratica" element={<EduCamposPratica />} />
      <Route path="/edu/presenca" element={<EduPresenca />} />
      <Route path="/edu/presenca/quiosque" element={<EduQuiosque />} />
      <Route path="/edu/minha-biometria" element={<EduMinhaBiometria />} />
      <Route path="/edu/regulatorio" element={<EduRegulatorio />} />
      <Route path="/edu/governanca" element={<EduGovernanca />} />
      <Route path="/edu/infraestrutura" element={<EduInfraestrutura />} />
      <Route path="/edu/suprimentos" element={<EduSuprimentos />} />
      <Route path="/edu/pesquisa" element={<EduPesquisa />} />
      <Route path="/edu/apoio" element={<EduApoio />} />
      <Route path="/edu/comunicacao" element={<EduComunicacao />} />
      <Route path="/edu/portal-aluno" element={<EduPortalAluno />} />
      <Route path="/edu/portal-professor" element={<EduPortalProfessor />} />
      <Route path="/edu/inicio" element={<EduInicio />} />
      <Route path="/edu/ambientes" element={<EduInicio />} />
      <Route path="/edu/identidade" element={<EduIdentity />} />
      <Route path="/edu/lgpd" element={<EduLgpd />} />
      <Route path="/edu/acesso-por-cargo" element={<EduAcessoPorCargo />} />
      <Route path="/edu/rh" element={<EduRh />} />
      <Route path="/edu/alertas" element={<EduAlertas />} />
      <Route path="/edu/alertas/ver" element={<EduAlertas detalhe />} />
      <Route path="/edu/colaborador" element={<EduColaborador />} />
      <Route path="/edu/cipa" element={<EduCipa />} />
      <Route path="/edu/lavanderia" element={<EduLavanderia />} />
      <Route path="/edu/compras-rastreio" element={<EduComprasRastreio />} />
      <Route path="/edu/acesso-polos" element={<EduAcessoPolos />} />
      <Route path="/edu/financeiro" element={<EduFinanceiro />} />
      <Route path="/edu/juridico" element={<EduJuridico />} />
      <Route path="/edu/atendimento" element={<EduAtendimento />} />
      <Route path="/edu/mensagens" element={<EduMensagens />} />
      <Route path="/edu/contabil/abertura" element={<EduContabilAbertura />} />
      <Route path="/edu/contabil/rh-dp" element={<EduContabilRhDp />} />
      <Route path="/edu/contabil/imposto-renda" element={<EduContabilIr />} />
      <Route path="/edu/contabil/assistente" element={<EduContabilAssistente />} />
      <Route path="/edu/contabil/carteira" element={<EduCarteira />} />
      <Route path="/edu/contabil/portal" element={<EduPortalContabil />} />
      <Route path="/edu/contabil" element={<EduContabil />} />
      <Route path="/edu/analise-docs" element={<EduAnaliseDocs />} />
      <Route path="/edu/marketing" element={<EduMarketing />} />
      <Route path="/edu/feedback" element={<EduFeedback />} />
      <Route path="/edu/cobranca" element={<EduCobranca />} />
      <Route path="/edu/academico/alunos" element={<EduAlunos />} />
      <Route path="/edu/academico/criar-acessos" element={<EduCriarAcessos />} />
      <Route path="/edu/academico/matrizes" element={<EduMatrizes />} />
      <Route path="/edu/academico/salas" element={<EduSalas />} />
      <Route path="/edu/academico/desenvolvimento" element={<EduDesenvolvimento />} />
      <Route path="/edu/academico/pesquisa-extensao" element={<EduPesquisaExtensao />} />
      <Route path="/seguranca" element={<AccountSecurity />} />
      <Route path="/seguranca/eventos" element={<SecurityEvents />} />


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
        path="/edu/seguranca-certificacoes"
        element={<EduSegurancaCertificacoes />}
      />

      <Route
        path="/edu/dispositivos"
        element={<EduDispositivos />}
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
      <Route path="/clube" element={<Club />} />
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
      <Route path="/alerta/:id" element={<AlertDetail />} />
      <Route path="/cirurgia-implantes-protese" element={<SurgeryImplantProsthesis />} />
      <Route path="/clinico-especializado" element={<SpecializedClinical />} />

      <Route path="/corpo-clinico" element={<ClinicalTeam />} />
      <Route path="/canais-envio" element={<Channels />} />
        <Route path="/assistente-ia" element={<AiAssistant />} />
        <Route path="/creditos" element={<Credits />} />
      <Route path="/recall" element={<Recall />} />
      <Route path="/campanha-final-de-ano" element={<YearEndCampaign />} />

      <Route path="/relatorios" element={<Reports />} />

      <Route path="/rh" element={<HumanResources />} />
      <Route path="/meu-ponto" element={<MyTimeclock />} />
      <Route path="/ponto-facial" element={<FacePunchKiosk />} />

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
      <Route path="/assinaturas" element={<Membership />} />
      <Route path="/homologacao" element={<WmundiStaffOnly><Homologation /></WmundiStaffOnly>} />
      <Route path="/atividade-teste" element={<WmundiStaffOnly><PlatformActivity /></WmundiStaffOnly>} />

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
    </AppErrorBoundary>
  );
}