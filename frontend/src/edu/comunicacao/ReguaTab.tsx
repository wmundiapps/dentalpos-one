import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { BASE, CANAIS_ENVIO, ROTULO_CANAL, Section, Stat, StateBox, StatusPill, asList, fmtDateTime, useLoad, type Toast } from "./common";

const rotuloOffset = (d: number) => (d === 0 ? "No dia" : d < 0 ? `${Math.abs(d)}d antes` : `${d}d depois`);
const corOffset = (d: number) => (d <= 0 ? "#2e7d32" : d <= 5 ? "#ed6c02" : "#d32f2f");

/** Linha do tempo horizontal: vencimento no marco 0, etapas posicionadas pelo deslocamento em dias. */
function Timeline({ etapas }: { etapas: any[] }) {
  if (!etapas.length) return <Typography variant="body2" color="text.secondary">Sem etapas.</Typography>;
  const offs = etapas.map((e) => e.offsetDias);
  const min = Math.min(-1, ...offs);
  const max = Math.max(1, ...offs);
  const pos = (d: number) => ((d - min) / (max - min)) * 100;
  return (
    <Box sx={{ position: "relative", height: 90, mx: 4, my: 1 }}>
      <Box sx={{ position: "absolute", top: 34, left: 0, right: 0, height: 4, bgcolor: "divider", borderRadius: 2 }} />
      <Box sx={{ position: "absolute", top: 22, left: `${pos(0)}%`, width: 2, height: 28, bgcolor: "text.primary" }} />
      <Typography variant="caption" sx={{ position: "absolute", top: 54, left: `${pos(0)}%`, transform: "translateX(-50%)", fontWeight: 800 }}>Vencimento</Typography>
      {etapas.map((e) => (
        <Tooltip key={e.id} title={`${e.nome} — ${rotuloOffset(e.offsetDias)} — ${ROTULO_CANAL[e.canal] || e.canal}${e.ativa ? "" : " (inativa)"}`}>
          <Box sx={{ position: "absolute", top: 24, left: `${pos(e.offsetDias)}%`, transform: "translateX(-50%)", textAlign: "center" }}>
            <Box sx={{ width: 24, height: 24, borderRadius: "50%", bgcolor: corOffset(e.offsetDias), opacity: e.ativa ? 1 : 0.3, border: "3px solid", borderColor: "background.paper", mx: "auto" }} />
            <Typography variant="caption" sx={{ whiteSpace: "nowrap", position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)" }}>{rotuloOffset(e.offsetDias)}</Typography>
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}

function EtapaDialog({ reguaId, etapa, onClose, toast, onDone }: { reguaId: string | null; etapa: any | null; onClose: () => void; toast: (t: Toast) => void; onDone: () => void }) {
  const open = !!reguaId || !!etapa;
  const tpls = useLoad<any>(open ? `${BASE}/templates?pageSize=200&categoria=COBRANCA` : null);
  const [f, setF] = useState<any>({});
  const [last, setLast] = useState<string>("");
  const key = etapa?.id || reguaId || "";
  if (key !== last) { setLast(key); setF(etapa ? { ...etapa } : { canal: "WHATSAPP", offsetDias: 0 }); }
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function salvar() {
    const body = { nome: f.nome, offsetDias: Number(f.offsetDias), canal: f.canal, canalFallback: f.canalFallback || null, templateId: f.templateId, ativa: f.ativa ?? true };
    try {
      if (etapa) await eduApi.patch(`${BASE}/reguas/etapas/${etapa.id}`, body); else await eduApi.post(`${BASE}/reguas/${reguaId}/etapas`, body);
      toast({ type: "success", text: "Etapa salva." }); onClose(); onDone();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{etapa ? "Editar etapa" : "Nova etapa"}</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        <TextField size="small" label="Nome da etapa" value={f.nome || ""} onChange={set("nome")} />
        <TextField size="small" type="number" label="Dias em relação ao vencimento" value={f.offsetDias ?? 0} onChange={set("offsetDias")} helperText="Negativo = antes (-3); 0 = no dia; positivo = depois (+7)" />
        <TextField select size="small" label="Canal" value={f.canal || "WHATSAPP"} onChange={set("canal")}>{CANAIS_ENVIO.map((c) => <MenuItem key={c} value={c}>{ROTULO_CANAL[c]}</MenuItem>)}</TextField>
        <TextField select size="small" label="Canal alternativo (se não houver contato)" value={f.canalFallback || ""} onChange={set("canalFallback")}><MenuItem value="">Nenhum</MenuItem>{CANAIS_ENVIO.map((c) => <MenuItem key={c} value={c}>{ROTULO_CANAL[c]}</MenuItem>)}</TextField>
        <TextField select size="small" label="Template" value={f.templateId || ""} onChange={set("templateId")}>{asList(tpls.data).map((t) => <MenuItem key={t.id} value={t.id}>{t.chave} — {t.nome}</MenuItem>)}</TextField>
        <FormControlLabel label="Etapa ativa" control={<Checkbox checked={f.ativa ?? true} onChange={(e) => setF({ ...f, ativa: e.target.checked })} />} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!f.nome || !f.templateId} onClick={salvar}>Salvar</Button></DialogActions>
    </Dialog>
  );
}

function Execucoes({ id, onClose }: { id: string | null; onClose: () => void }) {
  const ex = useLoad<any>(id ? `${BASE}/reguas/${id}/execucoes?pageSize=30` : null);
  const rows = asList(ex.data);
  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Histórico de execuções</DialogTitle>
      <DialogContent dividers>
        <StateBox loading={ex.loading} error={ex.error} onRetry={ex.reload} empty={!rows.length} emptyText="A régua ainda não executou nenhuma etapa.">
          <Table size="small">
            <TableHead><TableRow>{["Quando", "Título", "Resultado"].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
            <TableBody>{rows.map((r) => <TableRow key={r.id}><TableCell>{fmtDateTime(r.createdAt)}</TableCell><TableCell>{r.receivableId || r.tituloId || "—"}</TableCell><TableCell><StatusPill value={r.resultado || r.status} /></TableCell></TableRow>)}</TableBody>
          </Table>
        </StateBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function ReguaTab({ toast }: { toast: (t: Toast) => void }) {
  const reguas = useLoad<any[]>(`${BASE}/reguas`);
  const [sim, setSim] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [novaEtapa, setNovaEtapa] = useState<string | null>(null);
  const [editEtapa, setEditEtapa] = useState<any>(null);
  const [exec, setExec] = useState<string | null>(null);
  const [novaRegua, setNovaRegua] = useState(false);
  const [nr, setNr] = useState<any>({ toleranciaDias: 2 });
  const list = asList(reguas.data);

  async function act(fn: () => Promise<any>, ok: string) {
    try { await fn(); toast({ type: "success", text: ok }); reguas.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function simular() {
    setBusy(true);
    try { setSim(await eduApi.post(`${BASE}/reguas/simular`)); } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }
  async function executar() {
    if (!window.confirm("Executar a régua agora? As mensagens de cobrança serão enfileiradas para os títulos elegíveis.")) return;
    setBusy(true);
    try { const r = await eduApi.post(`${BASE}/reguas/executar`); toast({ type: "success", text: `Régua executada: ${r.enfileiradas} mensagem(ns) enfileirada(s), ${r.bloqueadas} bloqueada(s), ${r.semDestino} sem destino.` }); setSim(null); } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }

  return (
    <>
      <Section title="Régua de cobrança" description="Lembretes automáticos antes e depois do vencimento. Cobrança é suprimida se o título já foi pago."
        actions={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button size="small" variant="outlined" disabled={busy} onClick={simular}>Simular (sem enviar)</Button>
          <Button size="small" variant="outlined" color="warning" startIcon={<PlayArrowIcon />} disabled={busy} onClick={executar}>Executar agora</Button>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setNovaRegua(true)}>Nova régua</Button>
        </Box>}>
        {sim ? (
          <Box sx={{ mb: 3 }}>
            <Alert severity="info" onClose={() => setSim(null)} sx={{ mb: 1 }}>Simulação — nada foi enviado.</Alert>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 1 }}>
              <Stat label="Réguas ativas" value={sim.reguas} /><Stat label="Títulos avaliados" value={sim.titulosAvaliados} /><Stat label="Seriam enviadas" value={sim.enfileiradas} color="#2e7d32" />
              <Stat label="Bloqueadas" value={sim.bloqueadas} /><Stat label="Sem destino" value={sim.semDestino} />
            </Box>
            {(sim.simulacao || []).slice(0, 8).map((s: any, i: number) => (
              <Typography key={i} variant="body2" color="text.secondary">• {s.aluno} — {s.etapa} via {ROTULO_CANAL[s.canal] || s.canal}: {String(s.resultado).replace(/_/g, " ")}</Typography>
            ))}
          </Box>
        ) : null}
        <StateBox loading={reguas.loading} error={reguas.error} onRetry={reguas.reload} empty={!list.length} emptyText="Nenhuma régua. Use “Preparar dados padrão” no Painel ou crie uma nova.">
          <Box sx={{ display: "grid", gap: 2 }}>
            {list.map((r) => (
              <Paper key={r.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontWeight: 800, flex: 1 }}>{r.nome}</Typography>
                  <StatusPill value={r.ativa ? "ATIVA" : "INATIVA"} />
                  <Typography variant="caption" color="text.secondary">tolerância {r.toleranciaDias} dia(s)</Typography>
                  <Button size="small" onClick={() => act(() => eduApi.patch(`${BASE}/reguas/${r.id}`, { ativa: !r.ativa }), r.ativa ? "Régua desativada." : "Régua ativada.")}>{r.ativa ? "Desativar" : "Ativar"}</Button>
                  <Button size="small" onClick={() => setExec(r.id)}>Histórico</Button>
                  <Button size="small" onClick={() => setNovaEtapa(r.id)}>+ Etapa</Button>
                  <Button size="small" color="error" onClick={() => { if (window.confirm(`Remover a régua “${r.nome}” e todas as suas etapas?`)) act(() => eduApi.del(`${BASE}/reguas/${r.id}`), "Régua removida."); }}>Remover</Button>
                </Box>
                {r.descricao ? <Typography variant="body2" color="text.secondary">{r.descricao}</Typography> : null}
                <Timeline etapas={r.etapas || []} />
                <Table size="small">
                  <TableBody>
                    {(r.etapas || []).map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell>{rotuloOffset(e.offsetDias)}</TableCell><TableCell>{e.nome}</TableCell>
                        <TableCell>{ROTULO_CANAL[e.canal] || e.canal}{e.canalFallback ? ` → ${ROTULO_CANAL[e.canalFallback] || e.canalFallback}` : ""}</TableCell>
                        <TableCell><StatusPill value={e.ativa ? "ATIVA" : "INATIVA"} /></TableCell>
                        <TableCell align="right">
                          <Button size="small" onClick={() => setEditEtapa(e)}>Editar</Button>
                          <Button size="small" color="error" onClick={() => { if (window.confirm(`Remover a etapa “${e.nome}”?`)) act(() => eduApi.del(`${BASE}/reguas/etapas/${e.id}`), "Etapa removida."); }}>Remover</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            ))}
          </Box>
        </StateBox>
      </Section>
      <EtapaDialog reguaId={novaEtapa} etapa={editEtapa} onClose={() => { setNovaEtapa(null); setEditEtapa(null); }} toast={toast} onDone={reguas.reload} />
      <Execucoes id={exec} onClose={() => setExec(null)} />
      <Dialog open={novaRegua} onClose={() => setNovaRegua(false)} fullWidth maxWidth="xs">
        <DialogTitle>Nova régua de cobrança</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField size="small" label="Nome" value={nr.nome || ""} onChange={(e) => setNr({ ...nr, nome: e.target.value })} />
          <TextField size="small" label="Descrição" value={nr.descricao || ""} onChange={(e) => setNr({ ...nr, descricao: e.target.value })} />
          <TextField size="small" type="number" label="Tolerância (dias)" value={nr.toleranciaDias} onChange={(e) => setNr({ ...nr, toleranciaDias: Number(e.target.value) })} helperText="Recupera etapas perdidas até N dias depois do gatilho" />
        </DialogContent>
        <DialogActions><Button onClick={() => setNovaRegua(false)}>Cancelar</Button>
          <Button variant="contained" disabled={!nr.nome || nr.nome.length < 3} onClick={() => act(async () => { await eduApi.post(`${BASE}/reguas`, { nome: nr.nome, descricao: nr.descricao || undefined, toleranciaDias: nr.toleranciaDias }); setNovaRegua(false); setNr({ toleranciaDias: 2 }); }, "Régua criada. Adicione as etapas.")}>Criar</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
