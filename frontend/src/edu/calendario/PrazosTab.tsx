import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Paper, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Card, fmtDT, itemsOf, Row, rotuloTipo, toISO, useGet, useTerms, useToast } from "./kit";

const TIPOS = ["LANCAMENTO_NOTAS", "DIARIO_CLASSE", "FECHAMENTO_FINAL", "REVISAO_NOTAS", "RECUPERACAO"];
const SIT: Record<string, { cor: string; label: string }> = {
  NAO_ABERTO: { cor: "#64748b", label: "Ainda não aberto" }, ABERTO: { cor: "#16a34a", label: "Aberto" }, VENCE_EM_BREVE: { cor: "#f59e0b", label: "Vence em breve" },
  ENCERRADO: { cor: "#dc2626", label: "Encerrado" }, CANCELADO: { cor: "#94a3b8", label: "Cancelado" },
};

export default function PrazosTab() {
  const terms = useTerms();
  const [termId, setTermId] = useState("");
  const lista = useGet<any>(`/calendario/prazos${qsOf({ termId })}`);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Record<string, any>>({ tipo: "LANCAMENTO_NOTAS" });
  const [pend, setPend] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();
  const items = itemsOf(lista.data);

  async function salvar() {
    setBusy(true);
    try {
      await eduApi.post("/calendario/prazos", { termId: f.termId, tipo: f.tipo, titulo: f.titulo, etapa: f.etapa || undefined, abertura: f.abertura ? toISO(f.abertura) : undefined, prazo: toISO(f.prazo) });
      toast({ type: "success", text: "Prazo criado e lembretes agendados." }); setOpen(false); lista.reload();
    } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }
  async function prorrogar(p: any) {
    const novo = window.prompt("Novo prazo (AAAA-MM-DDTHH:MM):"); if (!novo) return;
    const motivo = window.prompt("Motivo da prorrogação (mín. 5 caracteres):"); if (!motivo) return;
    try { await eduApi.post(`/calendario/prazos/${p.id}/prorrogar`, { novoPrazo: toISO(novo), motivo }); toast({ type: "success", text: "Prazo prorrogado." }); lista.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function remover(p: any) {
    if (!window.confirm(`Excluir o prazo "${p.titulo}"?`)) return;
    try { await eduApi.del(`/calendario/prazos/${p.id}`); lista.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function pendencias(p: any) {
    try { setPend(await eduApi.get(`/calendario/prazos/${p.id}/pendencias`)); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  const abertos = items.filter((p) => p.aberto).length;
  const breve = items.filter((p) => p.situacao === "VENCE_EM_BREVE").length;
  return (
    <Box>
      <Row>
        <Card label="Prazos" value={items.length} /><Card label="Abertos" value={abertos} color="#16a34a" /><Card label="Vencem em até 3 dias" value={breve} color="#f59e0b" />
        <Card label="Encerrados" value={items.filter((p) => p.situacao === "ENCERRADO").length} color="#dc2626" />
      </Row>
      <Row>
        <TextField select size="small" label="Período letivo" value={termId} onChange={(e) => setTermId(e.target.value)} sx={{ minWidth: 220 }}><MenuItem value="">Todos</MenuItem>{terms.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}</TextField>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setF({ tipo: "LANCAMENTO_NOTAS", termId }); setOpen(true); }}>Novo prazo</Button>
      </Row>
      {lista.error ? <Alert severity="warning">Não foi possível carregar os prazos: {lista.error}</Alert> : null}
      {!lista.error && !lista.loading && !items.length ? <Alert severity="info">Nenhum prazo de lançamento cadastrado.</Alert> : null}
      {items.map((p: any) => {
        const s = SIT[p.situacao] || SIT.ABERTO;
        const ini = p.abertura ? new Date(p.abertura).getTime() : new Date(p.createdAt || p.prazo).getTime();
        const fim = new Date(p.efetivo || p.prazo).getTime();
        const pct = Math.max(0, Math.min(100, ((Date.now() - ini) / Math.max(1, fim - ini)) * 100));
        return (
          <Paper key={p.id} variant="outlined" sx={{ p: 2, mb: 1.5, borderRadius: 3, borderLeft: `6px solid ${s.cor}` }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 240 }}>
                <Typography sx={{ fontWeight: 700 }}>{p.titulo}</Typography>
                <Typography variant="caption" color="text.secondary">{rotuloTipo(p.tipo)}{p.etapa ? ` · ${p.etapa}` : ""} · prazo {fmtDT(p.efetivo || p.prazo)}{p.prorrogado ? " (prorrogado)" : ""}{p.aberto ? ` · ${p.diasRestantes} dia(s) restante(s)` : ""}</Typography>
              </Box>
              <Chip size="small" label={s.label} sx={{ bgcolor: s.cor, color: "#fff" }} />
              <Button size="small" onClick={() => pendencias(p)}>Pendências</Button>
              <Button size="small" onClick={() => prorrogar(p)}>Prorrogar</Button>
              <Button size="small" color="error" onClick={() => remover(p)}>Excluir</Button>
            </Box>
            <LinearProgress variant="determinate" value={p.situacao === "ENCERRADO" ? 100 : pct} sx={{ mt: 1, height: 6, borderRadius: 3, "& .MuiLinearProgress-bar": { bgcolor: s.cor } }} />
          </Paper>
        );
      })}

      <Dialog open={!!pend} onClose={() => setPend(null)} fullWidth maxWidth="sm">
        <DialogTitle>Pendências — {pend?.prazo?.titulo}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>{pend?.concluidos?.length ?? 0} de {pend?.total ?? 0} professores concluíram.</Typography>
          {(pend?.pendentes || []).length ? (pend.pendentes as any[]).map((x) => (
            <Box key={x.userId} sx={{ display: "flex", justifyContent: "space-between", py: 0.5, borderBottom: 1, borderColor: "divider" }}>
              <Typography variant="body2">{x.nome || x.userId}</Typography>
              <Chip size="small" color={x.vencido ? "error" : "warning"} label={x.vencido ? "Vencido" : "Pendente"} />
            </Box>
          )) : <Alert severity="success">Sem pendências.</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={() => setPend(null)}>Fechar</Button></DialogActions>
      </Dialog>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo prazo de lançamento</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
          <TextField select required label="Período letivo" value={f.termId || ""} onChange={(e) => setF({ ...f, termId: e.target.value })}>{terms.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}</TextField>
          <TextField select label="Tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{TIPOS.map((t) => <MenuItem key={t} value={t}>{rotuloTipo(t)}</MenuItem>)}</TextField>
          <TextField required label="Título" value={f.titulo || ""} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          <TextField label="Etapa (ex.: N1)" value={f.etapa || ""} onChange={(e) => setF({ ...f, etapa: e.target.value })} />
          <TextField label="Abertura (opcional)" type="datetime-local" slotProps={{ inputLabel: { shrink: true } }} value={f.abertura || ""} onChange={(e) => setF({ ...f, abertura: e.target.value })} />
          <TextField required label="Prazo final" type="datetime-local" slotProps={{ inputLabel: { shrink: true } }} value={f.prazo || ""} onChange={(e) => setF({ ...f, prazo: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="contained" disabled={busy || !f.termId || !f.titulo || !f.prazo} onClick={salvar}>Salvar</Button></DialogActions>
      </Dialog>
      {node}
    </Box>
  );
}
