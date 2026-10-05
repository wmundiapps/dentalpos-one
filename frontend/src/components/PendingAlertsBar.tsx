import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, TextField, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import UnlockDeadlineDialog from "./UnlockDeadlineDialog";
import { loadPendingAlerts, PENDING_ALERTS_EVENT, PENDING_ALERTS_MESSAGE, proveLabDelivery, savePendingAlertsSettings, unlockPendingAlerts, type PendingAlerts } from "../services/PendingAlertsApi";

export default function PendingAlertsBar() {
  const [data, setData] = useState<PendingAlerts | null>(null);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [proofFor, setProofFor] = useState<string | null>(null);
  const [deliveryCode, setDeliveryCode] = useState("");

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
  const hasLocked = data.lockedUsers.length > 0;
  if (data.total === 0 && !hasLocked) return null;

  const toggleLock = async () => {
    setError("");
    try { await savePendingAlertsSettings({ mode: data.mode === "BLOCK" ? "ALERT" : "BLOCK" }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível alterar o travamento."); }
  };

  const unlockSelf = async () => {
    setBusy(true);
    setError("");
    try { await unlockPendingAlerts(key); setKey(""); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível destravar."); }
    finally { setBusy(false); }
  };

  const submitProof = async () => {
    if (!proofFor) return;
    setBusy(true);
    setError("");
    try {
      await proveLabDelivery({ localId: proofFor, code: deliveryCode });
      setProofFor(null); setDeliveryCode("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível registrar a entrega."); }
    finally { setBusy(false); }
  };

  return (
    <>
      {data.total > 0 && (
        <Alert severity="error" variant="filled" sx={{ borderRadius: 0, alignItems: "center" }}>
          <Typography sx={{ fontWeight: 800 }}>{data.mode === "BLOCK" ? PENDING_ALERTS_MESSAGE : "Resolva as pendências abaixo. Os avisos e as filas continuam até serem resolvidos."}</Typography>
          {data.canManage && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>{data.mode === "BLOCK" ? "Travamento de tela: LIGADO" : "Travamento de tela: DESLIGADO"}</Typography>
              <Button size="small" variant="outlined" color="inherit" disabled={data.mode !== "BLOCK" && !data.settings?.hasKey} onClick={() => void toggleLock()}>
                {data.mode === "BLOCK" ? "Desligar travamento" : data.settings?.hasKey ? "Ligar travamento" : "Defina a chave em Configurações"}
              </Button>
            </Box>
          )}
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 0.5 }}>
            {data.items.map((item) => (
              <Link key={item.key} component={RouterLink} to={item.path} sx={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}>
                {item.label}
              </Link>
            ))}
            {error && !hasLocked && <Typography variant="caption" sx={{ width: "100%", fontWeight: 700 }}>{error}</Typography>}
            {data.items.flatMap((item) => item.lines || []).length > 0 && (
              <Box sx={{ width: "100%" }}>
                {data.items.flatMap((item) => item.lines || []).map((line, i) => (
                  <Typography key={i} variant="caption" sx={{ display: "block" }}>{`• ${line}`}</Typography>
                ))}
              </Box>
            )}
          </Box>
        </Alert>
      )}

      {/* Admin e gestor: aviso de quem está com a tela travada por pendências. */}
      {hasLocked && (
        <Alert severity="warning" variant="filled" sx={{ borderRadius: 0, alignItems: "center" }}>
          <Typography sx={{ fontWeight: 800 }}>{`Tela travada por pendências: ${data.lockedUsers.length} usuário(s)`}</Typography>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 0.5, alignItems: "center" }}>
            {data.lockedUsers.map((u) => (
              <Box key={u.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{`${u.name} (${u.count} pendência(s))`}</Typography>
                <Button size="small" variant="outlined" color="inherit" onClick={() => setTarget({ id: u.id, name: u.name })}>Destravar</Button>
              </Box>
            ))}
          </Box>
          <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>O usuário também pode se destravar digitando a chave de desbloqueio. A liberação do gestor vale até o novo prazo definido; a da chave, até o fim do dia.</Typography>
          {error && <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>{error}</Typography>}
        </Alert>
      )}

      <UnlockDeadlineDialog user={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); void load(); }} />

      <Dialog open={data.blocked} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900, color: "error.main" }}>Tela travada por pendências</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>{"Existem pendências importantes que não foram resolvidas. Resolva-as ou peça ao gestor a chave de desbloqueio. O admin e o gestor foram avisados."}</Typography>
          {data.items.map((item) => <Typography key={item.key} sx={{ mb: 0.5 }}>{`• ${item.label}`}</Typography>)}
          {(data.blockingLabOrders?.length ?? 0) > 0 && (
            <Box sx={{ mt: 2, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
              <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Resolver agora: dar baixa com o código de entrega</Typography>
              <Typography variant="caption" sx={{ display: "block", mb: 1 }}>O código traz o nome de quem recebeu, a data e a hora, e vem do dentista, da recepção ou da administração. Com ele o trabalho sai da fila e a tela destrava sozinha.</Typography>
              {data.blockingLabOrders!.map((o) => (
                <Box key={o.localId} sx={{ mb: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "space-between" }}>
                    <Typography variant="body2">{`${o.patientName} · ${o.workType}${o.dentistName ? ` (${o.dentistName})` : ""}`}</Typography>
                    <Button size="small" variant="outlined" onClick={() => { setProofFor(proofFor === o.localId ? null : o.localId); setError(""); }}>Informar código</Button>
                  </Box>
                  {proofFor === o.localId && (
                    <Box sx={{ display: "grid", gap: 1, mt: 1 }}>
                      <TextField size="small" multiline minRows={2} label="Código de entrega (gerado por quem recebeu: dentista, recepção ou administração)" value={deliveryCode} onChange={(e) => setDeliveryCode(e.target.value)} />
                      <Button variant="contained" disabled={busy || deliveryCode.trim().length < 20} onClick={() => void submitProof()}>Dar baixa e destravar</Button>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}
          <TextField
            fullWidth
            type="password"
            label="Chave de desbloqueio"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && key) void unlockSelf(); }}
            sx={{ mt: 2 }}
            autoComplete="off"
          />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" color="error" disabled={busy || !key} onClick={() => void unlockSelf()}>Destravar até o fim do dia</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
