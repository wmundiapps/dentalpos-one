import AssignmentIcon from "@mui/icons-material/Assignment";
import DescriptionIcon from "@mui/icons-material/Description";
import EventIcon from "@mui/icons-material/Event";
import GroupsIcon from "@mui/icons-material/Groups";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import SchoolIcon from "@mui/icons-material/School";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
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
];

export const navigationItems = navigationGroups.flatMap((g) => g.items);
