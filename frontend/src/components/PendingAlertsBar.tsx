import { useCallback, useEffect, useState } from "react";
import { Box, Link, Typography } from "@mui/material";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import RiskPolicyDialog, { RISK_YELLOW } from "./RiskPolicyDialog";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { loadPendingAlerts, PENDING_ALERTS_EVENT, type PendingAlerts } from "../services/PendingAlertsApi";

export default function PendingAlertsBar() {
  const [data, setData] = useState<PendingAlerts | null>(null);
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);

  const load = useCallback(async () => {
    if (!localStorage.getItem("dentalpos.token")) return;
    try { setData(await loadPendingAlerts()); } catch { /* o aviso nunca atrapalha o uso do sistema */ }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    window.addEventListener(PENDING_ALERTS_EVENT, load);
    return () => { window.clearInterval(timer); window.removeEventListener(PENDING_ALERTS_EVENT, load); };
  }, [load]);

  if (!data || !data.enabled) return null;
  // Gestor/admin veem todas as pendências; cada departamento vê só a da sua própria tela.
  const shown = data.canManage ? data.items : data.items.filter((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
  const shownCount = shown.reduce((sum, item) => sum + item.count, 0);
  if (shown.length === 0) return null;

  return (
    <>
      <Box role="alert" sx={{ bgcolor: "error.main", color: "#fff", px: 2, py: 0.75 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, minWidth: 0 }}>
          <Box role="button" tabIndex={0} aria-label="Você está em risco: ver as consequências" title="Clique para ver o prazo e as consequências" onClick={() => setRiskOpen(true)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setRiskOpen(true); }} sx={{ display: "flex", alignItems: "center", gap: 0.8, cursor: "pointer", flexShrink: 0 }}>
            <ReportProblemIcon sx={{ color: RISK_YELLOW, fontSize: 30 }} />
            <Typography sx={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.3 }}>VOCÊ ESTÁ EM RISCO</Typography>
          </Box>
          <Box role="button" tabIndex={0} onClick={() => setExpanded((v) => !v)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v); }} sx={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 700, fontSize: 13 }}>
              {shown.length === 1 ? shown[0].label : `${shownCount} pendência(s) em ${shown.length} áreas`}
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", textDecoration: "underline" }}>{expanded ? "ocultar" : "ver tudo"}</Typography>
          </Box>
        </Box>
        {expanded && (
          <Box sx={{ mt: 1 }}>
            <Typography sx={{ fontWeight: 800 }}>Resolva as pendências abaixo em até 24 horas. Os avisos e as filas continuam até serem resolvidos.</Typography>
            <Box sx={{ display: "grid", gap: 0.5, mt: 0.75 }}>
              {shown.map((item) => (
                <Box key={item.key}>
                  <Link component={RouterLink} to={item.path} sx={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}>{item.label}</Link>
                  {(item.lines || []).map((line, i) => <Typography key={i} variant="caption" sx={{ display: "block" }}>{`• ${line}`}</Typography>)}
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
      <RiskPolicyDialog open={riskOpen} onClose={() => setRiskOpen(false)} />
    </>
  );
}
