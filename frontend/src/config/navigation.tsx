import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AssessmentIcon from "@mui/icons-material/Assessment";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BackupIcon from "@mui/icons-material/Backup";
import BalanceIcon from "@mui/icons-material/Balance";
import BiotechIcon from "@mui/icons-material/Biotech";
import BugReportIcon from "@mui/icons-material/BugReport";
import CampaignIcon from "@mui/icons-material/Campaign";
import ChatIcon from "@mui/icons-material/Chat";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import DashboardIcon from "@mui/icons-material/Dashboard";
import DescriptionIcon from "@mui/icons-material/Description";
import DesignServicesIcon from "@mui/icons-material/DesignServices";
import EventIcon from "@mui/icons-material/Event";
import FolderSharedIcon from "@mui/icons-material/FolderShared";
import GroupsIcon from "@mui/icons-material/Groups";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import HubIcon from "@mui/icons-material/Hub";
import InsightsIcon from "@mui/icons-material/Insights";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import PaymentsIcon from "@mui/icons-material/Payments";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import PsychologyIcon from "@mui/icons-material/Psychology";
import RateReviewIcon from "@mui/icons-material/RateReview";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import SchoolIcon from "@mui/icons-material/School";
import SendIcon from "@mui/icons-material/Send";
import SettingsIcon from "@mui/icons-material/Settings";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import ViewKanbanIcon from "@mui/icons-material/ViewKanban";
import WorkIcon from "@mui/icons-material/Work";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import StorefrontIcon from "@mui/icons-material/Storefront";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import ScienceIcon from "@mui/icons-material/Science";
import type { ReactNode } from "react";

export interface NavigationItem {
  label: string;
  path: string;
  icon: ReactNode;
}

export interface NavigationGroup {
  label: string;
  icon: ReactNode;
  items: NavigationItem[];
}

