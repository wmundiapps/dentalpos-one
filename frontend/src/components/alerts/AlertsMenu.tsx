import { useEffect, useState } from "react";
import { Badge, Box, Chip, Drawer, IconButton, Tooltip, Typography } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate } from "react-router-dom";
import { useCriticalAlerts } from "../../hooks/useCriticalAlerts";
import PendingAlertsBar from "../PendingAlertsBar";
import { ALWAYS, COLORS, DEPARTMENTS, departmentOf, type Department } from "../home/AlertsPanel";

export const OPEN_ALERTS_EVENT = "dentalpos:open-alerts";
export const alertPath = (id: string) => `/alerta/${encodeURIComponent(id)}`;

// Campo "Alertas críticos" logo abaixo do menu. Toque: departamentos (mudam de cor quando há aviso) > lista do departamento > tela do problema.
export const openAlerts = (dept?: Department | null) => window.dispatchEvent(new CustomEvent(OPEN_ALERTS_EVENT, { detail: dept ?? null }));

export default function AlertsMenu({ collapsed }: { collapsed: boolean }) {
  const { alerts } = useCriticalAlerts();
  const setOpen = (_v: boolean) => { void _v; openAlerts(); };
  const hasError = alerts.some((a) => a.severity === "error");
  const level = hasError ? "error" : alerts.length ? "warning" : "none";

  const field = collapsed ? (
    <Tooltip title={alerts.length ? `${alerts.length} alerta(s) crítico(s)` : "Alertas críticos"} placement="right">
      <IconButton onClick={() => setOpen(true)} sx={{ mx: "auto", display: "flex", color: level === "none" ? "#94A3B8" : COLORS[level].main }} aria-label="Alertas críticos">
        <Badge badgeContent={alerts.length} color={hasError ? "error" : "warning"}>{level === "none" ? <NotificationsNoneIcon /> : <NotificationsActiveIcon />}</Badge>
      </IconButton>
    </Tooltip>
  ) : (
    <Box role="button" tabIndex={0} onClick={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
      sx={{ flexShrink: 0, mx: 1, my: 0.8, px: 1.4, py: 1, borderRadius: 2, cursor: "pointer", display: "flex", alignItems: "center", gap: 1,
        bgcolor: level === "none" ? "#1E293B" : level === "error" ? "rgba(211,47,47,.22)" : "rgba(237,108,2,.22)", border: "1px solid", borderColor: level === "none" ? "#334155" : COLORS[level].main, color: "#fff", "&:hover": { filter: "brightness(1.12)" } }}>
      {level === "none" ? <NotificationsNoneIcon fontSize="small" /> : <NotificationsActiveIcon fontSize="small" />}
      <Typography sx={{ fontWeight: 800, fontSize: 13, flex: 1 }}>Alertas críticos</Typography>
      {alerts.length > 0 ? <Chip size="small" label={alerts.length} sx={{ bgcolor: COLORS[level].main, color: "#fff", fontWeight: 800, height: 20 }} /> : <Typography sx={{ fontSize: 11, color: "#94A3B8" }}>em dia</Typography>}
    </Box>
  );

  return field;
}

// Gaveta dos alertas críticos: fica montada uma única vez no Layout e abre por evento (menu lateral, cabeçalho ou tela inicial).
export function AlertsDrawerHost() {
  const navigate = useNavigate();
  const { alerts } = useCriticalAlerts();
  const [open, setOpen] = useState(false);
  const [dept, setDept] = useState<Department | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => { setDept(((e as CustomEvent<Department | null>).detail as Department | null) || null); setOpen(true); };
    window.addEventListener(OPEN_ALERTS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ALERTS_EVENT, onOpen);
  }, []);

  const grouped = new Map<Department, typeof alerts>();
  alerts.forEach((a) => { const d = departmentOf(a); grouped.set(d, [...(grouped.get(d) || []), a]); });
  const list = ([...DEPARTMENTS, "Outros"] as Department[]).filter((d) => ALWAYS.includes(d) || grouped.has(d));
  const close = () => { setOpen(false); setDept(null); };
  const levelOf = (d: Department) => ((grouped.get(d) || []).some((r) => r.severity === "error") ? "error" : (grouped.get(d) || []).length ? "warning" : "none") as "error" | "warning" | "none";

  const rows = dept ? grouped.get(dept) || [] : [];
  return (
    <>
      <Drawer anchor="left" open={open} onClose={close} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 400 }, p: 2 } } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          {dept && <IconButton onClick={() => setDept(null)} aria-label="Voltar aos departamentos"><ArrowBackIcon /></IconButton>}
          <Typography variant="h6" sx={{ fontWeight: 900, flex: 1 }}>{dept ? dept : "Alertas críticos"}</Typography>
          <IconButton onClick={close} aria-label="Fechar"><CloseIcon /></IconButton>
        </Box>
        {!dept && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Toque no departamento para ver os alertas.</Typography>}
        {!dept && (
          <Box sx={{ display: "grid", gap: 0.8 }}>
            {list.map((d) => {
              const lv = levelOf(d); const c = COLORS[lv]; const count = (grouped.get(d) || []).length;
              return (
                <Box key={d} role="button" tabIndex={0} onClick={() => setDept(d)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDept(d); } }}
                  sx={{ display: "flex", alignItems: "center", gap: 1.2, px: 1.5, py: 1.3, borderRadius: 2, cursor: "pointer", bgcolor: c.soft, border: "1px solid", borderColor: lv === "none" ? "divider" : c.main, "&:hover": { filter: "brightness(.97)" } }}>
                  <Box sx={{ width: 11, height: 11, borderRadius: "50%", bgcolor: c.main }} />
                  <Typography sx={{ fontWeight: lv === "none" ? 600 : 800, flex: 1, color: lv === "none" ? "text.secondary" : "text.primary" }}>{d}</Typography>
                  {count > 0 ? <Chip size="small" label={count} sx={{ bgcolor: c.main, color: "#fff", fontWeight: 800 }} /> : <Typography variant="caption" color="text.secondary">em dia</Typography>}
                  <ChevronRightIcon fontSize="small" color="disabled" />
                </Box>
              );
            })}
          </Box>
        )}
        {!dept && <Box sx={{ mx: -2, mt: 2 }}><PendingAlertsBar /></Box>}
        {dept && rows.length === 0 && <Typography color="text.secondary" sx={{ p: 2 }}>Nenhum alerta neste departamento.</Typography>}
        {dept && (
          <Box sx={{ display: "grid", gap: 0.8 }}>
            {rows.map((a) => (
              <Box key={a.id} role="button" tabIndex={0} onClick={() => { close(); navigate(alertPath(a.id)); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); close(); navigate(alertPath(a.id)); } }}
                sx={{ display: "flex", alignItems: "center", gap: 1.2, px: 1.5, py: 1.2, borderRadius: 2, cursor: "pointer", border: "1px solid", borderColor: "divider", borderLeft: `5px solid ${a.severity === "error" ? COLORS.error.main : COLORS.warning.main}`, "&:hover": { bgcolor: "action.hover" } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800 }}>{a.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{a.description}</Typography>
                </Box>
                <ChevronRightIcon fontSize="small" color="disabled" />
              </Box>
            ))}
          </Box>
        )}
      </Drawer>
    </>
  );
}
