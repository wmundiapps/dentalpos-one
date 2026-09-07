import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AssessmentIcon from "@mui/icons-material/Assessment";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BackupIcon from "@mui/icons-material/Backup";
import BiotechIcon from "@mui/icons-material/Biotech";
import BugReportIcon from "@mui/icons-material/BugReport";
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
import RateReviewIcon from "@mui/icons-material/RateReview";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import SchoolIcon from "@mui/icons-material/School";
import SendIcon from "@mui/icons-material/Send";
import SettingsIcon from "@mui/icons-material/Settings";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import StorefrontIcon from "@mui/icons-material/Storefront";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import WorkIcon from "@mui/icons-material/Work";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import type { ReactNode } from "react";

export interface NavigationItem { label: string; path: string; icon: ReactNode; }
export interface NavigationGroup { label: string; icon: ReactNode; items: NavigationItem[]; }

const item = (label:string,path:string,icon:ReactNode):NavigationItem => ({label,path,icon});
const alphabetical = (items:NavigationItem[]) => [...items].sort((a,b)=>a.label.localeCompare(b.label,"pt-BR"));

/**
 * Regra 5787:
 * - cada funcionalidade aparece UMA vez no menu;
 * - REVAH concentra CRM/marketing/relacionamento;
 * - Financeiro não se repete em Recepção/Administrativo;
 * - Laboratório e Design ficam só em Clínica;
 * - Relatórios ficam só em Gestão;
 * - menu compacto e mais panorâmico.
 */
export const navigationGroups:NavigationGroup[] = [
  {
    label:"Recepção",
    icon:<SupportAgentIcon/>,
    items:alphabetical([
      item("Agenda","/agenda",<EventIcon/>),
      item("Agendamento online","/agendamento-online",<EventIcon/>),
      item("Avaliação do Atendimento","/avaliacoes-atendimento",<RateReviewIcon/>),
      item("Painel de Atendimentos","/painel-atendimentos",<GroupsIcon/>),
      item("Pacientes","/pacientes",<PeopleAltIcon/>),
      item("Jornada do Paciente","/jornada-paciente",<HubIcon/>),
    ])
  },
  {
    label:"Clínico",
    icon:<LocalHospitalIcon/>,
    items:alphabetical([
      item("Prontuário","/prontuario",<FolderSharedIcon/>),
      item("Documentos Clínicos","/documentos-clinicos",<DescriptionIcon/>),
      item("Orçamentos e Tratamentos","/orcamentos-tratamentos",<RequestQuoteIcon/>),
      item("Laboratório","/laboratorio",<BiotechIcon/>),
      item("DentalPos AI","/ceo-ia",<AutoAwesomeIcon/>),
      item("DentalPos Design","/design",<DesignServicesIcon/>),
    ])
  },
  {
    label:"REVAH",
    icon:<SendIcon/>,
    items:alphabetical([
      item("CRM","/crm",<HubIcon/>),
      item("Comunicações","/comunicacoes",<ChatIcon/>),
      item("Chatbot e IA","/revah-chatbot",<ChatIcon/>),
      item("Leads","/revah-leads",<PeopleAltIcon/>),
      item("Recall e Reativação","/recall",<SendIcon/>),
      item("Central REVAH","/revah",<SendIcon/>),
    ])
  },
  {
    label:"Financeiro e Administrativo",
    icon:<AccountBalanceIcon/>,
    items:alphabetical([
      item("Financeiro","/financeiro",<PaymentsIcon/>),
      item("Cobranças","/pagamentos",<CreditCardIcon/>),
      item("Digitalizar Financeiro","/financeiro/digitalizar",<ReceiptLongIcon/>),
      item("Backoffice","/backoffice",<AccountBalanceIcon/>),
      item("Contábil e Fiscal","/contabil-fiscal",<AccountBalanceIcon/>),
      item("Automação Fiscal","/automacao-fiscal",<ReceiptLongIcon/>),
      item("Evidências Operacionais","/evidencias-operacionais",<DescriptionIcon/>),
      item("Gestão Operacional","/operacional",<CleaningServicesIcon/>),
      item("RH e Gestão de Pessoas","/rh",<WorkIcon/>),
      item("Registrar ponto","/rh?ponto=1",<FingerprintIcon/>),
    ])
  },
  {
    label:"Gestão",
    icon:<DashboardIcon/>,
    items:alphabetical([
      item("Dashboard","/",<DashboardIcon/>),
      item("Painel Executivo","/painel-executivo",<SpaceDashboardIcon/>),
      item("Centro de Comando","/centro-de-comando",<HubIcon/>),
      item("Centro de Inteligência","/centro-de-inteligencia",<InsightsIcon/>),
      item("Inteligência Financeira","/inteligencia-financeira",<MonetizationOnIcon/>),
      item("Índice de Saúde da Clínica","/indice-saude-clinica",<HealthAndSafetyIcon/>),
      item("Benchmark","/benchmark",<AssessmentIcon/>),
      item("Relatórios","/relatorios",<AssessmentIcon/>),
    ])
  },
  {
    label:"DentalPos Sales",
    icon:<StorefrontIcon/>,
    items:alphabetical([
      item("Loja e Vendas","/sales",<PointOfSaleIcon/>),
      item("Estoque","/estoque",<Inventory2Icon/>),
    ])
  },
  {
    label:"Acadêmico",
    icon:<SchoolIcon/>,
    items:alphabetical([
      item("Visão geral","/academico",<SpaceDashboardIcon/>),
      item("Alunos","/academico?secao=alunos",<PeopleAltIcon/>),
      item("Cursos","/academico?secao=cursos",<SchoolIcon/>),
      item("Professores","/academico?secao=professores",<GroupsIcon/>),
      item("Turmas","/academico?secao=turmas",<EventIcon/>),
      item("Financeiro acadêmico","/academico?secao=financeiro",<PaymentsIcon/>),
      item("Frequência e documentos","/academico?secao=documentos",<DescriptionIcon/>),
    ])
  },
  {
    label:"Configurações",
    icon:<SettingsIcon/>,
    items:alphabetical([
      item("Configurações","/configuracoes",<SettingsIcon/>),
      item("Clínicas e unidades","/clinicas",<LocalHospitalIcon/>),
      item("Integrações","/integracoes",<HubIcon/>),
      item("Homologação e Segurança","/homologacao",<VerifiedUserIcon/>),
      item("Backup","/backup",<BackupIcon/>),
      item("Sugestões e Problemas","/sugestoes-problemas",<BugReportIcon/>),
    ])
  }
];

export const navigationItems = navigationGroups.flatMap(g=>g.items);
