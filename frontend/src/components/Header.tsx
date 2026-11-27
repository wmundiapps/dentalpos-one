import { APP_NAME, EDU_ONLY } from "../config/appMode";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  ButtonBase,
  Divider,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import LogoutIcon from "@mui/icons-material/Logout";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FeedbackOutlinedIcon from "@mui/icons-material/FeedbackOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import FeedbackDialog from "./FeedbackDialog";
import { openAlerts } from "./alerts/AlertsMenu";
import { useCriticalAlerts } from "../hooks/useCriticalAlerts";
import { useLabPendingCount } from "./LabReceiptNotices";
import { usePendingCount } from "../services/PendingAlertsApi";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { navigationGroups } from "../config/navigation";
import { itemAllowed, useMenuAccess } from "../config/menuAccess";
import { useAppTheme } from "../contexts/AppThemeContext";
import { useResumo } from "../edu/mensagens/resumo";
import { notifications } from "../services/NotificationService";
import { endSession } from "../security/sessionGuard";
import { pathAllowedForDemo, readDemoAccess, readSessionUser } from "../services/DemoAccess";

function pathname(path: string) {
  return path.split("?")[0] || "/";
}

/** Nome da funcionalidade mostrada no topo: o item (ou grupo) de menu cujo caminho bate com a rota atual. */
function useTituloDaTela(): string {
  const location = useLocation();
  return useMemo(() => {
    for (const group of navigationGroups) {
      for (const item of group.items) {
        if (pathname(item.path) === location.pathname) return item.label;
      }
    }
    const grupo = navigationGroups.find((g) => g.items.some((it) => pathname(it.path) === location.pathname));
    if (grupo) return grupo.label;
    if (location.pathname === "/" || location.pathname === "/dashboard") return "Início";
    return APP_NAME;
  }, [location.pathname]);
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { mode, toggleMode } = useAppTheme();
  const demo = readDemoAccess();
  const sessionUser = readSessionUser();
  const eduPath = location.pathname === "/edu" || location.pathname.startsWith("/edu/");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const titulo = useTituloDaTela();

  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const menuAccess = useMenuAccess();

  const labPending = useLabPendingCount();
  const { alerts: criticalAlerts } = useCriticalAlerts();
  const pendingCount = usePendingCount(location.pathname);
  const alertTotal = criticalAlerts.length + pendingCount;
  const alertError = pendingCount > 0 || criticalAlerts.some((a) => a.severity === "error");

  const unreadCount = notifications.filter((notification) => !notification.lida).length + labPending;
  const podeVerMensagens = eduPath && !["STUDENT", "CLIENTE_CONTABIL"].includes(String(sessionUser?.role || "").toUpperCase());
  const { resumo: resumoMsg } = useResumo();
  const msgCount = podeVerMensagens ? (resumoMsg?.naoLidas ?? 0) + (resumoMsg?.pedidos.total ?? 0) : 0;
  const totalAvisos = (demo?.isDemo ? 0 : unreadCount) + msgCount + alertTotal;

  const searchableItems = useMemo(() => {
    const entries = navigationGroups.flatMap((group) =>
      group.items.filter((item) => itemAllowed(item, menuAccess)).map((item) => ({ ...item, group: group.label })),
    );

    if (!demo?.isDemo) return entries;

    const seen = new Set<string>();
    return entries.filter((entry) => {
      if (entry.path === "/agendamento-online") return false;
      const p = entry.path.split("?")[0] || "/";
      if (!pathAllowedForDemo(p, demo)) return false;
      if (seen.has(entry.path)) return false;
      seen.add(entry.path);
      return true;
    });
  }, [demo?.isDemo, demo?.modules.join("|"), menuAccess]);

  const searchResults = useMemo(() => {
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
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const goTo = (path: string) => {
    setSearch("");
    setSearchFocused(false);
    setSearchOpen(false);
    navigate(path);
  };

  const initials =
    `${sessionUser?.firstName?.[0] || ""}${sessionUser?.lastName?.[0] || ""}`.toUpperCase() || (EDU_ONLY ? "EM" : "DP");
  const displayName = [sessionUser?.firstName, sessionUser?.lastName].filter(Boolean).join(" ") || "Usuário";
  const openMenu = (event: React.MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget);
  const closeMenu = () => setMenuAnchor(null);

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
      <Toolbar sx={{ gap: 1, minHeight: 64 }}>
        <Tooltip title="Menu">
          <IconButton onClick={() => window.dispatchEvent(new Event("edu:toggle-menu"))} aria-label="Abrir ou fechar o menu" edge="start">
            <MenuIcon />
          </IconButton>
        </Tooltip>

        {location.pathname !== "/" && location.pathname !== "/dashboard" && (
          <Tooltip title="Voltar">
            <IconButton
              aria-label="Voltar"
              size="small"
              onClick={() => { if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else navigate("/"); }}
              sx={{ border: "1px solid", borderColor: "divider", flexShrink: 0 }}
            >
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {EDU_ONLY ? (
          <Box aria-label={APP_NAME} sx={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, boxShadow: "0 2px 8px rgba(15,23,42,.18)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg,#0F5FDB,#6366F1)" }}>EM</Box>
        ) : (
          <Box component="img" src={`${import.meta.env.BASE_URL}brand/logo-leao.png`} alt={APP_NAME} sx={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, boxShadow: "0 2px 8px rgba(15,23,42,.18)" }} />
        )}

        <Typography noWrap sx={{ fontWeight: 800, fontSize: { xs: 14, sm: 17 }, flexGrow: 1, minWidth: 0 }}>
          {titulo}
        </Typography>

        <Box sx={{ position: "relative" }}>
          <Tooltip title="Pesquisar módulos (ou tecle /)">
            <IconButton aria-label="Pesquisar módulos" onClick={() => { setSearchOpen((v) => !v); window.setTimeout(() => searchRef.current?.focus(), 0); }}>
              <SearchIcon />
            </IconButton>
          </Tooltip>
          {searchOpen && (
            <Paper
              elevation={8}
              sx={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 1500, width: { xs: "min(92vw,360px)", sm: 380 }, p: 1, borderRadius: 2 }}
            >
              <TextField
                fullWidth
                autoFocus
                size="small"
                placeholder="Pesquisar módulos...  /"
                value={search}
                inputRef={searchRef}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && searchResults[0]) goTo(searchResults[0].path);
                  if (event.key === "Escape") { setSearch(""); setSearchOpen(false); }
                }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
              />
              {searchFocused && search.trim() && (
                <Box sx={{ mt: 1, maxHeight: 320, overflowY: "auto" }}>
                  {searchResults.length ? (
                    searchResults.map((entry) => (
                      <ButtonBase
                        key={`${entry.group}-${entry.label}-${entry.path}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => goTo(entry.path)}
                        sx={{ width: "100%", display: "block", textAlign: "left", px: 1.5, py: 1, borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}
                      >
                        <Typography sx={{ fontWeight: 800, fontSize: 13.5 }}>{entry.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{entry.group}</Typography>
                      </ButtonBase>
                    ))
                  ) : (
                    <Box sx={{ px: 1.5, py: 1.5 }}>
                      <Typography variant="body2" color="text.secondary">Nenhum módulo encontrado.</Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Paper>
          )}
        </Box>

        <Typography noWrap sx={{ display: { xs: "none", sm: "block" }, fontWeight: 600, fontSize: 13, color: "text.secondary", maxWidth: 160 }}>
          {displayName}
        </Typography>

        <Tooltip title={sessionUser ? `${sessionUser.firstName} ${sessionUser.lastName}` : "Perfil do usuário"}>
          <ButtonBase aria-label="Perfil do usuário" aria-haspopup="menu" onClick={openMenu} sx={{ borderRadius: "50%" }}>
            <Avatar sx={{ bgcolor: "primary.main", width: 36, height: 36, fontSize: 14 }}>{initials}</Avatar>
          </ButtonBase>
        </Tooltip>

        <Tooltip title="Opções da conta">
          <IconButton aria-label="Opções da conta" aria-haspopup="menu" onClick={openMenu} edge="end">
            <Badge badgeContent={totalAvisos} color="error" max={99}>
              <MenuIcon />
            </Badge>
          </IconButton>
        </Tooltip>

        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
          <Box sx={{ px: 2, py: 1.25, minWidth: 220 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>{displayName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {demo?.isDemo ? "Demo / Administrador" : sessionUser?.role || "Usuário"}
            </Typography>
          </Box>
          <Divider />

          {podeVerMensagens && (
            <MenuItem onClick={() => { closeMenu(); navigate("/edu/mensagens"); }}>
              <ListItemIcon>
                <Badge badgeContent={msgCount} color={resumoMsg?.pedidos.total ? "error" : "primary"} max={99}>
                  <ForumOutlinedIcon fontSize="small" />
                </Badge>
              </ListItemIcon>
              <ListItemText>Mensageiro interno</ListItemText>
            </MenuItem>
          )}

          <MenuItem onClick={() => { closeMenu(); openAlerts(); }}>
            <ListItemIcon>
              <Badge badgeContent={alertTotal} color={alertError ? "error" : "warning"} max={99}>
                {alertTotal ? <NotificationsActiveIcon fontSize="small" /> : <NotificationsNoneIcon fontSize="small" />}
              </Badge>
            </ListItemIcon>
            <ListItemText>Alertas críticos</ListItemText>
          </MenuItem>

          {!demo?.isDemo && (
            <MenuItem onClick={() => { closeMenu(); navigate("/notificacoes"); }}>
              <ListItemIcon>
                <Badge badgeContent={unreadCount} color="error" max={99}>
                  <NotificationsNoneIcon fontSize="small" />
                </Badge>
              </ListItemIcon>
              <ListItemText>Notificações</ListItemText>
            </MenuItem>
          )}

          <MenuItem onClick={() => { closeMenu(); navigate("/seguranca"); }}>
            <ListItemIcon><SecurityOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Segurança da conta</ListItemText>
          </MenuItem>

          <MenuItem onClick={() => { closeMenu(); window.print(); }}>
            <ListItemIcon><PrintOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Imprimir esta tela</ListItemText>
          </MenuItem>

          <MenuItem onClick={() => { closeMenu(); setFeedbackOpen(true); }}>
            <ListItemIcon><FeedbackOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Relatar problema ou sugestão</ListItemText>
          </MenuItem>

          <MenuItem onClick={() => { closeMenu(); toggleMode(); }}>
            <ListItemIcon>{mode === "light" ? <DarkModeOutlinedIcon fontSize="small" /> : <LightModeOutlinedIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{mode === "light" ? "Ativar modo escuro" : "Ativar modo claro"}</ListItemText>
          </MenuItem>

          <Divider />
          <MenuItem onClick={() => { closeMenu(); endSession(); }}>
            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Sair</ListItemText>
          </MenuItem>
        </Menu>

        <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      </Toolbar>
    </AppBar>
  );
}
