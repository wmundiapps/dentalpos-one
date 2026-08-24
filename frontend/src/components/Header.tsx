import {
  AppBar,
  Avatar,
  Badge,
  Box,
  IconButton,
  InputAdornment,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";

import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import SearchIcon from "@mui/icons-material/Search";

import { useNavigate } from "react-router-dom";

import BrandName from "./BrandName";
import { appConfig } from "../config/app";
import { useAppTheme } from "../contexts/AppThemeContext";
import { notifications } from "../services/NotificationService";

export default function Header() {
  const navigate = useNavigate();
  const { mode, toggleMode } = useAppTheme();

  const unreadCount = notifications.filter(
    (notification) => !notification.lida,
  ).length;

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
        backgroundColor: mode === "light" ? "rgba(255,255,255,.86)" : "rgba(17,28,45,.86)",
        boxShadow: mode === "light" ? "0 8px 28px rgba(15,23,42,.04)" : "0 8px 28px rgba(0,0,0,.16)",
        zIndex: 10,
      }}
    >
      <Toolbar
        sx={{
          gap: 2,
          minHeight: 72,
        }}
      >
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              color: "primary.main",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            <BrandName />
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
          >
            {appConfig.environment}
          </Typography>
        </Box>

        <TextField
          size="small"
          placeholder="Pesquisar no sistema..."
          sx={{
            width: {
              xs: 180,
              md: 420,
            },
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

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip
          title={
            mode === "light"
              ? "Ativar modo escuro"
              : "Ativar modo claro"
          }
        >
          <IconButton onClick={toggleMode}>
            {mode === "light" ? (
              <DarkModeOutlinedIcon />
            ) : (
              <LightModeOutlinedIcon />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip title="Abrir notificações">
          <IconButton
            onClick={() => navigate("/notificacoes")}
          >
            <Badge
              badgeContent={unreadCount}
              color="error"
            >
              <NotificationsNoneIcon />
            </Badge>
          </IconButton>
        </Tooltip>

        <Tooltip title="Perfil do usuário">
          <Avatar
            sx={{
              bgcolor: "primary.main",
              width: 40,
              height: 40,
            }}
          >
            R
          </Avatar>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}