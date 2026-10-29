import { EDU_ONLY } from "./appMode";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AssessmentIcon from "@mui/icons-material/Assessment";
import HowToRegIcon from "@mui/icons-material/HowToReg";
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
// import DesignServicesIcon from "@mui/icons-material/DesignServices"; // DPD oculto
import EventIcon from "@mui/icons-material/Event";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import FolderSharedIcon from "@mui/icons-material/FolderShared";
import GroupsIcon from "@mui/icons-material/Groups";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import HubIcon from "@mui/icons-material/Hub";
import InsightsIcon from "@mui/icons-material/Insights";
import GavelIcon from "@mui/icons-material/Gavel";
import HandshakeIcon from "@mui/icons-material/Handshake";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import ShieldIcon from "@mui/icons-material/Shield";
import CampaignIcon from "@mui/icons-material/Campaign";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import PublicIcon from "@mui/icons-material/Public";
import RadioIcon from "@mui/icons-material/Radio";
import GppGoodIcon from "@mui/icons-material/GppGood";
import LocationCityIcon from "@mui/icons-material/LocationCity";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import AgricultureIcon from "@mui/icons-material/Agriculture";
import PetsIcon from "@mui/icons-material/Pets";
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
import PrivacyTipIcon from "@mui/icons-material/PrivacyTip";
import RequestPageIcon from "@mui/icons-material/RequestPage";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import WorkIcon from "@mui/icons-material/Work";
import BadgeIcon from "@mui/icons-material/Badge";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import MedicalServicesIcon from "@mui/icons-material/MedicalServices";
import BeachAccessIcon from "@mui/icons-material/BeachAccess";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import MedicalInformationIcon from "@mui/icons-material/MedicalInformation";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
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
 * - Laboratorio e um botao proprio no menu (visivel, sem submenu); Design fica so em Clinico;
 * - Relatorios ficam so em Gestao.
 */
