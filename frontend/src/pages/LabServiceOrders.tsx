import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import { PENDING_ALERTS_EVENT } from "../services/PendingAlertsApi";
import LabServiceOrderDialog from "../components/LabServiceOrderDialog";
import { accompanyingItems, printLabLabels, printLabOrder } from "../utils/labOrderPrint";
import {
  deliverLabOrder, loadLabServiceOrders, registerLabReceipt, reportLabOrderError, resolveLabOrderError, RESPONSIBLE_LABELS,
  updateLabOrderProgress, PROGRESS_PRESETS, STAGE_LABELS,
  type ErrorResponsible, type LabOrderStage, type LabServiceOrder,
} from "../services/LabServiceOrderApi";

const STATUS: Record<string, { label: string; color: "default" | "warning" | "success" | "error" | "info" }> = {
  SENT: { label: "Enviado — aguardando recebimento", color: "warning" },
  RECEIVED: { label: "RECEBIDO pelo laboratório", color: "info" },
  REFUSED: { label: "RECUSADO pelo laboratório", color: "error" },
  DELIVERED: { label: "Entregue à clínica", color: "success" },
};
const dmy = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const dmyHm = (iso: string) => new Date(iso).toLocaleString("pt-BR");

export default function LabServiceOrders() {
  const [orders, setOrders] = useState<LabServiceOrder[]>([]);
  const [filter, setFilter] = useState("OPEN");
  const [error, setError] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [rcCode, setRcCode] = useState("");
  const [receipt, setReceipt] = useState<{ order: LabServiceOrder; outcome: "RECEIVED" | "REFUSED" } | null>(null);
  const [rcName, setRcName] = useState("");
  const [rcReason, setRcReason] = useState("");
  const [errOrder, setErrOrder] = useState<LabServiceOrder | null>(null);
  const [errType, setErrType] = useState<ErrorResponsible | "">("");
  const [errName, setErrName] = useState("");
  const [errText, setErrText] = useState("");
  const [busy, setBusy] = useState(false);
  // Andamento: etapa + texto de como está o trabalho.
  const [progOrder, setProgOrder] = useState<LabServiceOrder | null>(null);
  const [progStage, setProgStage] = useState<LabOrderStage>("IN_PROGRESS");
  const [progNote, setProgNote] = useState("");

  const refresh = useCallback(async () => {
    try { setOrders(await loadLabServiceOrders()); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar as ordens."); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const shown = useMemo(() => orders.filter((o) => filter === "ALL" ? true : filter === "OPEN" ? o.status !== "DELIVERED" : o.status === filter), [orders, filter]);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await refresh(); } catch (e) { window.alert(e instanceof Error ? e.message : "Não foi possível concluir."); } finally { setBusy(false); }
  };

  return (
    <Box>
      <PageHeader title="Ordens de serviço do laboratório" description="Todo trabalho enviado ao laboratório tem protocolo, impressão da ordem e das etiquetas, confirmação de recebimento e registro de erros." />
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
        <Button variant="contained" onClick={() => setNewOpen(true)}>Nova ordem de serviço</Button>
        <TextField select size="small" label="Mostrar" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="OPEN">Em andamento</MenuItem>
          <MenuItem value="SENT">Aguardando recebimento</MenuItem>
          <MenuItem value="REFUSED">Recusadas</MenuItem>
          <MenuItem value="RECEIVED">Recebidas pelo laboratório</MenuItem>
          <MenuItem value="DELIVERED">Entregues</MenuItem>
          <MenuItem value="ALL">Todas</MenuItem>
        </TextField>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {shown.length === 0 && !error && <Alert severity="info">Nenhuma ordem de serviço nesta lista.</Alert>}
      <Box sx={{ display: "grid", gap: 2 }}>
        {shown.map((o) => {
          const st = STATUS[o.status] || { label: o.status, color: "default" as const };
          const openErrors = (o.errors || []).filter((e) => !e.resolved);
          const late = o.status === "RECEIVED" && new Date(o.dueAt).getTime() < Date.now() - 86400000;
          return (
            <Paper key={o.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 900, fontSize: 18 }}>{o.protocol} · {o.patientName}</Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Chip color={st.color} label={st.label} />
                  {late && <Chip color="error" label="Entrega atrasada" />}
                  {openErrors.length > 0 && <Chip color="error" variant="outlined" label={`${openErrors.length} erro(s) em aberto`} />}
                </Box>
              </Box>
              <Typography variant="body2" sx={{ mt: 0.5 }}>{o.service} · elementos {o.elements} · cor {o.shade}</Typography>
              <Typography variant="body2" color="text.secondary">Laboratório: {o.laboratoryName} · Dentista: {o.dentistName} · Auxiliar: {o.assistantName}</Typography>
              <Typography variant="body2" color="text.secondary">Envio {dmy(o.sentAt)} · Entrega {dmy(o.dueAt)} · Acompanha: {accompanyingItems(o).join(", ")}</Typography>
              {o.status === "RECEIVED" && <Alert severity="success" sx={{ mt: 1 }}>RECEBIDO pelo laboratório — por {o.receivedByName} em {o.receivedAt ? dmyHm(o.receivedAt) : ""}</Alert>}
              {(o.status === "RECEIVED" || o.status === "DELIVERED") && (
                <Box sx={{ mt: 1, p: 1.25, borderRadius: 2, bgcolor: "action.hover", border: 1, borderColor: "divider" }}>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="body2" sx={{ fontWeight: 900 }}>Andamento:</Typography>
                    <Chip size="small" color={o.status === "DELIVERED" ? "success" : o.stage === "FINISHED" ? "success" : "info"} variant={o.status === "DELIVERED" || o.stage === "FINISHED" ? "filled" : "outlined"} label={o.status === "DELIVERED" ? STAGE_LABELS.DELIVERED : STAGE_LABELS[o.stage || "IN_PROGRESS"]} />
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{o.progressNote || "Sem informação de andamento ainda."}</Typography>
                  </Box>
                  {o.progressAt && <Typography variant="caption" color="text.secondary">Atualizado por {o.progressByName || "—"} em {dmyHm(o.progressAt)}</Typography>}
                  {(o.progressLog || []).length > 1 && (
                    <Box component="details" sx={{ mt: 0.5 }}>
                      <summary style={{ cursor: "pointer", fontSize: 12 }}>Ver histórico do andamento ({(o.progressLog || []).length})</summary>
                      {[...(o.progressLog || [])].reverse().slice(0, 12).map((h, i) => (
                        <Typography key={i} variant="caption" sx={{ display: "block" }}>{dmyHm(h.at)} · {STAGE_LABELS[h.stage] || h.stage}{h.note ? ` — ${h.note}` : ""}{h.byName ? ` (${h.byName})` : ""}</Typography>
                      ))}
                    </Box>
                  )}
                </Box>
              )}
              {o.status === "REFUSED" && <Alert severity="error" sx={{ mt: 1 }}>RECUSADO pelo laboratório — por {o.receivedByName} em {o.receivedAt ? dmyHm(o.receivedAt) : ""}. Motivo: {o.refusalReason}</Alert>}
              {(o.errors || []).map((e) => (
                <Alert key={e.id} severity={e.resolved ? "success" : "warning"} sx={{ mt: 1 }}
                  action={!e.resolved ? <Button size="small" onClick={() => { const r = window.prompt("Como o erro foi tratado com o responsável?"); if (r) void act(() => resolveLabOrderError(o.id, e.id, r)); }}>Marcar tratado</Button> : undefined}>
                  <b>Erro — responsável: {RESPONSIBLE_LABELS[e.responsibleType] || e.responsibleType}{e.responsibleName ? ` (${e.responsibleName})` : ""}</b><br />{e.description}
                  {e.resolved && <><br /><i>Tratado: {e.resolution}</i></>}
                </Alert>
              ))}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
                {o.receiptCode && o.status === "SENT" && <Chip size="small" color="warning" label={`Código de recebimento: ${o.receiptCode}`} sx={{ fontWeight: 900 }} />}
                <Button size="small" variant="outlined" onClick={() => printLabOrder(o)}>Imprimir ordem de serviço</Button>
                <Button size="small" variant="outlined" onClick={() => printLabLabels(o)}>Imprimir etiquetas do protocolo</Button>
                {o.status === "SENT" && <>
                  <Button size="small" color="success" variant="contained" disabled={busy} onClick={() => { setReceipt({ order: o, outcome: "RECEIVED" }); setRcCode(""); setRcName(""); setRcReason(""); }}>Laboratório recebeu</Button>
                  <Button size="small" color="error" variant="outlined" disabled={busy} onClick={() => { setReceipt({ order: o, outcome: "REFUSED" }); setRcCode(""); setRcName(""); setRcReason(""); }}>Laboratório recusou</Button>
                </>}
                {o.status === "RECEIVED" && <Button size="small" color="success" variant="outlined" disabled={busy} onClick={() => { if (window.confirm("Confirmar que o trabalho voltou do laboratório para a clínica?")) void act(() => deliverLabOrder(o.id)); }}>Registrar entrega à clínica</Button>}
                {(o.status === "RECEIVED" || o.status === "DELIVERED") && <Button size="small" variant="contained" disabled={busy} onClick={() => { setProgOrder(o); setProgStage(o.status === "DELIVERED" ? "DELIVERED" : (o.stage || "IN_PROGRESS")); setProgNote(""); }}>Atualizar andamento</Button>}
                <Button size="small" color="warning" variant="outlined" onClick={() => { setErrOrder(o); setErrType(""); setErrName(""); setErrText(""); }}>Registrar erro</Button>
              </Box>
            </Paper>
          );
        })}
      </Box>

      <LabServiceOrderDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={(order) => { setNewOpen(false); void refresh(); printLabOrder(order); }} />

      <Dialog open={Boolean(receipt)} onClose={() => setReceipt(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>{receipt?.outcome === "RECEIVED" ? "Laboratório recebeu o trabalho" : "Laboratório recusou o trabalho"} — {receipt?.order.protocol}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField label="Código de recebimento (impresso na ordem de serviço)" value={rcCode} onChange={(e) => setRcCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required slotProps={{ htmlInput: { inputMode: "numeric" } }} />
          <TextField label="Nome de quem recebeu / recusou no laboratório" value={rcName} onChange={(e) => setRcName(e.target.value)} required />
          {receipt?.outcome === "REFUSED" && <TextField label="Motivo da recusa" value={rcReason} onChange={(e) => setRcReason(e.target.value)} multiline minRows={3} required />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceipt(null)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || !rcName.trim() || rcCode.length < 6 || (receipt?.outcome === "REFUSED" && !rcReason.trim())}
            onClick={() => receipt && void act(async () => { await registerLabReceipt(receipt.order.id, receipt.outcome, rcName.trim(), rcReason.trim(), rcCode.trim()); setReceipt(null); })}>Registrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(progOrder)} onClose={() => setProgOrder(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Andamento — {progOrder?.protocol} · {progOrder?.patientName}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField select label="Etapa" value={progStage} onChange={(e) => setProgStage(e.target.value as LabOrderStage)} disabled={progOrder?.status === "DELIVERED"}>
            <MenuItem value="IN_PROGRESS">{STAGE_LABELS.IN_PROGRESS}</MenuItem>
            <MenuItem value="FINISHED">{STAGE_LABELS.FINISHED} (pronto no laboratório)</MenuItem>
            <MenuItem value="DELIVERED">{STAGE_LABELS.DELIVERED} (voltou para a clínica)</MenuItem>
          </TextField>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Como está o trabalho? (toque numa frase ou escreva)</Typography>
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
              {PROGRESS_PRESETS.map((p) => <Chip key={p} size="small" clickable label={p} color={progNote === p ? "primary" : "default"} variant={progNote === p ? "filled" : "outlined"} onClick={() => setProgNote(p)} />)}
            </Box>
          </Box>
          <TextField label="Como está (texto livre)" value={progNote} onChange={(e) => setProgNote(e.target.value)} multiline minRows={2} placeholder="Ex.: falta fresar o coping do 36; material chega quinta" slotProps={{ htmlInput: { maxLength: 500 } }} />
          {progOrder?.progressNote && <Typography variant="caption" color="text.secondary">Último registro: {progOrder.progressNote}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProgOrder(null)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || (!progNote.trim() && progStage === (progOrder?.status === "DELIVERED" ? "DELIVERED" : progOrder?.stage || "IN_PROGRESS"))}
            onClick={() => progOrder && void act(async () => {
              if (progStage === "DELIVERED" && progOrder.status !== "DELIVERED" && !window.confirm("Confirmar que o trabalho voltou do laboratório para a clínica?")) return;
              await updateLabOrderProgress(progOrder.id, progStage, progNote.trim());
              setProgOrder(null);
              window.dispatchEvent(new Event(PENDING_ALERTS_EVENT)); // atualiza a faixa de avisos na hora
            })}>Salvar andamento</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(errOrder)} onClose={() => setErrOrder(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Registrar erro — {errOrder?.protocol}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <Typography variant="body2" color="text.secondary">O erro é tratado com o responsável: auxiliar, dentista, recepção ou laboratório.</Typography>
          <TextField select label="Responsável pelo erro" value={errType} onChange={(e) => setErrType(e.target.value as ErrorResponsible)} required>
            {(Object.keys(RESPONSIBLE_LABELS) as ErrorResponsible[]).map((k) => <MenuItem key={k} value={k}>{RESPONSIBLE_LABELS[k]}</MenuItem>)}
          </TextField>
          <TextField label="Nome do responsável (opcional)" value={errName} onChange={(e) => setErrName(e.target.value)} />
          <TextField label="Relato do erro ocorrido" value={errText} onChange={(e) => setErrText(e.target.value)} multiline minRows={3} required />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setErrOrder(null)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || !errType || errText.trim().length < 5}
            onClick={() => errOrder && errType && void act(async () => { await reportLabOrderError(errOrder.id, errType, errName.trim(), errText.trim()); setErrOrder(null); })}>Registrar erro</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
