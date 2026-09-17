import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AssessmentIcon from "@mui/icons-material/Assessment";
import AssignmentIcon from "@mui/icons-material/Assignment";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BarChartIcon from "@mui/icons-material/BarChart";
import BiotechIcon from "@mui/icons-material/Biotech";
import BugReportIcon from "@mui/icons-material/BugReport";
import ChatIcon from "@mui/icons-material/Chat";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import DashboardIcon from "@mui/icons-material/Dashboard";
import DescriptionIcon from "@mui/icons-material/Description";
import DesignServicesIcon from "@mui/icons-material/DesignServices";
import EventIcon from "@mui/icons-material/Event";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
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
import SettingsInputAntennaIcon from "@mui/icons-material/SettingsInputAntenna";
import SettingsIcon from "@mui/icons-material/Settings";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import WorkIcon from "@mui/icons-material/Work";
import { Box } from "@mui/material";
import { createSvgIcon } from "@mui/material/utils";
import type { ReactNode } from "react";

export interface NavigationItem { label: string; path: string; icon: ReactNode; }
export interface NavigationGroup { label: string; icon: ReactNode; items: NavigationItem[]; }

const item = (label:string,path:string,icon:ReactNode):NavigationItem => ({label,path,icon});
const alphabetical = (items:NavigationItem[]) => [...items].sort((a,b)=>a.label.localeCompare(b.label,"pt-BR"));

const ToothIcon = createSvgIcon(
  <path d="M7.5 2C5 2 3 4 3 6.8c0 1.7.6 3 1.2 4.3.5 1.1.8 2.4 1 3.9l.6 4.6c.2 1.4 1 2.4 2 2.4s1.6-.9 1.9-2.3l.6-3.2c.2-.9.9-1.5 1.7-1.5s1.5.6 1.7 1.5l.6 3.2c.3 1.4.9 2.3 1.9 2.3s1.8-1 2-2.4l.6-4.6c.2-1.5.5-2.8 1-3.9.6-1.3 1.2-2.6 1.2-4.3C21 4 19 2 16.5 2c-1.6 0-2.8.8-4.5.8S9.1 2 7.5 2z" />,
  "Tooth",
);