const allNavigationGroups:NavigationGroup[] = [
  {
    label:"Recepção",
    icon:tile(<SupportAgentIcon/>,"#3B6FE0"),
    items:alphabetical([
      item("Agenda","/agenda",<EventIcon/>),
      item("Agendamento online","/agendamento-online",<EventIcon/>),
      item("Equipe","/equipe",<GroupsIcon/>),
      item("Avaliação do Atendimento","/avaliacoes-atendimento",<RateReviewIcon/>),
      item("Painel de Atendimentos","/painel-atendimentos",<GroupsIcon/>),
      item("Pacientes","/pacientes",<PeopleAltIcon/>),
      item("Jornada do Paciente","/jornada-paciente",<HubIcon/>),
    ])
  },
  {
    label:"Clínico",
    icon:tile(<ToothIcon/>,"#38A8E8"),
    items:alphabetical([
      item("Prontuário","/prontuario",<FolderSharedIcon/>),
      item("Documentos Clínicos","/documentos-clinicos",<DescriptionIcon/>),
      item("Orçamentos e Tratamentos","/orcamentos-tratamentos",<RequestQuoteIcon/>),
      item("Equipe","/equipe",<GroupsIcon/>),
      item("DentalPos AI","/ceo-ia",<AutoAwesomeIcon/>),
      item("Assistente de IA","/assistente-ia",<AutoAwesomeIcon/>),
      // DPD oculto do menu em 20/09 por decisao do Robson. Rota e dados preservados.
            // item("DentalPos Design","/design",<DesignServicesIcon/>),
    ])
  },
  {
    label:"Laboratório",
    icon:tile(<BiotechIcon/>,"#8B5CF6"),
    items:[
      item("Laboratório","/laboratorio",<BiotechIcon/>),
    ]
  },
  {
    label:"Marketing",
    icon:tile(<SendIcon/>,"#1FB894"),
    items:alphabetical([
      item("CRM","/crm",<HubIcon/>),
      item("Comunicações","/comunicacoes",<ChatIcon/>),
      item("Chatbot e IA","/revah-chatbot",<ChatIcon/>),
      item("Leads","/revah-leads",<PeopleAltIcon/>),
      item("Recall e Reativação","/recall",<SendIcon/>),
      item("Central de Marketing","/marketing/central",<SendIcon/>),
      item("Disparos locais","/revah",<SendIcon/>),
      item("Canais de Envio","/canais-envio",<SettingsInputAntennaIcon/>),
    ])
  },
  {
    label:"Financeiro",
    icon:tile(<AccountBalanceWalletIcon/>,"#F0A020"),
    items:[
      item("Visão geral","/financeiro",<PaymentsIcon/>),
      item("Contas a Receber","/financeiro?tipo=Receita",<PaymentsIcon/>),
      item("Contas a Pagar","/financeiro?tipo=Despesa",<ReceiptLongIcon/>),
      item("Cobranças","/pagamentos",<CreditCardIcon/>),
      item("Recebimentos online","/recebimentos-online",<PaymentsIcon/>),
      item("Digitalizar Financeiro","/financeiro/digitalizar",<ReceiptLongIcon/>),
    ]
  },
  {
    label:"Administrativo",
    icon:tile(<AssignmentIcon/>,"#0E7C86"),
    items:alphabetical([
      item("Backoffice","/backoffice",<AccountBalanceIcon/>),
      item("Contábil e Fiscal","/contabil-fiscal",<AccountBalanceIcon/>),
      item("Automação Fiscal","/automacao-fiscal",<ReceiptLongIcon/>),
      item("Evidências Operacionais","/evidencias-operacionais",<DescriptionIcon/>),
      item("Gestão Operacional","/operacional",<CleaningServicesIcon/>),
      item("Corpo Clínico","/corpo-clinico",<MedicalInformationIcon/>),
      item("RH e Gestão de Pessoas","/rh",<WorkIcon/>),
      item("Registrar ponto","/rh?ponto=1",<FingerprintIcon/>),
    ])
  },
  {
    label:"Gestão",
    icon:tile(<BarChartIcon/>,"#8B5CF6"),
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
    icon:tile(<ShoppingBagIcon/>,"#E0457B"),
    items:alphabetical([
      item("Loja e Vendas","/sales",<PointOfSaleIcon/>),
      item("Estoque","/estoque",<Inventory2Icon/>),
    ])
  },
  {
    label:"Acadêmico",
    icon:tile(<SchoolIcon/>,"#6366F1"),
    items:alphabetical([
      item("Visão geral","/academico",<SpaceDashboardIcon/>),
      item("Alunos","/academico?secao=alunos",<PeopleAltIcon/>),
      item("Cursos","/academico?secao=cursos",<SchoolIcon/>),
      item("Professores","/academico?secao=professores",<GroupsIcon/>),
      item("Turmas","/academico?secao=turmas",<EventIcon/>),
      item("Financeiro acadêmico","/edu/financeiro",<PaymentsIcon/>),
      item("Frequência e documentos","/academico?secao=documentos",<DescriptionIcon/>),
      item("Alunos · secretaria","/edu/academico/alunos",<PeopleAltIcon/>),
      item("Matrizes e fluxograma","/edu/academico/matrizes",<HubIcon/>),
      item("Salas e horários","/edu/academico/salas",<EventIcon/>),
      item("Programas de desenvolvimento","/edu/academico/desenvolvimento",<TrendingUpIcon/>),
      item("Pesquisa, extensão e ligas","/edu/academico/pesquisa-extensao",<BiotechIcon/>),
    ])
  },
  {
    label:"EduMaster · Reitoria",
    icon:tile(<AccountBalanceOutlinedIcon/>,"#0F766E"),
    items:[
      item("Painel executivo","/edu",<SpaceDashboardIcon/>),
      item("Minha mesa e lembretes","/edu/minha-mesa",<AssignmentIcon/>),
      item("Agenda da Reitoria","/edu/reitoria/agenda",<EventIcon/>),
      item("Diário Oficial (DOU)","/edu/reitoria/dou",<DescriptionIcon/>),
      item("Painéis executivos","/edu/reitoria/paineis",<BarChartIcon/>),
      item("Acordos e convênios","/edu/reitoria/convenios",<AccountBalanceIcon/>),
      item("Pessoas e avaliações","/edu/reitoria/pessoas",<PeopleAltIcon/>),
      item("Graduação e pós","/edu/reitoria/niveis",<SchoolIcon/>),
      item("Comparativo com outras IES","/edu/reitoria/comparativo",<InsightsIcon/>),
      item("Jornadas e fluxogramas","/edu/jornadas",<HubIcon/>),
      item("Regulatório MEC","/edu/regulatorio",<HealthAndSafetyIcon/>),
      item("Governança e PDI","/edu/governanca",<AdminPanelSettingsIcon/>),
      item("Identidade e logomarcas","/edu/identidade",<SettingsIcon/>),
    ]
  },
  {
    label:"EduMaster · Acadêmico",
    icon:tile(<SchoolIcon/>,"#4F46E5"),
    items:[
      item("Admissões e vestibular","/edu/admissoes",<PeopleAltIcon/>),
      item("Secretaria e certificados","/edu/secretaria",<DescriptionIcon/>),
      item("Calendário e salas","/edu/calendario",<EventIcon/>),
      item("Notas e diário","/edu/notas",<AssessmentIcon/>),
      item("Modalidades, EAD e pós","/edu/modalidades",<GroupsIcon/>),
      item("ENADE, OAB e desempenho","/edu/desempenho",<InsightsIcon/>),
      item("Biblioteca","/edu/biblioteca",<FolderSharedIcon/>),
      item("Presença e acesso","/edu/presenca",<HowToRegIcon/>),
      item("Pesquisa e revista","/edu/pesquisa",<BiotechIcon/>),
      item("Portal do aluno","/edu/portal-aluno",<SchoolIcon/>),
    ]
  },
  {
    label:"EduMaster · Campos de prática",
    icon:tile(<LocalHospitalIcon/>,"#047857"),
    items:[
      item("Painel de campos de prática","/edu/campos-pratica?secao=painel",<SpaceDashboardIcon/>),
      item("Estágios","/edu/campos-pratica?secao=estagios",<WorkIcon/>),
      item("Convênios e vagas","/edu/campos-pratica?secao=convenios",<HandshakeIcon/>),
      item("Agenda das clínicas-escola","/edu/campos-pratica?secao=agenda",<EventIcon/>),
      item("Pacientes e LGPD","/edu/campos-pratica?secao=pacientes",<PrivacyTipIcon/>),
      item("Escalas e unidades","/edu/campos-pratica?secao=clinicas",<LocalHospitalIcon/>),
      item("Agronomia","/edu/campos-pratica?secao=agro",<AgricultureIcon/>),
      item("Núcleo animal","/edu/campos-pratica?secao=animal",<PetsIcon/>),
    ]
  },
  {
    label:"EduMaster · Portais e ambientes",
    icon:tile(<SchoolIcon/>,"#0E7490"),
    items:[
      item("Início e ambientes de ensino","/edu/inicio",<SpaceDashboardIcon/>),
      item("Portal do aluno","/edu/portal-aluno",<SchoolIcon/>),
      item("Portal do professor","/edu/portal-professor",<GroupsIcon/>),
      item("Minha biometria e carteirinha","/edu/minha-biometria",<HowToRegIcon/>),
    ]
  },
  {
    label:"EduMaster · Operação",
    icon:tile(<WorkIcon/>,"#B45309"),
    items:[
      item("Apoio, ouvidoria e egressos","/edu/apoio",<SupportAgentIcon/>),
      item("Comunicação omnichannel","/edu/comunicacao",<ChatIcon/>),
      item("Infraestrutura e patrimônio","/edu/infraestrutura",<CleaningServicesIcon/>),
      item("Agenda de infraestrutura","/edu/infraestrutura?secao=agenda",<EventIcon/>),
      item("Solicitações e OS (com fotos)","/edu/infraestrutura?secao=solicitacoes",<BugReportIcon/>),
      item("Frota","/edu/infraestrutura?secao=frota",<WorkIcon/>),
      item("Segurança patrimonial","/edu/infraestrutura?secao=seguranca",<ShieldIcon/>),
      item("Compras, estoque e vendas","/edu/suprimentos",<Inventory2Icon/>),
    ]
  },
  {
    label:"EduMaster · Atendimento",
    icon:tile(<SupportAgentIcon/>,"#0E7490"),
    items:[
      item("Central / caixa","/edu/atendimento?secao=central",<ChatIcon/>),
      item("Protocolos e jornada","/edu/atendimento?secao=protocolos",<AssignmentIcon/>),
      item("Documentos recebidos","/edu/atendimento?secao=documentos",<FolderSharedIcon/>),
      item("Base de conhecimento e IA","/edu/atendimento?secao=conhecimento",<InsightsIcon/>),
      item("Emissão de documentos","/edu/atendimento?secao=emissao",<DescriptionIcon/>),
      item("Catálogo de serviços","/edu/atendimento?secao=catalogo",<Inventory2Icon/>),
      item("Painel / SLA","/edu/atendimento?secao=painel",<SpaceDashboardIcon/>),
    ]
  },
  {
    label:"EduMaster · Jurídico",
    icon:tile(<GavelIcon/>,"#7C2D12"),
    items:[
      item("Painel","/edu/juridico?secao=painel",<SpaceDashboardIcon/>),
      item("Documentos","/edu/juridico?secao=documentos",<DescriptionIcon/>),
      item("Contratos","/edu/juridico?secao=contratos",<HandshakeIcon/>),
      item("Imóveis","/edu/juridico?secao=imoveis",<HomeWorkIcon/>),
      item("Polos","/edu/juridico?secao=polos",<LocationCityIcon/>),
      item("Processos","/edu/juridico?secao=processos",<GavelIcon/>),
      item("Inteligência","/edu/juridico?secao=inteligencia",<InsightsIcon/>),
      item("Riscos e Seguros","/edu/juridico?secao=riscos",<ShieldIcon/>),
    ]
  },
  {
    label:"EduMaster · RH",
    icon:tile(<BadgeIcon/>,"#9D174D"),
    items:[
      item("RH: Painel","/edu/rh?secao=painel",<SpaceDashboardIcon/>),
      item("Colaboradores","/edu/rh?secao=colaboradores",<PeopleAltIcon/>),
      item("Ponto e Banco de Horas","/edu/rh?secao=ponto",<AccessTimeIcon/>),
      item("Atestados e Licenças","/edu/rh?secao=saude",<MedicalServicesIcon/>),
      item("Férias","/edu/rh?secao=ferias",<BeachAccessIcon/>),
      item("Carreira e Bonificações","/edu/rh?secao=carreira",<TrendingUpIcon/>),
      item("Advertências","/edu/rh?secao=advertencias",<ReportProblemIcon/>),
      item("Admissão e Desligamento","/edu/rh?secao=ciclo",<PersonAddAlt1Icon/>),
      item("Avaliações","/edu/rh?secao=avaliacoes",<FactCheckIcon/>),
      item("Folha","/edu/rh?secao=folha",<RequestQuoteIcon/>),
      item("Pró-labore e Terceiros","/edu/rh?secao=socios",<AccountBalanceWalletIcon/>),
    ]
  },
  {
    label:"EduMaster · Financeiro",
    icon:tile(<AccountBalanceWalletIcon/>,"#0E7490"),
    items:[
      item("Painel financeiro","/edu/financeiro",<SpaceDashboardIcon/>),
      item("Contas a receber","/edu/financeiro?secao=receber",<PaymentsIcon/>),
      item("Contas a pagar","/edu/financeiro?secao=pagar",<ReceiptLongIcon/>),
      item("Conferência e autorização","/edu/financeiro?secao=fila",<AssignmentIcon/>),
      item("Bancos e conciliação","/edu/financeiro?secao=bancos",<AccountBalanceIcon/>),
      item("Notas fiscais","/edu/financeiro?secao=notas",<DescriptionIcon/>),
      item("Recibos","/edu/financeiro?secao=recibos",<ReceiptLongIcon/>),
      item("Permutas e bolsas","/edu/financeiro?secao=permutas",<PeopleAltIcon/>),
      item("Remessas bancárias","/edu/financeiro?secao=remessas",<SendIcon/>),
    ]
  },
  {
    label:"EduMaster · Cobrança",
    icon:tile(<RequestPageIcon/>,"#B91C1C"),
    items:[
      item("Painel","/edu/cobranca?aba=painel",<SpaceDashboardIcon/>),
      item("Inadimplentes","/edu/cobranca?aba=inadimplentes",<PeopleAltIcon/>),
      item("Acordos e Negociações","/edu/cobranca?aba=acordos",<DescriptionIcon/>),
      item("Régua e Políticas","/edu/cobranca?aba=regua",<SettingsIcon/>),
      item("Histórico de Contatos","/edu/cobranca?aba=historico",<ChatIcon/>),
      item("Recebimentos","/edu/cobranca?aba=recebimentos",<PaymentsIcon/>),
    ]
  },
  {
    label:"EduMaster · Marketing",
    icon:tile(<CampaignIcon/>,"#C026D3"),
    items:[
      item("Painel","/edu/marketing?secao=painel",<SpaceDashboardIcon/>),
      item("Calendário","/edu/marketing?secao=calendario",<CalendarMonthIcon/>),
      item("Campanhas","/edu/marketing?secao=campanhas",<CampaignIcon/>),
      item("Leads e Funil","/edu/marketing?secao=leads",<FilterAltIcon/>),
      item("Canais e Disparos","/edu/marketing?secao=canais",<SendIcon/>),
      item("Mídia offline","/edu/marketing?secao=offline",<RadioIcon/>),
      item("Gerador IA","/edu/marketing?secao=ia",<AutoAwesomeIcon/>),
      item("Site e Landing pages","/edu/marketing?secao=site",<PublicIcon/>),
      item("Eventos","/edu/marketing?secao=eventos",<EventIcon/>),
      item("Conformidade LGPD","/edu/marketing?secao=lgpd",<GppGoodIcon/>),
    ]
  },
  {
    label:"Configurações",
    icon:tile(<SettingsIcon/>,"#64748B"),
    items:alphabetical([
      item("Configurações","/configuracoes",<SettingsIcon/>),
      item("Clínicas e unidades","/clinicas",<LocalHospitalIcon/>),
      item("Integrações","/integracoes",<HubIcon/>),
      item("Importar Pacientes","/importar-pacientes",<UploadFileIcon/>),
      item("Permissões","/permissoes",<AdminPanelSettingsIcon/>),
      item("Central LGPD","/edu/lgpd",<PrivacyTipIcon/>),
      item("Segurança da conta","/seguranca",<AdminPanelSettingsIcon/>),
      item("Eventos de segurança","/seguranca/eventos",<AdminPanelSettingsIcon/>),
      item("Sugestões e Problemas","/sugestoes-problemas",<BugReportIcon/>),
      item("Central de feedback (EduMaster)","/edu/feedback",<BugReportIcon/>),
    ])
  }
];

// No modo EduMaster só aparecem os grupos cujos itens apontam para /edu.
export const navigationGroups:NavigationGroup[] = EDU_ONLY
  ? allNavigationGroups.filter(g=>g.items.some(i=>i.path.startsWith("/edu")))
  : allNavigationGroups;

export const navigationItems = navigationGroups.flatMap(g=>g.items);
