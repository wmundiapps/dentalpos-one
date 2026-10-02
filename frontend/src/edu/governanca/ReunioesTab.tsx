import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { StatusChip } from "../EduResourcePage";
import { fmtDateTime, label, openHtml, Section, Status, useApi, useToast } from "../regulatorio/ui";
import { toArr, useOptions } from "./shared";

function Presenca({ r, onClose, onDone }: { r: any; onClose: () => void; onDone: () => void }) {
  const mem = useApi<any>(`/governanca/orgao-membros?orgaoId=${r.orgaoId}&ativo=true&pageSize=200`);
  const [sel, setSel] = useState<string[]>(Array.isArray(r.presentes) ? r.presentes : []);
  const [res, setRes] = useState<any>(null);
  const { toast, node } = useToast();
  async function salvar() { try { const x = await eduApi.post(`/governanca/reunioes/${r.id}/presenca`, { presentes: sel }); setRes(x); onDone(); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Lista de presença e quórum</DialogTitle>
      <DialogContent dividers>
        <Status loading={mem.loading && !mem.data} error={mem.error} onRetry={mem.reload} empty={!toArr(mem.data).length} emptyText="O órgão não tem membros ativos cadastrados.">
          {toArr(mem.data).map((m: any) => (
            <FormControlLabel key={m.id} sx={{ display: "flex" }} control={<Checkbox size="small" checked={sel.includes(m.id)} onChange={(e) => setSel(e.target.checked ? [...sel, m.id] : sel.filter((x) => x !== m.id))} />}
              label={`${m.nome} — ${label(m.cargo)}${m.temVoto ? "" : " (sem voto)"}`} />
          ))}
        </Status>
        {res && <Alert severity={res.quorumAtingido ? "success" : "error"} sx={{ mt: 1 }}>{res.presentesComVoto} de {res.totalComVoto} com voto presentes; quórum necessário: {res.quorumNecessario}. {res.quorumAtingido ? "Quórum atingido." : "Quórum NÃO atingido."}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button><Button variant="contained" onClick={salvar}>Salvar presença</Button></DialogActions>
      {node}
    </Dialog>
  );
}

function Pautas({ r, onClose, onDone }: { r: any; onClose: () => void; onDone: () => void }) {
  const { data, reload } = useApi<any>(`/governanca/pautas?reuniaoId=${r.id}&pageSize=100`);
  const modelos = useApi<any>("/governanca/pauta-modelos");
  const [t, setT] = useState("");
  const [tipo, setTipo] = useState("DELIBERACAO");
  const [m, setM] = useState("");
  const { toast, node } = useToast();
  const edit = r.status === "AGENDADA";
  async function run(fn: () => Promise<any>) { try { await fn(); reload(); onDone(); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Pauta da reunião</DialogTitle>
      <DialogContent dividers>
        {toArr(data).map((p: any) => (
          <Box key={p.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" sx={{ flex: 1 }}>{p.ordem}. {p.titulo} <Chip size="small" label={label(p.tipo)} /></Typography>
            {edit && <Button size="small" color="error" onClick={() => { if (window.confirm("Remover item da pauta?")) run(() => eduApi.del(`/governanca/pautas/${p.id}`)); }}>Remover</Button>}
          </Box>
        ))}
        {!toArr(data).length && <Typography variant="body2" color="text.secondary">Pauta vazia.</Typography>}
        {edit && (<>
          <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
            <TextField size="small" fullWidth label="Novo item" value={t} onChange={(e) => setT(e.target.value)} />
            <TextField size="small" select value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 140 }}><MenuItem value="DELIBERACAO">Deliberação</MenuItem><MenuItem value="INFORME">Informe</MenuItem></TextField>
            <Button disabled={t.length < 3} onClick={() => run(async () => { await eduApi.post("/governanca/pautas", { reuniaoId: r.id, titulo: t, tipo, ordem: toArr(data).length + 1 }); setT(""); })}>Adicionar</Button>
          </Box>
          <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
            <TextField size="small" select fullWidth label="Aplicar pauta-modelo" value={m} onChange={(e) => setM(e.target.value)}>{toArr(modelos.data).map((x: any) => <MenuItem key={x.id} value={x.chave}>{x.nome || x.titulo || x.chave}</MenuItem>)}</TextField>
            <Button disabled={!m} onClick={() => run(() => eduApi.post(`/governanca/reunioes/${r.id}/pautas/from-modelo`, { chave: m }))}>Aplicar</Button>
          </Box>
        </>)}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {node}
    </Dialog>
  );
}

export default function ReunioesTab() {
  const { data, loading, error, reload } = useApi<any>("/governanca/reunioes?pageSize=100");
  const orgaos = useOptions("/governanca/orgaos?pageSize=100", (o) => o.nome);
  const [presenca, setPresenca] = useState<any | null>(null);
  const [pauta, setPauta] = useState<any | null>(null);
  const [ata, setAta] = useState<any | null>(null);
  const [ataTxt, setAtaTxt] = useState("");
  const [novo, setNovo] = useState<Record<string, string> | null>(null);
  const { toast, node } = useToast();
  const items = toArr(data);

  async function run(fn: () => Promise<any>, ok: string) { try { await fn(); toast({ type: "success", text: ok }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  async function criar() {
    await run(() => eduApi.post("/governanca/reunioes", { orgaoId: novo!.orgaoId, tipo: novo!.tipo || "ORDINARIA", data: new Date(novo!.data).toISOString(), local: novo!.local || undefined }), "Reunião agendada.");
    setNovo(null);
  }
  return (
    <Section title="Reuniões de colegiados" action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo({ tipo: "ORDINARIA" })}>Nova reunião</Button>}>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!items.length} emptyText="Nenhuma reunião agendada.">
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Data</TableCell><TableCell>Órgão</TableCell><TableCell>Tipo</TableCell><TableCell>Status</TableCell><TableCell>Quórum</TableCell><TableCell align="right" /></TableRow></TableHead>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{fmtDateTime(r.data)}<br /><Typography variant="caption" color="text.secondary">{r.local}</Typography></TableCell>
                  <TableCell>{orgaos.find((o) => o.value === r.orgaoId)?.label || "—"}</TableCell>
                  <TableCell>{label(r.tipo)}</TableCell><TableCell><StatusChip value={r.status} /></TableCell>
                  <TableCell>{r.quorumAtingido ? <Chip size="small" color="success" label="Atingido" /> : <Chip size="small" label="Pendente" />}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => setPauta(r)}>Pauta</Button>
                    {r.status === "AGENDADA" && <>
                      <Button size="small" onClick={() => run(async () => { const x = await eduApi.post(`/governanca/reunioes/${r.id}/convocar`, {}); toast({ type: "success", text: `${x.notificados} membro(s) notificado(s); ${x.semUsuarioVinculado} sem usuário vinculado.` }); }, "Convocação enviada.")}>Convocar</Button>
                      <Button size="small" onClick={() => setPresenca(r)}>Presença</Button>
                      <Button size="small" color="success" onClick={() => { setAta(r); setAtaTxt(r.ata || ""); }}>Realizar</Button>
                      <Button size="small" color="error" onClick={() => { if (window.confirm("Cancelar esta reunião?")) run(() => eduApi.post(`/governanca/reunioes/${r.id}/cancelar`, {}), "Reunião cancelada."); }}>Cancelar</Button>
                    </>}
                    <Button size="small" onClick={() => openHtml(`/governanca/reunioes/${r.id}/ata-html`).catch((e) => toast({ type: "error", text: e.message }))}>Ata</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Status>
      {presenca && <Presenca r={presenca} onClose={() => setPresenca(null)} onDone={reload} />}
      {pauta && <Pautas r={pauta} onClose={() => setPauta(null)} onDone={reload} />}
      <Dialog open={!!ata} onClose={() => setAta(null)} fullWidth maxWidth="md">
        <DialogTitle>Realizar reunião — registro da ata</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 1 }}>Exige lista de presença registrada e quórum atingido.</Alert>
          <TextField fullWidth multiline minRows={8} label="Ata / registro" value={ataTxt} onChange={(e) => setAtaTxt(e.target.value)} />
        </DialogContent>
        <DialogActions><Button onClick={() => setAta(null)}>Cancelar</Button><Button variant="contained" onClick={async () => { await run(() => eduApi.post(`/governanca/reunioes/${ata.id}/realizar`, { ata: ataTxt || undefined }), "Reunião realizada."); setAta(null); }}>Confirmar realização</Button></DialogActions>
      </Dialog>
      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Nova reunião</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          <TextField size="small" select required label="Órgão" value={novo?.orgaoId || ""} onChange={(e) => setNovo({ ...novo, orgaoId: e.target.value })}>{orgaos.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
          <TextField size="small" select label="Tipo" value={novo?.tipo || "ORDINARIA"} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}><MenuItem value="ORDINARIA">Ordinária</MenuItem><MenuItem value="EXTRAORDINARIA">Extraordinária</MenuItem></TextField>
          <TextField size="small" type="datetime-local" required label="Data e hora" value={novo?.data || ""} onChange={(e) => setNovo({ ...novo, data: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label="Local" value={novo?.local || ""} onChange={(e) => setNovo({ ...novo, local: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" disabled={!novo?.orgaoId || !novo?.data} onClick={criar}>Agendar</Button></DialogActions>
      </Dialog>
      {node}
    </Section>
  );
}
