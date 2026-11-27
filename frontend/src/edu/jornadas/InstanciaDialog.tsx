import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, Paper, Stack, TextField, Typography,
} from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import FlowDiagram, { type DDiagrama } from "./FlowDiagram";
import { Loadable, fmtData, fmtDataHora, papelLabel, useAsync } from "./common";

const ABERTAS = ["ABERTA", "AGUARDANDO_EVENTO", "ATRASADA"];
const statusColor = (s: string) => (s === "CONCLUIDA" || s === "PULADA" ? "success" : s === "ATRASADA" ? "error" : s === "ABERTA" ? "primary" : "default");

type Prompt = { titulo: string; campo: string; min: number; etapaId?: string; acao: "atraso" | "pular" | "cancelar"; data?: boolean } | null;

/** Detalhe de uma instância: progresso, diagrama com estado, etapas com ações, histórico. */
export default function InstanciaDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const inst = useAsync(() => eduApi.get(`/jornadas/instancias/${id}`), [id]);
  const diag = useAsync<DDiagrama | null>(() => eduApi.get(`/jornadas/instancias/${id}/diagrama?direcao=LR`), [id]);
  const [msg, setMsg] = useState<{ t: "success" | "error"; s: string } | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [texto, setTexto] = useState("");
  const [novoPrazo, setNovoPrazo] = useState("");
  const [busy, setBusy] = useState(false);

  const i = inst.data;
  const etapas: any[] = i?.etapas || [];
  const nos = (diag.data?.nos || []).filter((n) => !["GATEWAY"].includes(n.tipo));
  const feitos = nos.filter((n) => n.estado === "CONCLUIDA" || n.estado === "PULADA").length;
  const pct = nos.length ? Math.round((feitos / nos.length) * 100) : 0;

  function refresh() { inst.reload(); diag.reload(); onChanged(); }

  async function call(path: string, body: any, ok: string) {
    setBusy(true);
    try { await eduApi.post(`/jornadas/instancias/${id}${path}`, body); setMsg({ t: "success", s: ok }); refresh(); }
    catch (e: any) { setMsg({ t: "error", s: e.message }); } finally { setBusy(false); }
  }
  async function avancar(e: any, decisao?: "APROVADO" | "REJEITADO") {
    await call(`/etapas/${e.id}/avancar`, decisao ? { decisao } : {}, `Etapa “${e.titulo}” avançada.`);
  }
  async function toggleCheck(e: any, chave: string, feito: boolean) {
    await call(`/etapas/${e.id}/checklist`, { itens: { [chave]: feito } }, "Checklist atualizado.");
  }
  async function confirmarPrompt() {
    if (!prompt) return;
    if (texto.trim().length < prompt.min) { setMsg({ t: "error", s: `Informe ao menos ${prompt.min} caracteres.` }); return; }
    const p = prompt; setPrompt(null);
    if (p.acao === "atraso") await call(`/etapas/${p.etapaId}/atraso`, { motivo: texto, novoPrazo: novoPrazo ? new Date(`${novoPrazo}T12:00:00`).toISOString() : undefined }, "Atraso registrado.");
    else if (p.acao === "pular") await call(`/etapas/${p.etapaId}/pular`, { justificativa: texto }, "Etapa pulada.");
    else await call("/cancelar", { motivo: texto }, "Jornada cancelada.");
    setTexto(""); setNovoPrazo("");
  }
  const ask = (p: NonNullable<Prompt>) => { setTexto(""); setNovoPrazo(""); setPrompt(p); };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        {i ? `${i.personNome || i.personId} — ${i.templateChave}` : "Jornada"}
        {i ? <Chip size="small" sx={{ ml: 1 }} color={i.status === "ATIVA" ? "primary" : i.status === "CONCLUIDA" ? "success" : "default"} label={i.status} /> : null}
      </DialogTitle>
      <DialogContent dividers>
        <Loadable loading={inst.loading} error={inst.error}>
          {i ? (
            <Stack spacing={2}>
              {msg ? <Alert severity={msg.t} onClose={() => setMsg(null)}>{msg.s}</Alert> : null}
              <Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Progresso da jornada</Typography>
                  <Typography variant="body2">{feitos}/{nos.length} etapas · {pct}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={pct} sx={{ height: 10, borderRadius: 5, mt: 0.5 }} color={etapas.some((e) => e.status === "ATRASADA") ? "error" : "primary"} />
                <Typography variant="caption" color="text.secondary">Iniciada em {fmtData(i.iniciadaEm)} · {i.personType}</Typography>
              </Box>
              {diag.data?.nos?.length ? <FlowDiagram diagrama={diag.data} height={360} /> : null}
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Etapas</Typography>
              {etapas.length === 0 ? <Typography color="text.secondary">Nenhuma etapa registrada.</Typography> : null}
              {etapas.map((e) => {
                const aberta = ABERTAS.includes(e.status);
                const def: any[] = Array.isArray(e.checklistDef) ? e.checklistDef : [];
                return (
                  <Paper key={e.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3, borderColor: e.status === "ATRASADA" ? "error.main" : undefined }}>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                      <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 180 }}>{e.titulo}</Typography>
                      <Chip size="small" variant="outlined" label={papelLabel(e.papel)} />
                      <Chip size="small" color={statusColor(e.status) as any} label={e.status.replace(/_/g, " ")} />
                      {e.prazoEm ? <Chip size="small" color={e.status === "ATRASADA" ? "error" : "default"} label={`Prazo ${fmtData(e.prazoEm)}${e.diasAtraso ? ` (+${e.diasAtraso}d)` : ""}`} /> : null}
                    </Box>
                    {aberta && def.length ? (
                      <Box sx={{ display: "flex", flexDirection: "column", ml: 1, mt: 0.5 }}>
                        {def.map((c) => (
                          <FormControlLabel key={c.chave} disabled={busy}
                            control={<Checkbox size="small" checked={Boolean(e.checklistEstado?.[c.chave]?.feito)} onChange={(ev) => toggleCheck(e, c.chave, ev.target.checked)} />}
                            label={<Typography variant="body2">{c.titulo}{c.obrigatorio ? " *" : ""}</Typography>} />
                        ))}
                      </Box>
                    ) : null}
                    {aberta ? (
                      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", rowGap: 1 }}>
                        {e.tipo === "APROVACAO" ? (
                          <>
                            <Button size="small" variant="contained" color="success" disabled={busy} onClick={() => avancar(e, "APROVADO")}>Aprovar</Button>
                            <Button size="small" variant="outlined" color="error" disabled={busy} onClick={() => avancar(e, "REJEITADO")}>Rejeitar</Button>
                          </>
                        ) : e.status === "AGUARDANDO_EVENTO" ? null : (
                          <Button size="small" variant="contained" disabled={busy} onClick={() => avancar(e)}>Concluir etapa</Button>
                        )}
                        <Button size="small" disabled={busy} onClick={() => ask({ titulo: "Registrar atraso", campo: "Motivo do atraso (mín. 5 caracteres)", min: 5, etapaId: e.id, acao: "atraso", data: true })}>Registrar atraso</Button>
                        <Button size="small" color="warning" disabled={busy} onClick={() => ask({ titulo: "Pular etapa", campo: "Justificativa (mín. 10 caracteres)", min: 10, etapaId: e.id, acao: "pular" })}>Pular</Button>
                      </Stack>
                    ) : e.concluidaEm ? <Typography variant="caption" color="text.secondary">Concluída em {fmtDataHora(e.concluidaEm)}{e.decisao ? ` · ${e.decisao}` : ""}</Typography> : null}
                  </Paper>
                );
              })}
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Histórico</Typography>
              <Box sx={{ maxHeight: 200, overflow: "auto" }}>
                {(i.historico || []).slice().reverse().map((h: any) => (
                  <Typography key={h.id} variant="body2" sx={{ py: 0.3 }}><b>{fmtDataHora(h.createdAt)}</b> — {h.acao}{h.detalhes ? `: ${typeof h.detalhes === "string" ? h.detalhes : JSON.stringify(h.detalhes)}` : ""}</Typography>
                ))}
                {!(i.historico || []).length ? <Typography color="text.secondary" variant="body2">Sem eventos.</Typography> : null}
              </Box>
            </Stack>
          ) : null}
        </Loadable>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between" }}>
        <Box>
          {i?.status === "ATIVA" && <Button color="warning" disabled={busy} onClick={() => call("/pausar", {}, "Jornada pausada.")}>Pausar</Button>}
          {i?.status === "PAUSADA" && <Button disabled={busy} onClick={() => call("/retomar", {}, "Jornada retomada.")}>Retomar</Button>}
          {i && ["ATIVA", "PAUSADA"].includes(i.status) && <Button color="error" disabled={busy} onClick={() => ask({ titulo: "Cancelar jornada", campo: "Motivo do cancelamento (mín. 5 caracteres)", min: 5, acao: "cancelar" })}>Cancelar jornada</Button>}
        </Box>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
      <Dialog open={!!prompt} onClose={() => setPrompt(null)} fullWidth maxWidth="sm">
        <DialogTitle>{prompt?.titulo}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth multiline minRows={2} sx={{ mt: 1 }} label={prompt?.campo} value={texto} onChange={(e) => setTexto(e.target.value)} />
          {prompt?.data ? <TextField fullWidth type="date" sx={{ mt: 2 }} label="Novo prazo (opcional)" value={novoPrazo} onChange={(e) => setNovoPrazo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /> : null}
        </DialogContent>
        <DialogActions><Button onClick={() => setPrompt(null)}>Voltar</Button><Button variant="contained" onClick={confirmarPrompt}>Confirmar</Button></DialogActions>
      </Dialog>
    </Dialog>
  );
}