/** Icone do grupo: quadrado colorido com simbolo branco (legivel no menu escuro e no item selecionado). */
const tile = (icon: ReactNode, color: string): ReactNode => (
  <Box component="span" sx={{ width: 26, height: 26, borderRadius: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", background: `linear-gradient(135deg, ${color}B3, ${color})`, boxShadow: `0 2px 6px ${color}66`, "& svg": { fontSize: 17 } }}>
    {icon}
  </Box>
);

/**
 * Regra 5787 (mantida):
 * - cada funcionalidade aparece UMA vez no menu;
 * - Marketing/REVAH concentra CRM e relacionamento;
 * - Financeiro e Administrativo sao grupos separados (relatorios cruzados ficam em Gestao);
 * - Laboratorio e Design ficam so em Clinico;
 * - Relatorios ficam so em Gestao.
 */
export const navigationGroups:NavigationGroup[] = [
  {
    label:"Recep\u00e7\u00e3o",
    icon:tile(<SupportAgentIcon/>,"#3B6FE0"),
    items:alphabetical([
      item("Agenda","/agenda",<EventIcon/>),
      item("Agendamento online","/agendamento-online",<EventIcon/>),
      item("Avalia\u00e7\u00e3o do Atendimento","/avaliacoes-atendimento",<RateReviewIcon/>),
      item("Painel de Atendimentos","/painel-atendimentos",<GroupsIcon/>),
      item("Pacientes","/pacientes",<PeopleAltIcon/>),
      item("Jornada do Paciente","/jornada-paciente",<HubIcon/>),
    ])
  },
  {
    label:"Cl\u00ednico",
    icon:tile(<ToothIcon/>,"#38A8E8"),
    items:alphabetical([
      item("Prontu\u00e1rio","/prontuario",<FolderSharedIcon/>),
      item("Documentos Cl\u00ednicos","/documentos-clinicos",<DescriptionIcon/>),
      item("Or\u00e7amentos e Tratamentos","/orcamentos-tratamentos",<RequestQuoteIcon/>),
      item("Laborat\u00f3rio","/laboratorio",<BiotechIcon/>),
      item("DentalPos AI","/ceo-ia",<AutoAwesomeIcon/>),
      item("DentalPos Design","/design",<DesignServicesIcon/>),
    ])
  },
  {
    label:"Marketing",
    icon:tile(<SendIcon/>,"#1FB894"),
    items:alphabetical([
      item("CRM","/crm",<HubIcon/>),
      item("Comunica\u00e7\u00f5es","/comunicacoes",<ChatIcon/>),
      item("Chatbot e IA","/revah-chatbot",<ChatIcon/>),
      item("Leads","/revah-leads",<PeopleAltIcon/>),
      item("Recall e Reativa\u00e7\u00e3o","/recall",<SendIcon/>),
      item("Central REVAH","/revah",<SendIcon/>),
      item("Canais de Envio","/canais-envio",<SettingsInputAntennaIcon/>),
    ])
  },
  {
    label:"Financeiro",
    icon:tile(<AccountBalanceWalletIcon/>,"#F0A020"),
    items:[
      item("Vis\u00e3o geral","/financeiro",<PaymentsIcon/>),
      item("Contas a Receber","/financeiro?tipo=Receita",<PaymentsIcon/>),
      item("Contas a Pagar","/financeiro?tipo=Despesa",<ReceiptLongIcon/>),
      item("Cobran\u00e7as","/pagamentos",<CreditCardIcon/>),
      item("Digitalizar Financeiro","/financeiro/digitalizar",<ReceiptLongIcon/>),
    ]
  },
  {
    label:"Administrativo",
    icon:tile(<AssignmentIcon/>,"#0E7C86"),
    items:alphabetical([
      item("Backoffice","/backoffice",<AccountBalanceIcon/>),
      item("Cont\u00e1bil e Fiscal","/contabil-fiscal",<AccountBalanceIcon/>),
      item("Automa\u00e7\u00e3o Fiscal","/automacao-fiscal",<ReceiptLongIcon/>),
      item("Evid\u00eancias Operacionais","/evidencias-operacionais",<DescriptionIcon/>),
      item("Gest\u00e3o Operacional","/operacional",<CleaningServicesIcon/>),
      item("RH e Gest\u00e3o de Pessoas","/rh",<WorkIcon/>),
      item("Registrar ponto","/rh?ponto=1",<FingerprintIcon/>),
    ])
  },
  {
    label:"Gest\u00e3o",
    icon:tile(<BarChartIcon/>,"#8B5CF6"),
    items:alphabetical([
      item("Dashboard","/",<DashboardIcon/>),
      item("Painel Executivo","/painel-executivo",<SpaceDashboardIcon/>),
      item("Centro de Comando","/centro-de-comando",<HubIcon/>),
      item("Centro de Intelig\u00eancia","/centro-de-inteligencia",<InsightsIcon/>),
      item("Intelig\u00eancia Financeira","/inteligencia-financeira",<MonetizationOnIcon/>),
      item("\u00cdndice de Sa\u00fade da Cl\u00ednica","/indice-saude-clinica",<HealthAndSafetyIcon/>),
      item("Benchmark","/benchmark",<AssessmentIcon/>),
      item("Relat\u00f3rios","/relatorios",<AssessmentIcon/>),
    ])
  },
  {
    label:"DentalPos Sales",
    icon:tile(<ShoppingBagIcon/>,"#E0457B"),
    items:alphabetical([
      item("Loja e Vendas","/sales",<PointOfSaleIcon/>),
      item("Estoque","/estoque",<Inventory2Icon/>),
    ])
  },
  {
    label:"Acad\u00eamico",
    icon:tile(<SchoolIcon/>,"#6366F1"),
    items:alphabetical([
      item("Vis\u00e3o geral","/academico",<SpaceDashboardIcon/>),
      item("Alunos","/academico?secao=alunos",<PeopleAltIcon/>),
      item("Cursos","/academico?secao=cursos",<SchoolIcon/>),
      item("Professores","/academico?secao=professores",<GroupsIcon/>),
      item("Turmas","/academico?secao=turmas",<EventIcon/>),
      item("Financeiro acad\u00eamico","/academico?secao=financeiro",<PaymentsIcon/>),
      item("Frequ\u00eancia e documentos","/academico?secao=documentos",<DescriptionIcon/>),
    ])
  },
  {
    label:"Configura\u00e7\u00f5es",
    icon:tile(<SettingsIcon/>,"#64748B"),
    items:alphabetical([
      item("Configura\u00e7\u00f5es","/configuracoes",<SettingsIcon/>),
      item("Cl\u00ednicas e unidades","/clinicas",<LocalHospitalIcon/>),
      item("Integra\u00e7\u00f5es","/integracoes",<HubIcon/>),
      item("Sugest\u00f5es e Problemas","/sugestoes-problemas",<BugReportIcon/>),
    ])
  }
];

export const navigationItems = navigationGroups.flatMap(g=>g.items);
