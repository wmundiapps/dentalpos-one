import {
  Avatar,
  Box,
  Collapse,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import MenuIcon from "@mui/icons-material/Menu";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import BrandName from "./BrandName";
import { appConfig } from "../config/app";
import { navigationGroups } from "../config/navigation";

const OPEN_GROUPS_KEY = "dentalpos.navigation.open-groups.v1";

function pathMatches(target: string, pathname: string, search: string) {
  const [targetPath, query = ""] = target.split("?");
  if (targetPath !== pathname) return false;
  if (!query) return true;

  const targetParams = new URLSearchParams(query);
  const currentParams = new URLSearchParams(search);
  return Array.from(targetParams.entries()).every(([key, value]) => currentParams.get(key) === value);
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isDesign = location.pathname === "/design" || location.pathname.startsWith("/design/");
  const [collapsed, setCollapsed] = useState(isDesign);
  const activeGroup = useMemo(
    () => navigationGroups.find((group) => group.items.some((item) => pathMatches(item.path, location.pathname, location.search)))?.label,
    [location.pathname, location.search],
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) || "") as Record<string, boolean>;
    } catch {
      return { Recepção: true, Gestão: true };
    }
  });

  useEffect(() => {
    if (isDesign) setCollapsed(true);
  }, [isDesign]);

  useEffect(() => {
    if (activeGroup) setOpenGroups((current) => ({ ...current, [activeGroup]: true }));
  }, [activeGroup]);

  useEffect(() => {
    localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(openGroups));
  }, [openGroups]);

  const sidebarWidth = collapsed ? 72 : 288;
  const go = (path: string) => navigate(path);

  return (
    <Box component="aside" sx={{ width: sidebarWidth, minWidth: sidebarWidth, height: "100vh", bgcolor: "#0F172A", color: "#FFFFFF", display: "flex", flexDirection: "column", position: "sticky", top: 0, overflowY: "auto", overflowX: "visible", transition: "width 0.25s ease, min-width 0.25s ease", flexShrink: 0 }}>
      <Tooltip title={collapsed ? "Expandir menu" : "Recolher menu"} placement="right">
        <IconButton aria-label={collapsed ? "Expandir menu" : "Recolher menu"} onClick={() => setCollapsed((value) => !value)} size="small" sx={{ position: "fixed", left: sidebarWidth - 16, top: "50%", transform: "translateY(-50%)", zIndex: 1400, width: 32, height: 54, borderRadius: "0 12px 12px 0", bgcolor: "#0F172A", color: "#fff", border: "1px solid #334155", boxShadow: "0 8px 24px rgba(0,0,0,.28)", transition: "left .25s ease", "&:hover": { bgcolor: "primary.main" } }}>
          {collapsed ? <MenuIcon fontSize="small" /> : <MenuOpenIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      <Box sx={{ px: collapsed ? 1 : 3, pt: 2, pb: collapsed ? 1.5 : 2, textAlign: "center" }}>
        <Avatar sx={{ width: collapsed ? 42 : 72, height: collapsed ? 42 : 72, mx: "auto", mb: collapsed ? 0 : 2, bgcolor: "primary.main", fontSize: collapsed ? 18 : 28, transition: "width 0.25s ease, height 0.25s ease" }}>R</Avatar>
        {!collapsed && <><Typography variant="h6" sx={{ fontWeight: 700 }}>Dr. Robson</Typography><Typography variant="body2" sx={{ color: "#94A3B8" }}>Administrador</Typography></>}
      </Box>
      <Divider sx={{ borderColor: "#334155" }} />

      <List sx={{ mt: 1, px: collapsed ? 0.75 : 1 }}>
        {navigationGroups.map((group) => {
          const groupSelected = group.items.some((item) => pathMatches(item.path, location.pathname, location.search));
          const groupOpen = Boolean(openGroups[group.label]);
          if (collapsed) {
            return (
              <Tooltip key={group.label} title={`${group.label}: ${group.items.map((i) => i.label).join(", ")}`} placement="right" arrow>
                <ListItemButton onClick={() => { const first = group.items.find((i) => pathMatches(i.path, location.pathname, location.search)) ?? group.items[0]; if (first) go(first.path); }} selected={groupSelected} sx={{ mb: .5, minHeight: 48, borderRadius: 2, justifyContent: "center", px: 1, color: groupSelected ? "#fff" : "#CBD5E1", "&.Mui-selected": { bgcolor: "#1976D2" }, "&:hover": { bgcolor: "#1E293B", color: "#fff" } }}>
                  <ListItemIcon sx={{ color: "inherit", minWidth: 0, justifyContent: "center" }}>{group.icon}</ListItemIcon>
                </ListItemButton>
              </Tooltip>
            );
          }
          return (
            <Box key={group.label} sx={{ mb: .5 }}>
              <ListItemButton onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !groupOpen }))} sx={{ borderRadius: 2, minHeight: 44, color: groupSelected ? "#fff" : "#CBD5E1", bgcolor: groupSelected ? "rgba(25,118,210,.16)" : "transparent", "&:hover": { bgcolor: "#1E293B", color: "#fff" } }}>
                <ListItemIcon sx={{ color: "inherit", minWidth: 40 }}>{group.icon}</ListItemIcon>
                <ListItemText primary={<Typography component="span" sx={{ fontWeight: groupSelected ? 800 : 700 }}>{group.label}</Typography>} />
                {groupOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </ListItemButton>
              <Collapse in={groupOpen} timeout="auto" unmountOnExit>
                <List disablePadding sx={{ pl: 1 }}>
                  {group.items.map((item, index) => {
                    const selected = pathMatches(item.path, location.pathname, location.search);
                    return (
                      <ListItemButton key={`${group.label}-${item.path}-${index}`} selected={selected} onClick={() => go(item.path)} sx={{ minHeight: 40, borderRadius: 2, my: .25, pl: 2.25, color: selected ? "#fff" : "#94A3B8", "&.Mui-selected": { bgcolor: "#1976D2", color: "#fff" }, "&.Mui-selected:hover": { bgcolor: "#1565C0" }, "&:hover": { bgcolor: "#1E293B", color: "#fff" } }}>
                        <ListItemIcon sx={{ color: "inherit", minWidth: 34 }}>{item.icon}</ListItemIcon>
                        <ListItemText primary={<Typography component="span" sx={{ fontSize: 13.5 }}>{item.label}</Typography>} />
                      </ListItemButton>
                    );
                  })}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </List>

      <Box sx={{ flexGrow: 1 }} />
      <Box sx={{ py: 2, textAlign: "center", color: "#64748B", whiteSpace: "nowrap" }}>
        {collapsed ? <Typography sx={{ fontSize: 10, fontWeight: 700 }}>DP</Typography> : <Typography sx={{ fontSize: 12 }}><BrandName /> • {appConfig.version}</Typography>}
      </Box>
    </Box>
  );
}
