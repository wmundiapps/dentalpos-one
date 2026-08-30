import {
  AppBar,
  Avatar,
  Badge,
  Box,
  ButtonBase,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import SearchIcon from "@mui/icons-material/Search";
import LogoutIcon from "@mui/icons-material/Logout";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BrandName from "./BrandName";
import { appConfig } from "../config/app";
import { navigationGroups } from "../config/navigation";
import { useAppTheme } from "../contexts/AppThemeContext";
import { notifications } from "../services/NotificationService";
import {
  appRootUrl,
  clearClientSession,
  pathAllowedForDemo,
  readDemoAccess,
  readSessionUser,
} from "../services/DemoAccess";

export default function Header() {
  const navigate = useNavigate();
  const { mode, toggleMode } = useAppTheme();
  const demo = readDemoAccess();
  const sessionUser = readSessionUser();
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const unreadCount = notifications.filter((notification) => !notification.lida).length;

  const searchableItems = useMemo(() => {
    const entries = navigationGroups.flatMap((group) =>
      group.items.map((item) => ({ ...item, group: group.label })),
    );

    if (!demo?.isDemo) return entries;

    const seen = new Set<string>();
    return entries.filter((entry) => {
      if (entry.path === "/agendamento-online") return false;
      const pathname = entry.path.split("?")[0] || "/";
      if (!pathAllowedForDemo(pathname, demo)) return false;
      if (seen.has(entry.path)) return false;
      seen.add(entry.path);
      return true;
    });
  }, [demo?.isDemo, demo?.modules.join("|")]);

  const results = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return [];

    const unique = new Map<string, (typeof searchableItems)[number]>();
    searchableItems.forEach((entry) => {
      const haystack = `${entry.label} ${entry.group}`.toLocaleLowerCase("pt-BR");
      if (haystack.includes(query)) unique.set(`${entry.label}-${entry.path}`, entry);
    });
    return Array.from(unique.values()).slice(0, 8);
  }, [search, searchableItems]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const goTo = (path: string) => {
    setSearch("");
    setSearchFocused(false);
    navigate(path);
  };

  const initials =
    `${sessionUser?.firstName?.[0] || ""}${sessionUser?.lastName?.[0] || ""}`.toUpperCase() || "DP";

  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="inherit"
      sx={{
        top: 0,
        borderBottom: "1px solid",
        borderColor: "divider",
        backdropFilter: "blur(14px)",
        backgroundColor: mode === "light" ? "rgba(255,255,255,.90)" : "rgba(17,28,45,.90)",
        boxShadow: mode === "light" ? "0 8px 28px rgba(15,23,42,.04)" : "0 8px 28px rgba(0,0,0,.16)",
        zIndex: 1200,
      }}
    >
      <Toolbar sx={{ gap: { xs: 1, md: 2 }, minHeight: 72 }}>
        <Box sx={{ display: { xs: "none", lg: "block" } }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "primary.main", lineHeight: 1.2, whiteSpace: "nowrap" }}>
            <BrandName />
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {demo?.isDemo ? "Demo gratuita • Early Access" : appConfig.environment}
          </Typography>
        </Box>

        <Box sx={{ position: "relative", width: { xs: "100%", sm: 360, md: 440 }, maxWidth: 520 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Pesquisar módulos...  /"
            value={search}
            inputRef={searchRef}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results[0]) goTo(results[0].path);
              if (event.key === "Escape") {
                setSearch("");
                searchRef.current?.blur();
              }
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
          />

          {searchFocused && search.trim() && (
            <Paper
              elevation={8}
              sx={{
                position: "absolute",
                top: "calc(100% + 8px)",
                left: 0,
                right: 0,
                zIndex: 1500,
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              {results.length ? (
                results.map((entry) => (
                  <ButtonBase
                    key={`${entry.group}-${entry.label}-${entry.path}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => goTo(entry.path)}
                    sx={{ width: "100%", display: "block", textAlign: "left", px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}
                  >
                    <Typography sx={{ fontWeight: 800 }}>{entry.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{entry.group}</Typography>
                  </ButtonBase>
                ))
              ) : (
                <Box sx={{ px: 2, py: 2 }}>
                  <Typography variant="body2" color="text.secondary">Nenhum módulo encontrado.</Typography>
                </Box>
              )}
            </Paper>
          )}
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title={mode === "light" ? "Ativar modo escuro" : "Ativar modo claro"}>
          <IconButton onClick={toggleMode}>
            {mode === "light" ? <DarkModeOutlinedIcon /> : <LightModeOutlinedIcon />}
          </IconButton>
        </Tooltip>

        {!demo?.isDemo ? (
          <Tooltip title="Abrir notificações">
            <IconButton onClick={() => navigate("/notificacoes")}>
              <Badge badgeContent={unreadCount} color="error">
                <NotificationsNoneIcon />
              </Badge>
            </IconButton>
          </Tooltip>
        ) : null}

        <Tooltip title="Sair com segurança">
          <IconButton
            onClick={() => {
              clearClientSession();
              window.location.href = appRootUrl();
            }}
          >
            <LogoutIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={sessionUser ? `${sessionUser.firstName} ${sessionUser.lastName}` : "Perfil do usuário"}>
          <Avatar sx={{ bgcolor: "primary.main", width: 40, height: 40 }}>{initials}</Avatar>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
