import { useLabPendingCount } from "./LabReceiptNotices";
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
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { openAlerts } from "./alerts/AlertsMenu";
import { useCriticalAlerts } from "../hooks/useCriticalAlerts";
import { usePendingCount } from "../services/PendingAlertsApi";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import SearchIcon from "@mui/icons-material/Search";
import LogoutIcon from "@mui/icons-material/Logout";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EmojiObjectsOutlinedIcon from "@mui/icons-material/EmojiObjectsOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import FeedbackDialog from "./FeedbackDialog";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BrandName from "./BrandName";
import { appConfig } from "../config/app";
import { navigationGroups } from "../config/navigation";
import { itemAllowed, useMenuAccess } from "../config/menuAccess";
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
  const location = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { mode, toggleMode } = useAppTheme();
  const demo = readDemoAccess();
  const sessionUser = readSessionUser();
  const [identityTick, setIdentityTick] = useState(0);
  useEffect(() => { const on = () => setIdentityTick((n) => n + 1); window.addEventListener("dentalpos:identity", on); return () => window.removeEventListener("dentalpos:identity", on); }, []);
  // Logo salva no cadastro da clínica (sessão); o localStorage antigo fica como reserva.
  const clinicLogo = (identityTick >= 0 && (readSessionUser()?.clinic?.logo || localStorage.getItem("dentalpos.clinicLogo"))) || "";
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const { alerts: criticalAlerts } = useCriticalAlerts();
  const pendingCount = usePendingCount(location.pathname);
  const alertTotal = criticalAlerts.length + pendingCount;
  const alertError = pendingCount > 0 || criticalAlerts.some((a) => a.severity === "error");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const labPending = useLabPendingCount();
  const unreadCount = notifications.filter((notification) => !notification.lida).length + labPending;

  const menuAccess = useMenuAccess();
  const searchableItems = useMemo(() => {
    const entries = navigationGroups.flatMap((group) =>
      group.items.filter((item) => itemAllowed(item, menuAccess)).map((item) => ({ ...item, group: group.label })),
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
  }, [demo?.isDemo, demo?.modules.join("|"), menuAccess]);

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
      <Toolbar sx={{ gap: { xs: 0.5, md: 2 }, minHeight: { xs: 56, md: 72 }, flexWrap: { xs: "wrap", md: "nowrap" }, px: { xs: 1, md: 3 } }}>
        <IconButton aria-label="Abrir menu" onClick={() => window.dispatchEvent(new Event("dentalpos:open-menu"))} sx={{ display: { xs: "inline-flex", md: "none" }, flexShrink: 0 }}>
          <MenuIcon />
        </IconButton>
        {location.pathname !== "/" && location.pathname !== "/dashboard" && (
          <Tooltip title="Voltar">
            <IconButton
              aria-label="Voltar"
              onClick={() => { if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else navigate("/"); }}
              sx={{ border: "1px solid", borderColor: "divider", flexShrink: 0, display: { xs: "none", md: "inline-flex" } }}
            >
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
        )}
        <Box component="img" src={`${import.meta.env.BASE_URL}brand/logo-leao.png`} alt="CompletoDonto" sx={{ width: { xs: 34, md: 44 }, height: { xs: 34, md: 44 }, borderRadius: "50%", flexShrink: 0, boxShadow: "0 2px 8px rgba(15,23,42,.18)" }} />
        <Box sx={{ display: { xs: "none", lg: "block" } }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "primary.main", lineHeight: 1.2, whiteSpace: "nowrap" }}>
            <BrandName />
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {demo?.isDemo ? "Modo Experience • versão temporária e gratuita" : appConfig.environment}
          </Typography>
        </Box>

        <Box sx={{ position: "relative", width: { xs: "100%", sm: 360, md: 440 }, maxWidth: 520, display: { xs: searchOpen ? "block" : "none", md: "block" }, order: { xs: 10, md: 0 } }}>
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

        <IconButton aria-label="Pesquisar módulos" onClick={() => setSearchOpen((v) => !v)} sx={{ display: { xs: "inline-flex", md: "none" } }}><SearchIcon /></IconButton>
        <Tooltip title={alertTotal ? `${alertTotal} alerta(s) e pendência(s)` : "Alertas críticos"}>
          <IconButton aria-label="Alertas críticos" onClick={() => openAlerts()} sx={{ color: alertTotal ? (alertError ? "error.main" : "warning.main") : "text.secondary" }}>
            <Badge badgeContent={alertTotal} color={alertError ? "error" : "warning"} max={99}>{alertTotal ? <NotificationsActiveIcon /> : <NotificationsNoneIcon />}</Badge>
          </IconButton>
        </Tooltip>
        <IconButton aria-label="Mais opções" onClick={(e) => setMoreAnchor(e.currentTarget)} sx={{ display: { xs: "inline-flex", md: "none" } }}><MoreVertIcon /></IconButton>
        <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
          <MenuItem onClick={() => { setMoreAnchor(null); window.print(); }}><ListItemIcon><PrintOutlinedIcon fontSize="small" /></ListItemIcon><ListItemText>Imprimir esta tela</ListItemText></MenuItem>
          <MenuItem onClick={() => { setMoreAnchor(null); setFeedbackOpen(true); }}><ListItemIcon><EmojiObjectsOutlinedIcon fontSize="small" /></ListItemIcon><ListItemText>Caixinha de sugestões</ListItemText></MenuItem>
          <MenuItem onClick={() => { setMoreAnchor(null); toggleMode(); }}><ListItemIcon>{mode === "light" ? <DarkModeOutlinedIcon fontSize="small" /> : <LightModeOutlinedIcon fontSize="small" />}</ListItemIcon><ListItemText>{mode === "light" ? "Modo escuro" : "Modo claro"}</ListItemText></MenuItem>
          {!demo?.isDemo ? <MenuItem onClick={() => { setMoreAnchor(null); navigate("/notificacoes"); }}><ListItemIcon><Badge badgeContent={unreadCount} color="error"><NotificationsNoneIcon fontSize="small" /></Badge></ListItemIcon><ListItemText>Notificações</ListItemText></MenuItem> : null}
          <MenuItem onClick={() => { setMoreAnchor(null); clearClientSession(); window.location.href = appRootUrl(); }}><ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon><ListItemText>Sair com segurança</ListItemText></MenuItem>
        </Menu>

        <Box sx={{ display: { xs: "none", md: "contents" } }}>
        <Tooltip title={"Imprimir esta tela (ou salvar como PDF)"}>
          <IconButton onClick={() => window.print()}>
            <PrintOutlinedIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={"Caixinha de sugestões"}>
          <IconButton onClick={() => setFeedbackOpen(true)} sx={{ color: "warning.main" }}>
            <EmojiObjectsOutlinedIcon />
          </IconButton>
        </Tooltip>
        <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
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

        <Tooltip title={clinicLogo ? "Logo da clínica" : "Espaço para a logo da sua clínica"}>
          {clinicLogo ? (
            <Box component="img" src={clinicLogo} alt="Logo da clinica" sx={{ height: 40, maxWidth: 120, objectFit: "contain", borderRadius: 1 }} />
          ) : (
            <Box sx={{ height: 40, px: 1.25, display: { xs: "none", sm: "flex" }, alignItems: "center", gap: 0.75, border: "1px dashed", borderColor: "divider", borderRadius: 2, color: "text.secondary" }}>
              <LocalHospitalOutlinedIcon fontSize="small" />
              <Typography variant="caption" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{"Sua clínica"}</Typography>
            </Box>
          )}
        </Tooltip>
        <Tooltip title={sessionUser ? `${sessionUser.firstName} ${sessionUser.lastName}` : "Perfil do usuário"}>
          <Avatar sx={{ bgcolor: "primary.main", width: 40, height: 40 }}>{initials}</Avatar>
        </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
