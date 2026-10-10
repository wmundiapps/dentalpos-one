import AssignmentIcon from "@mui/icons-material/Assignment";
import DescriptionIcon from "@mui/icons-material/Description";
import EventIcon from "@mui/icons-material/Event";
import GroupsIcon from "@mui/icons-material/Groups";
import HelpOutlineIcon from "@mui/icons-material/HelpCenter";
import InsightsIcon from "@mui/icons-material/Insights";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import PaymentsIcon from "@mui/icons-material/Payments";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import SchoolIcon from "@mui/icons-material/School";
import SettingsIcon from "@mui/icons-material/Settings";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import WorkIcon from "@mui/icons-material/Work";
import { Box } from "@mui/material";
import type { ReactNode } from "react";

export interface NavigationItem { label: string; path: string; icon: ReactNode; }
export interface NavigationGroup { label: string; icon: ReactNode; items: NavigationItem[]; }

const item = (label: string, path: string, icon: ReactNode): NavigationItem => ({ label, path, icon });

/** Icone do grupo: quadrado colorido com simbolo branco (legivel no menu escuro e no item selecionado). */
const tile = (icon: ReactNode, color: string): ReactNode => (
  <Box component="span" sx={{ width: 26, height: 26, borderRadius: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", background: `linear-gradient(135deg, ${color}B3, ${color})`, boxShadow: `0 2px 6px ${color}66`, "& svg": { fontSize: 17 } }}>
    {icon}
  </Box>
);

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Acadêmico",
    icon: tile(<SchoolIcon />, "#0EA5E9"),
    items: [
      item("Visão geral", "/", <SpaceDashboardIcon />),
      item("Programas", "/?secao=programas", <SchoolIcon />),
      item("Disciplinas", "/?secao=disciplinas", <DescriptionIcon />),
      item("Matriz curricular", "/?secao=matriz", <AssignmentIcon />),
      item("Períodos letivos", "/?secao=periodos", <EventIcon />),
      item("Turmas", "/?secao=turmas", <GroupsIcon />),
      item("Alunos", "/?secao=alunos", <PeopleAltIcon />),
      item("Matrículas", "/?secao=matriculas", <AssignmentIcon />),
    ],
  },
  {
    label: "Provas",
    icon: tile(<AssignmentIcon />, "#6366F1"),
    items: [
      item("Banco de questões", "/?secao=questoes", <DescriptionIcon />),
      item("Provas", "/?secao=provas", <AssignmentIcon />),
    ],
  },
  {
    label: "Desempenho",
    icon: tile(<InsightsIcon />, "#F97316"),
    items: [
      item("Desempenho e reforço", "/desempenho", <InsightsIcon />),
    ],
  },
  {
    label: "Conteúdo",
    icon: tile(<DescriptionIcon />, "#22C55E"),
    items: [
      item("Conteúdos e aulas", "/conteudo?secao=conteudos", <DescriptionIcon />),
      item("Flashcards", "/conteudo?secao=flashcards", <SchoolIcon />),
      item("Fóruns", "/conteudo?secao=forums", <GroupsIcon />),
      item("Biblioteca", "/conteudo?secao=biblioteca", <DescriptionIcon />),
    ],
  },
  {
    label: "Secretaria",
    icon: tile(<DescriptionIcon />, "#8B5CF6"),
    items: [
      item("Protocolo e certificados", "/documentos?secao=solicitacoes", <DescriptionIcon />),
      item("Certificados e diplomas", "/documentos?secao=certificados", <DescriptionIcon />),
      item("Contratos de matrícula", "/documentos?secao=contratos", <AssignmentIcon />),
    ],
  },
  {
    label: "Operacional",
    icon: tile(<MeetingRoomIcon />, "#0EA5E9"),
    items: [
      item("Reservas de salas", "/operacional?secao=reservas", <MeetingRoomIcon />),
      item("Vagas e carreiras", "/operacional?secao=carreiras", <WorkIcon />),
      item("Patrimônio", "/operacional?secao=patrimonio", <MeetingRoomIcon />),
      item("Manutenção", "/operacional?secao=manutencao", <MeetingRoomIcon />),
      item("Estacionamento", "/operacional?secao=estacionamento", <MeetingRoomIcon />),
      item("Vencimentos", "/operacional?secao=vencimentos", <MeetingRoomIcon />),
    ],
  },
  {
    label: "Suprimentos",
    icon: tile(<WorkIcon />, "#0891B2"),
    items: [
      item("Itens e estoque", "/suprimentos?secao=itens", <WorkIcon />),
      item("Pedidos de compra", "/suprimentos?secao=compras", <WorkIcon />),
      item("Vendas", "/suprimentos?secao=vendas", <WorkIcon />),
      item("Carteira de créditos (cantina)", "/suprimentos?secao=carteira", <PaymentsIcon />),
    ],
  },
  {
    label: "Jurídico",
    icon: tile(<DescriptionIcon />, "#334155"),
    items: [
      item("Demandas jurídicas", "/juridico", <DescriptionIcon />),
    ],
  },
  {
    label: "Pesquisa",
    icon: tile(<SchoolIcon />, "#7C3AED"),
    items: [
      item("Projetos", "/pesquisa?secao=projetos", <SchoolIcon />),
      item("Agências e editais", "/pesquisa?secao=editais", <SchoolIcon />),
    ],
  },
  {
    label: "Captação",
    icon: tile(<PeopleAltIcon />, "#EA580C"),
    items: [
      item("Processos seletivos", "/captacao?secao=processos", <PeopleAltIcon />),
      item("Candidaturas", "/captacao?secao=candidaturas", <PeopleAltIcon />),
    ],
  },
  {
    label: "Governança",
    icon: tile(<GroupsIcon />, "#DC2626"),
    items: [
      item("Comissões", "/governanca?secao=comissoes", <GroupsIcon />),
      item("Metas do PDI", "/governanca?secao=pdi", <GroupsIcon />),
      item("Atos regulatórios", "/governanca?secao=regulatorio", <GroupsIcon />),
    ],
  },
  {
    label: "Formulários",
    icon: tile(<AssignmentIcon />, "#0369A1"),
    items: [
      item("Modelos", "/formularios?secao=modelos", <AssignmentIcon />),
      item("Submissões", "/formularios?secao=submissoes", <AssignmentIcon />),
    ],
  },
  {
    label: "Configurações",
    icon: tile(<SettingsIcon />, "#64748B"),
    items: [
      item("Identidade e marca", "/configuracoes?secao=identidade", <SettingsIcon />),
      item("Unidades e polos", "/configuracoes?secao=unidades", <SchoolIcon />),
      item("Planos e cobrança", "/planos", <PaymentsIcon />),
      item("Central de ajuda", "/ajuda", <HelpOutlineIcon />),
    ],
  },
];

export const navigationItems = navigationGroups.flatMap((g) => g.items);