const item = (label: string, path: string, icon: ReactNode): NavigationItem => ({ label, path, icon });
const alphabetical = (items: NavigationItem[]) => [...items].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Recepção",
    icon: <SupportAgentIcon />,
    items: alphabetical([
      item("Agenda", "/agenda", <EventIcon />),
      item("Agendamento online", "/agenda", <EventIcon />),
      item("Avaliação do Atendimento", "/avaliacoes-atendimento", <RateReviewIcon />),
      item("Cobranças", "/pagamentos", <CreditCardIcon />),
      item("Comunicações", "/comunicacoes", <ChatIcon />),
      item("Financeiro do paciente", "/financeiro", <PaymentsIcon />),
      item("Jornada do Paciente", "/jornada-paciente", <HubIcon />),
      item("Pacientes", "/pacientes", <PeopleAltIcon />),
      item("REVAH", "/revah", <SendIcon />),
      item("Recall e Reativação", "/recall", <CampaignIcon />),
    ]),
  },
  {
    label: "Sala de Atendimento",
    icon: <LocalHospitalIcon />,
    items: alphabetical([
      item("Agenda clínica", "/agenda", <EventIcon />),
      item("DentalPos AI", "/ceo-ia", <AutoAwesomeIcon />),
      item("DentalPos Design", "/design", <DesignServicesIcon />),
      item("Documentos Clínicos", "/documentos-clinicos", <DescriptionIcon />),
      item("Laboratório", "/laboratorio", <BiotechIcon />),
      item("Orçamentos e Tratamentos", "/orcamentos-tratamentos", <RequestQuoteIcon />),
      item("Painel de Atendimentos", "/painel-atendimentos", <GroupsIcon />),
      item("Prontuário", "/prontuario", <FolderSharedIcon />),
    ]),
  },
  {
    label: "Marketing e Relacionamento",
    icon: <CampaignIcon />,
    items: alphabetical([
      item("CRM", "/crm", <ViewKanbanIcon />),
      item("CRM Inteligente", "/crm-inteligente", <PsychologyIcon />),
      item("Jornada do Paciente", "/jornada-paciente", <HubIcon />),
      item("Marketing", "/marketing", <CampaignIcon />),
      item("REVAH", "/revah", <SendIcon />),
      item("REVAH Chatbot", "/revah-chatbot", <ChatIcon />),
      item("REVAH Leads", "/revah-leads", <PeopleAltIcon />),
      item("Relatórios", "/relatorios", <AssessmentIcon />),
    ]),
  },
  {
    label: "Administrativo",
    icon: <AdminPanelSettingsIcon />,
    items: alphabetical([
      item("Automação Fiscal", "/automacao-fiscal", <ReceiptLongIcon />),
      item("Backoffice Integrado", "/backoffice", <AccountBalanceIcon />),
      item("Contábil e Fiscal", "/contabil-fiscal", <AccountBalanceIcon />),
      item("Contas a Pagar", "/financeiro?tipo=Despesa", <PaymentsIcon />),
      item("Contas a Receber", "/financeiro?tipo=Receita", <PaymentsIcon />),
      item("Digitalizar Financeiro", "/financeiro/digitalizar", <ReceiptLongIcon />),
      item("Evidências Operacionais", "/evidencias-operacionais", <DescriptionIcon />),
      item("Financeiro", "/financeiro", <PaymentsIcon />),
      item("Gestão Operacional", "/operacional", <CleaningServicesIcon />),
      item("Pagamentos e Recebimentos", "/pagamentos", <CreditCardIcon />),
      item("Portal do Contador", "/backoffice?secao=contador", <AccountBalanceIcon />),
      item("RH e Gestão de Pessoas", "/rh", <WorkIcon />),
    ]),
  },
  {
    label: "Gestão",
    icon: <DashboardIcon />,
    items: alphabetical([
      item("Benchmark", "/benchmark", <BalanceIcon />),
      item("Centro de Comando", "/centro-de-comando", <HubIcon />),
      item("Centro de Inteligência", "/centro-de-inteligencia", <InsightsIcon />),
      item("Dashboard", "/", <DashboardIcon />),
      item("Índice de Saúde da Clínica", "/indice-saude-clinica", <HealthAndSafetyIcon />),
      item("Inteligência Financeira", "/inteligencia-financeira", <MonetizationOnIcon />),
      item("Painel Executivo", "/painel-executivo", <SpaceDashboardIcon />),
      item("Relatórios", "/relatorios", <AssessmentIcon />),
    ]),
  },
  {
    label: "Laboratório",
    icon: <ScienceIcon />,
    items: alphabetical([
      item("DentalPos Design", "/design", <DesignServicesIcon />),
      item("Laboratório", "/laboratorio", <BiotechIcon />),
    ]),
  },
  {
    label: "Comercial",
    icon: <StorefrontIcon />,
    items: alphabetical([
      item("Comercial", "/comercial", <PointOfSaleIcon />),
      item("CRM", "/crm", <ViewKanbanIcon />),
      item("DentalPos Sales", "/sales", <PointOfSaleIcon />),
      item("Estoque", "/estoque", <Inventory2Icon />),
      item("REVAH Leads", "/revah-leads", <PeopleAltIcon />),
    ]),
  },
  {
    label: "Acadêmico",
    icon: <SchoolIcon />,
    items: alphabetical([
      item("Acadêmico", "/academico", <SchoolIcon />),
    ]),
  },
  {
    label: "Configurações",
    icon: <SettingsIcon />,
    items: alphabetical([
      item("Backup", "/backup", <BackupIcon />),
      item("Clínicas e unidades", "/clinicas", <LocalHospitalIcon />),
      item("Configurações", "/configuracoes", <SettingsIcon />),
      item("Integrações", "/integracoes", <HubIcon />),
      item("Plataforma SaaS", "/plataforma-saas", <SettingsIcon />),
      item("Sugestões e Problemas", "/sugestoes-problemas", <BugReportIcon />),
    ]),
  },
];

export const navigationItems = navigationGroups.flatMap((group) => group.items);
