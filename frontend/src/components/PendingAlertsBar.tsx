import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Link, Typography } from "@mui/material";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import RiskPolicyDialog, { RISK_YELLOW } from "./RiskPolicyDialog";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { authorizeUnplannedNotice, confirmUnplannedExisting, loadPendingAlerts, PENDING_ALERTS_EVENT, type PendingAlerts } from "../services/PendingAlertsApi";
import { readSessionUser } from "../services/DemoAccess";

export default function PendingAlertsBar() {
  const [data, setData] = useState<PendingAlerts | null>(null);
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const load = useCallback(async () => {
    if (!localStorage.getItem("dentalpos.token")) return;
    // Alunos não têm alertas de gestão: evita um 403 a cada minuto.
    if (String(readSessionUser()?.role || "").toUpperCase() === "STUDENT" || String(readSessionUser()?.role || "").toUpperCase() === "TEACHER" || String(readSessionUser()?.role || "").toUpperCase() === "CLIENTE_CONTABIL") return;
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
  const visibleItems = data.canManage ? data.items : data.items.filter((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
  // Avisos "para conferir" (ex.: parcelas importadas do Clinicorp, pagas pelo banco de lá) ficam fora do risco.
  const shown = visibleItems.filter((item) => !item.info);
  const infoItems = visibleItems.filter((item) => item.info);
  const shownCount = shown.reduce((sum, item) => sum + item.count, 0);
  if (shown.length === 0 && infoItems.length === 0) return null;

  const infoBlock = infoItems.length > 0 && (
    <Alert severity="info" icon={false} sx={{ borderRadius: 0, py: 0.5, "& .MuiAlert-message": { width: "100%" } }}>
      {infoItems.map((item) => (
        <Box key={item.key}>
          <Box role="button" tabIndex={0} onClick={() => setInfoOpen((v) => !v)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setInfoOpen((v) => !v); }} sx={{ cursor: "pointer", display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Typography sx={{ fontWeight: 700, fontSize: 13 }}>Para conferir: {item.label}</Typography>
            <Typography sx={{ fontWeight: 700, fontSize: 12, textDecoration: "underline", whiteSpace: "nowrap" }}>{infoOpen ? "ocultar" : "ver pacientes"}</Typography>
          </Box>
          {infoOpen && (
            <Box sx={{ mt: 0.75 }}>
              <Typography variant="caption" sx={{ display: "block", mb: 0.5 }}>Confira o pagamento no Clinicorp ou no Unicred e dê a baixa em Financeiro (ou pela planilha de baixa na importação). Quem já pagou sai desta lista.</Typography>
              {(item.rows || []).map((r, idx) => <Link key={`${r.patientId}-${idx}`} component={RouterLink} to={r.to || item.path} sx={{ display: "block", color: "inherit", fontSize: 12, textDecoration: "underline", my: 0.3 }}>{`• ${r.patientName}: ${r.summary}`}</Link>)}
            </Box>
          )}
        </Box>
      ))}
    </Alert>
  );

  if (shown.length === 0) return <>{infoBlock}</>;

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
            <Typography sx={{ fontWeight: 800 }}>Resolva as pendências abaixo em até 24 horas. Se não forem resolvidas, seu gestor será notificado. Os avisos e as filas continuam até serem resolvidos.</Typography>
            <Box sx={{ display: "grid", gap: 0.5, mt: 0.75 }}>
              {shown.map((item) => (
                <Box key={item.key}>
                  <Link component={RouterLink} to={item.path} sx={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}>{item.label}</Link>
                  {item.rows?.length ? item.rows.map((r, idx) => item.key !== "budget" ? (
                    <Box key={`${r.patientId}-${idx}`} sx={{ my: 0.3 }}>
                      <Link component={RouterLink} to={r.to || item.path} sx={{ color: "inherit", fontSize: 12, textDecoration: "underline" }}>{`• ${r.patientName}: ${r.summary}`}</Link>
                    </Box>
                  ) : (
                    <Box key={r.patientId} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", my: 0.4 }}>
                      <Typography variant="caption" sx={{ flex: "1 1 320px", minWidth: 0 }}>{`• ${r.patientName}: ${r.summary}`}</Typography>
                      <Button size="small" variant="contained" color="inherit" sx={{ color: "error.main", fontWeight: 800, py: 0 }} onClick={async () => { if (window.confirm(`Confirmar que os procedimentos de ${r.patientName} já estavam incluídos no tratamento (não são novos)?`)) { try { await confirmUnplannedExisting(r.patientId); } catch (e) { window.alert(e instanceof Error ? e.message : "Não foi possível confirmar."); } } }}>Já estava no tratamento</Button>
                      {data.canManage && (r.noticeSent
                        ? <Typography variant="caption" sx={{ fontWeight: 800 }}>Aviso ao paciente enviado</Typography>
                        : <Button size="small" variant="outlined" color="inherit" sx={{ fontWeight: 800, py: 0 }} onClick={async () => {
                            if (!window.confirm(`Autorizar o envio ao paciente ${r.patientName}?\n\nO paciente receberá, por e-mail, o aviso de que foi identificado o procedimento (${r.summary}) e que deve conferir com a clínica se já está no orçamento inicial ou se precisa de nova combinação financeira.\n\nConfira antes se o lançamento ou o orçamento inicial não tem erro de preenchimento.`)) return;
                            try {
                              const res = await authorizeUnplannedNotice(r.patientId);
                              window.alert(res.sent ? "Aviso enviado ao paciente por e-mail." : `O paciente não tem e-mail válido cadastrado. Envie este texto por outro canal:\n\n${res.text}`);
                            } catch (e) { window.alert(e instanceof Error ? e.message : "Não foi possível enviar o aviso."); }
                          }}>Autorizar aviso ao paciente</Button>)}
                      <Button size="small" component={RouterLink} to={`/orcamentos-tratamentos?patientId=${encodeURIComponent(r.patientId)}`} sx={{ color: "#fff", textDecoration: "underline", py: 0 }}>É novo: passar orçamento</Button>
                    </Box>
                  )) : (item.lines || []).map((line, i) => <Typography key={i} variant="caption" sx={{ display: "block" }}>{`• ${line}`}</Typography>)}
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
      {infoBlock}
      <RiskPolicyDialog open={riskOpen} onClose={() => setRiskOpen(false)} />
    </>
  );
}
