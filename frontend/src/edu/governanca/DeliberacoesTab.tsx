import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { StatusChip } from "../EduResourcePage";
import { fmtDateTime, label, openHtml, Section, Status, useApi, useToast } from "../regulatorio/ui";
import { toArr, useOptions } from "./shared";

const COR: Record<string, string> = { FAVOR: "#16a34a", CONTRA: "#dc2626", ABSTENCAO: "#94a3b8" };

function Votacao({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: () => void }) {
  const vot = useApi<any>(`/governanca/deliberacoes/${d.id}/votos`);
  const mem = useApi<any>(`/governanca/orgao-membros?orgaoId=${d.orgaoId}&ativo=true&pageSize=200`);
  const [membro, setMembro] = useState("");
  const [voto, setVoto] = useState("FAVOR");
  const [desempate, setDesempate] = useState("");
  const { toast, node } = useToast();
  const v = vot.data;
  const ap = v?.apuracaoParcial;
  const cont = (t: string) => (v?.votos || []).filter((x: any) => x.voto === t).length;
  const total = (v?.votos || []).length || 1;

  async function votar() { try { await eduApi.post(`/governanca/deliberacoes/${d.id}/votos`, { membroId: membro, voto }); setMembro(""); vot.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  async function apurar(encerrar: boolean) {
    if (encerrar && !window.confirm("Encerrar a votação? Presentes que não votaram contam como abstenção.")) return;
    try { await eduApi.post(`/governanca/deliberacoes/${d.id}/apurar`, { encerrar, desempate: desempate || undefined }); toast({ type: "success", text: "Votação apurada." }); onDone(); onClose(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Votação — {d.titulo}</DialogTitle>
      <DialogContent dividers>
        <Status loading={vot.loading && !v} error={vot.error} onRetry={vot.reload} empty={!v}>
          {v && (<>
            <Box sx={{ display: "flex", height: 22, borderRadius: 11, overflow: "hidden", bgcolor: "action.hover", mb: 1 }}>
              {(["FAVOR", "CONTRA", "ABSTENCAO"] as const).map((t) => <Box key={t} sx={{ width: `${(cont(t) / total) * 100}%`, bgcolor: COR[t] }} title={`${label(t)}: ${cont(t)}`} />)}
            </Box>
            <Box sx={{ display: "flex", gap: 1, mb: 1 }}>{(["FAVOR", "CONTRA", "ABSTENCAO"] as const).map((t) => <Chip key={t} size="small" label={`${label(t)}: ${cont(t)}`} sx={{ borderColor: COR[t] }} variant="outlined" />)}</Box>
            {ap && <Alert severity="info" sx={{ mb: 1 }}>Apuração parcial: {label(ap.resultado)}</Alert>}
            {(v.faltamVotar || []).length > 0 && <Typography variant="caption" color="text.secondary">Faltam votar: {v.faltamVotar.map((m: any) => m.nome).join(", ")}</Typography>}
            {v.status === "EM_VOTACAO" && (<>
              <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
                <TextField size="small" select fullWidth label="Membro" value={membro} onChange={(e) => setMembro(e.target.value)}>{toArr(mem.data).map((m: any) => <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>)}</TextField>
                <TextField size="small" select value={voto} onChange={(e) => setVoto(e.target.value)} sx={{ minWidth: 130 }}><MenuItem value="FAVOR">Favor</MenuItem><MenuItem value="CONTRA">Contra</MenuItem><MenuItem value="ABSTENCAO">Abstenção</MenuItem></TextField>
                <Button variant="contained" disabled={!membro} onClick={votar}>Votar</Button>
              </Box>
              <TextField size="small" select label="Voto de qualidade (só em caso de empate)" value={desempate} onChange={(e) => setDesempate(e.target.value)} sx={{ mt: 2, minWidth: 280 }}><MenuItem value="">—</MenuItem><MenuItem value="FAVOR">Favor</MenuItem><MenuItem value="CONTRA">Contra</MenuItem></TextField>
            </>)}
            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 800 }}>Votos registrados</Typography>
            {(v.votos || []).map((x: any) => <Typography key={x.id} variant="body2">{toArr(mem.data).find((m: any) => m.id === x.membroId)?.nome || x.membroId} — <b style={{ color: COR[x.voto] }}>{label(x.voto)}</b></Typography>)}
          </>)}
        </Status>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fechar</Button>
        {v?.status === "EM_VOTACAO" && <><Button onClick={() => apurar(false)}>Apurar</Button><Button variant="contained" onClick={() => apurar(true)}>Encerrar e apurar</Button></>}
      </DialogActions>
      {node}
    </Dialog>
  );
}

export default function DeliberacoesTab() {
  const { data, loading, error, reload } = useApi<any>("/governanca/deliberacoes?pageSize=100");
  const orgaos = useOptions("/governanca/orgaos?pageSize=100", (o) => o.nome);
  const reunioes = useOptions("/governanca/reunioes?pageSize=100", (r) => `${fmtDateTime(r.data)}`);
  const [vot, setVot] = useState<any | null>(null);
  const [novo, setNovo] = useState<Record<string, string> | null>(null);
  const { toast, node } = useToast();
  const items = toArr(data);
  async function run(fn: () => Promise<any>, ok: string) { try { await fn(); toast({ type: "success", text: ok }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  async function criar() {
    await run(() => eduApi.post("/governanca/deliberacoes", { orgaoId: novo!.orgaoId, reuniaoId: novo!.reuniaoId || undefined, titulo: novo!.titulo, texto: novo!.texto || undefined }), "Proposta registrada.");
    setNovo(null);
  }
  return (
    <Section title="Deliberações e votações" action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo({})}>Nova proposta</Button>}>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!items.length} emptyText="Nenhuma deliberação.">
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Nº</TableCell><TableCell>Título</TableCell><TableCell>Órgão</TableCell><TableCell>Status</TableCell><TableCell align="right" /></TableRow></TableHead>
            <TableBody>
              {items.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell>{d.numeracao || "—"}</TableCell><TableCell>{d.titulo}</TableCell>
                  <TableCell>{orgaos.find((o) => o.value === d.orgaoId)?.label || "—"}</TableCell><TableCell><StatusChip value={d.status} /></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {d.status === "PROPOSTA" && <Button size="small" onClick={() => run(() => eduApi.post(`/governanca/deliberacoes/${d.id}/abrir-votacao`, {}), "Votação aberta.")}>Abrir votação</Button>}
                    {["EM_VOTACAO", "APROVADA", "REJEITADA"].includes(d.status) && <Button size="small" onClick={() => setVot(d)}>{d.status === "EM_VOTACAO" ? "Votar / apurar" : "Votos"}</Button>}
                    {d.status === "APROVADA" && <Button size="small" onClick={() => openHtml(`/governanca/deliberacoes/${d.id}/resolucao-html`).catch((e) => toast({ type: "error", text: e.message }))}>Resolução</Button>}
                    {d.status !== "APROVADA" && d.status !== "ARQUIVADA" && <Button size="small" color="error" onClick={() => { if (window.confirm("Arquivar esta deliberação?")) run(() => eduApi.post(`/governanca/deliberacoes/${d.id}/arquivar`, {}), "Arquivada."); }}>Arquivar</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Status>
      <Paper variant="outlined" sx={{ p: 1.5, mt: 2, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">Fluxo: proposta, vínculo à reunião com quórum atingido, votação, apuração (numeração automática se aprovada) e resolução em HTML.</Typography></Paper>
      {vot && <Votacao d={vot} onClose={() => setVot(null)} onDone={reload} />}
      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Nova proposta de deliberação</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          <TextField size="small" select required label="Órgão" value={novo?.orgaoId || ""} onChange={(e) => setNovo({ ...novo, orgaoId: e.target.value })}>{orgaos.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
          <TextField size="small" select label="Reunião (necessária para votar)" value={novo?.reuniaoId || ""} onChange={(e) => setNovo({ ...novo, reuniaoId: e.target.value })}><MenuItem value="">—</MenuItem>{reunioes.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
          <TextField size="small" required label="Título" value={novo?.titulo || ""} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
          <TextField size="small" multiline minRows={5} label="Texto da deliberação" value={novo?.texto || ""} onChange={(e) => setNovo({ ...novo, texto: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" disabled={!novo?.orgaoId || !novo?.titulo} onClick={criar}>Registrar</Button></DialogActions>
      </Dialog>
      {node}
    </Section>
  );
}
