import {
  Avatar,
  Box,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";

import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import MenuIcon from "@mui/icons-material/Menu";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useEffect, useState } from "react";

import BrandName from "./BrandName";
import { appConfig } from "../config/app";
import { navigationItems } from "../config/navigation";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isDesign =
    location.pathname === "/design" ||
    location.pathname.startsWith("/design/");

  const [collapsed, setCollapsed] =
    useState(isDesign);

  useEffect(() => {
    if (isDesign) {
      setCollapsed(true);
    }
  }, [isDesign]);

  const sidebarWidth = collapsed ? 72 : 270;

  return (
    <Box
      component="aside"
      sx={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        height: "100vh",
        bgcolor: "#0F172A",
        color: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        overflowY: "auto",
        overflowX: "visible",

        transition:
          "width 0.25s ease, min-width 0.25s ease",

        flexShrink: 0,
      }}
    >
      <Tooltip title={collapsed ? "Expandir menu" : "Recolher menu"} placement="right">
        <IconButton onClick={() => setCollapsed((value) => !value)} size="small" sx={{position:"fixed",left:sidebarWidth-16,top:"50%",transform:"translateY(-50%)",zIndex:1400,width:32,height:54,borderRadius:"0 12px 12px 0",bgcolor:"#0F172A",color:"#fff",border:"1px solid #334155",boxShadow:"0 8px 24px rgba(0,0,0,.28)",transition:"left .25s ease","&:hover":{bgcolor:"primary.main"}}}>{collapsed ? <MenuIcon fontSize="small" /> : <MenuOpenIcon fontSize="small" />}</IconButton>
      </Tooltip>
      {/* TOPO / PERFIL */}

      <Box
        sx={{
          px: collapsed ? 1 : 3,
          pt: 2,
          pb: collapsed ? 1.5 : 2,
          textAlign: "center",
          position: "relative",
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: collapsed
              ? "center"
              : "flex-end",
            mb: 1,
          }}
        >
          <Tooltip
            title={
              collapsed
                ? "Expandir menu"
                : "Recolher menu"
            }
            placement="right"
          >
            <IconButton
              onClick={() =>
                setCollapsed((value) => !value)
              }
              size="small"
              sx={{
                color: "#94A3B8",

                "&:hover": {
                  color: "#FFFFFF",
                  bgcolor: "#1E293B",
                },
              }}
            >
              {collapsed ? (
                <MenuIcon />
              ) : (
                <MenuOpenIcon />
              )}
            </IconButton>
          </Tooltip>
        </Box>

        <Avatar
          sx={{
            width: collapsed ? 42 : 72,
            height: collapsed ? 42 : 72,
            mx: "auto",
            mb: collapsed ? 0 : 2,
            bgcolor: "primary.main",
            fontSize: collapsed ? 18 : 28,

            transition:
              "width 0.25s ease, height 0.25s ease",
          }}
        >
          R
        </Avatar>

        {!collapsed && (
          <>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
              }}
            >
              Dr. Robson
            </Typography>

            <Typography
              variant="body2"
              sx={{
                color: "#94A3B8",
              }}
            >
              Administrador
            </Typography>
          </>
        )}
      </Box>

      <Divider
        sx={{
          borderColor: "#334155",
        }}
      />

      {/* NAVEGAÇÃO */}

      <List
        sx={{
          mt: 1,
          px: collapsed ? 0.75 : 1,
        }}
      >
        {navigationItems.map((item) => {
          const selected =
            location.pathname === item.path;

          const button = (
            <ListItemButton
              key={item.path}
              selected={selected}
              onClick={() => navigate(item.path)}
              sx={{
                mb: 0.5,
                minHeight: 48,
                borderRadius: 2,

                justifyContent: collapsed
                  ? "center"
                  : "flex-start",

                px: collapsed ? 1 : 2,

                color: selected
                  ? "#FFFFFF"
                  : "#CBD5E1",

                "&.Mui-selected": {
                  bgcolor: "#1976D2",
                  color: "#FFFFFF",
                },

                "&.Mui-selected:hover": {
                  bgcolor: "#1565C0",
                },

                "&:hover": {
                  bgcolor: "#1E293B",
                  color: "#FFFFFF",
                },
              }}
            >
              <ListItemIcon
                sx={{
                  color: "inherit",

                  minWidth: collapsed
                    ? 0
                    : 40,

                  mr: collapsed
                    ? 0
                    : 1,

                  justifyContent: "center",
                }}
              >
                {item.icon}
              </ListItemIcon>

              {!collapsed && (
                <ListItemText
                  primary={item.label}
                />
              )}
            </ListItemButton>
          );

          if (collapsed) {
            return (
              <Tooltip
                key={item.path}
                title={item.label}
                placement="right"
                arrow
              >
                {button}
              </Tooltip>
            );
          }

          return button;
        })}
      </List>

      <Box sx={{ flexGrow: 1 }} />

      {/* RODAPÉ */}

      <Box
        sx={{
          py: 2,
          textAlign: "center",
          color: "#64748B",
          whiteSpace: "nowrap",
        }}
      >
        {collapsed ? (
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            DP
          </Typography>
        ) : (
          <Typography
            sx={{
              fontSize: 12,
            }}
          >
            <BrandName /> • {appConfig.version}
          </Typography>
        )}
      </Box>
    </Box>
  );
}