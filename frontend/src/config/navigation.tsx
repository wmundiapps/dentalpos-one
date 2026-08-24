import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AssessmentIcon from "@mui/icons-material/Assessment";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BackupIcon from "@mui/icons-material/Backup";
import BalanceIcon from "@mui/icons-material/Balance";
import BiotechIcon from "@mui/icons-material/Biotech";
import BugReportIcon from "@mui/icons-material/BugReport";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import CampaignIcon from "@mui/icons-material/Campaign";
import ChatIcon from "@mui/icons-material/Chat";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
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
import CreditCardIcon from "@mui/icons-material/CreditCard";
import SettingsIcon from "@mui/icons-material/Settings";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import ViewKanbanIcon from "@mui/icons-material/ViewKanban";
import WorkIcon from "@mui/icons-material/Work";

import type { ReactNode } from "react";

export interface NavigationItem {
  label: string;
  path: string;
  icon: ReactNode;
}

export const navigationItems: NavigationItem[] = [
  {
    label: "Acadêmico",
    path: "/academico",
    icon: <SchoolIcon />,
  },
  {
    label: "Agenda",
    path: "/agenda",
    icon: <EventIcon />,
  },
  {
    label: "Automação Fiscal",
    path: "/automacao-fiscal",
    icon: <ReceiptLongIcon />,
  },
  {
    label: "Avaliação do Atendimento",
    path: "/avaliacoes-atendimento",
    icon: <RateReviewIcon />,
  },
  {
    label: "Backup",
    path: "/backup",
    icon: <BackupIcon />,
  },
  {
    label: "Benchmark",
    path: "/benchmark",
    icon: <BalanceIcon />,
  },
  {
    label: "CEO IA",
    path: "/ceo-ia",
    icon: <AutoAwesomeIcon />,
  },
  {
    label: "Centro de Comando",
    path: "/centro-de-comando",
    icon: <HubIcon />,
  },
  {
    label: "Centro de Inteligência",
    path: "/centro-de-inteligencia",
    icon: <InsightsIcon />,
  },
  {
    label: "Clínicas",
    path: "/clinicas",
    icon: <LocalHospitalIcon />,
  },
  {
    label: "Comercial",
    path: "/comercial",
    icon: <PointOfSaleIcon />,
  },
  {
    label: "Comunicações",
    path: "/comunicacoes",
    icon: <ChatIcon />,
  },
  {
    label: "Configurações",
    path: "/configuracoes",
    icon: <SettingsIcon />,
  },
  {
    label: "Contábil e Fiscal",
    path: "/contabil-fiscal",
    icon: <AccountBalanceIcon />,
  },
  {
    label: "CRM",
    path: "/crm",
    icon: <ViewKanbanIcon />,
  },
  {
    label: "CRM Inteligente",
    path: "/crm-inteligente",
    icon: <PsychologyIcon />,
  },
  {
    label: "Dashboard",
    path: "/",
    icon: <DashboardIcon />,
  },
  {
    label: "DentalPos Design",
    path: "/design",
    icon: <DesignServicesIcon />,
  },
  {
    label: "DentalPos Sales",
    path: "/sales",
    icon: <PointOfSaleIcon />,
  },
  {
    label: "Documentos Clínicos",
    path: "/documentos-clinicos",
    icon: <DescriptionIcon />,
  },
  {
    label: "Estoque",
    path: "/estoque",
    icon: <Inventory2Icon />,
  },
  {
    label: "Evidências Operacionais",
    path: "/evidencias-operacionais",
    icon: <CameraAltIcon />,
  },
  {
    label: "Financeiro",
    path: "/financeiro",
    icon: <PaymentsIcon />,
  },
  {
    label: "Digitalizar Financeiro",
    path: "/financeiro/digitalizar",
    icon: <ReceiptLongIcon />,
  },
  {
    label: "Gestão Operacional",
    path: "/operacional",
    icon: <CleaningServicesIcon />,
  },
  {
    label: "Índice de Saúde da Clínica",
    path: "/indice-saude-clinica",
    icon: <HealthAndSafetyIcon />,
  },
  {
    label: "Inteligência Financeira",
    path: "/inteligencia-financeira",
    icon: <MonetizationOnIcon />,
  },
  {
    label: "Jornada do Paciente",
    path: "/jornada-paciente",
    icon: <AccountTreeIcon />,
  },
  {
    label: "Laboratório",
    path: "/laboratorio",
    icon: <BiotechIcon />,
  },
  {
    label: "Marketing",
    path: "/marketing",
    icon: <CampaignIcon />,
  },
  {
    label: "Orçamentos e Tratamentos",
    path: "/orcamentos-tratamentos",
    icon: <RequestQuoteIcon />,
  },
  {
    label: "Painel de Atendimentos",
    path: "/painel-atendimentos",
    icon: <GroupsIcon />,
  },
  {
    label: "Painel Executivo",
    path: "/painel-executivo",
    icon: <SpaceDashboardIcon />,
  },
  {
    label: "Pacientes",
    path: "/pacientes",
    icon: <PeopleAltIcon />,
  },
  {
    label: "Prontuário",
    path: "/prontuario",
    icon: <FolderSharedIcon />,
  },
  {
    label: "Recall e Reativação",
    path: "/recall",
    icon: <CampaignIcon />,
  },
  {
    label: "Pagamentos e Recebimentos",
    path: "/pagamentos",
    icon: <CreditCardIcon />,
  },
  {
    label: "REVAH",
    path: "/revah",
    icon: <SendIcon />,
  },
  {
    label: "Relatórios",
    path: "/relatorios",
    icon: <AssessmentIcon />,
  },
  {
    label: "RH e Gestão de Pessoas",
    path: "/rh",
    icon: <WorkIcon />,
  },
  {
    label: "Sugestões e Problemas",
    path: "/sugestoes-problemas",
    icon: <BugReportIcon />,
  },
];