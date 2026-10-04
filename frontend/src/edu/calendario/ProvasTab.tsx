import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useMemo, useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Card, fmtDT, itemsOf, Row, rotuloTipo, TIPOS_EXAME, toISO, useGet, useSections, useSpaces, useTerms, useToast } from "./kit";

const ST_COR: Record<string, "default" | "success" | "warning" | "error" | "info"> = { AGENDADA: "info", CONFIRMADA: "success", REALIZADA: "default", CANCELADA: "error", REMARCADA: "warning" };

export default function ProvasTab() {
  const terms = useTerms(); const spaces = useSpaces(); const sections = useSections();
  const [termId, setTermId] = useState(""); const [status, setStatus] = useState("");
  const lista = useGet<any>(`/calendario/provas${qsOf({ termId, status, pageSize: 100 })}`);
  const choques = useGet<any>(termId ? `/calendario/provas/conflitos${qsOf({ termId })}` : null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Record<string, any>>({ tipo: "PROVA_1" });
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();
  const items = itemsOf(lista.data);
  const proximas = useMemo(() => items.filter((p) => new Date(p.inicio) >= new Date() && !["CANCELADA", "REMARCADA"].includes(p.status)).length, [items]);

  async function salvar() {
    setBusy(true);
    try {
      await eduApi.post("/calendario/provas", { classSectionId: f.classSectionId, tipo: f.tipo, titulo: f.titulo || undefined, inicio: toISO(f.inicio), fim: toISO(f.fim), spaceId: f.spaceId || undefined, alunosPrevistos: f.alunos ? Number(f.alunos) : undefined, observacoes: f.obs || undefined });
      toast({ type: "success", text: "Avaliação agendada." }); setOpen(false); lista.reload();
    } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }
  async function status_(p: any, novo: "CONFIRMADA" | "REALIZADA" | "CANCELADA") {
    let motivo: string | undefined;
    if (novo === "CANCELADA") { motivo = window.prompt("Motivo do cancelamento:") || undefined; if (!motivo) return; }
    try { await eduApi.post(`/calendario/provas/${p.id}/status`, { status: novo, motivo }); lista.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function segunda(p: any) {
    const ini = window.prompt("Data/hora da 2ª chamada (AAAA-MM-DDTHH:MM):"); if (!ini) return;
    const fim = window.prompt("Término (AAAA-MM-DDTHH:MM):"); if (!fim) return;
    try { await eduApi.post(`/calendario/provas/${p.id}/segunda-chamada`, { inicio: toISO(ini), fim: toISO(fim) }); toast({ type: "success", text: "Segunda chamada agendada." }); lista.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  return (
    <Box>
      <Row>
        <Card label="Avaliações listadas" value={lista.data?.total ?? items.length} /><Card label="Próximas" value={proximas} color="#7c3aed" />
        {termId ? <Card label="Choques de provas" value={choques.error ? "—" : choques.data?.conflitos ?? 0} color="#dc2626" /> : null}
      </Row>
      <Row>
        <TextField select size="small" label="Período letivo" value={termId} onChange={(e) => setTermId(e.target.value)} sx={{ minWidth: 220 }}><MenuItem value="">Todos</MenuItem>{terms.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}</TextField>
        <TextField select size="small" label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}><MenuItem value="">Todas</MenuItem>{Object.keys(ST_COR).map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setF({ tipo: "PROVA_1" }); setOpen(true); }}>Agendar avaliação</Button>
      </Row>
      {lista.error ? <Alert severity="warning">Não foi possível carregar as provas: {lista.error}</Alert> : null}
      {!lista.error && !lista.loading && !items.length ? <Alert severity="info">Nenhuma avaliação agendada.</Alert> : null}
      {items.length ? (
        <Paper variant="outlined" sx={{ borderRadius: 3, overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Avaliação</TableCell><TableCell>Turma</TableCell><TableCell>Início</TableCell><TableCell>Sala</TableCell><TableCell>Fiscais</TableCell><TableCell>Situação</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {items.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 700 }}>{p.titulo}</Typography><Typography variant="caption" color="text.secondary">{rotuloTipo(p.tipo)}</Typography></TableCell>
                  <TableCell>{p.turma || "—"}</TableCell><TableCell>{fmtDT(p.inicio)}</TableCell><TableCell>{p.sala || "—"}</TableCell><TableCell>{p.fiscais?.length ?? 0}</TableCell>
                  <TableCell><Chip size="small" color={ST_COR[p.status] || "default"} label={p.status} /></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {p.status === "AGENDADA" ? <Button size="small" onClick={() => status_(p, "CONFIRMADA")}>Confirmar</Button> : null}
                    {["AGENDADA", "CONFIRMADA"].includes(p.status) ? <Button size="small" color="error" onClick={() => status_(p, "CANCELADA")}>Cancelar</Button> : null}
                    {p.status === "CONFIRMADA" && new Date(p.inicio) < new Date() ? <Button size="small" onClick={() => status_(p, "REALIZADA")}>Realizada</Button> : null}
                    {p.status !== "CANCELADA" ? <Button size="small" onClick={() => segunda(p)}>2ª chamada</Button> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agendar avaliação</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
          <TextField select required label="Turma" value={f.classSectionId || ""} onChange={(e) => setF({ ...f, classSectionId: e.target.value })}>{sections.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}</TextField>
          <TextField select label="Tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{TIPOS_EXAME.map((t) => <MenuItem key={t} value={t}>{rotuloTipo(t)}</MenuItem>)}</TextField>
          <TextField label="Título (opcional)" value={f.titulo || ""} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          <TextField label="Início" required type="datetime-local" slotProps={{ inputLabel: { shrink: true } }} value={f.inicio || ""} onChange={(e) => setF({ ...f, inicio: e.target.value })} />
          <TextField label="Fim" required type="datetime-local" slotProps={{ inputLabel: { shrink: true } }} value={f.fim || ""} onChange={(e) => setF({ ...f, fim: e.target.value })} />
          <TextField select label="Sala" value={f.spaceId || ""} onChange={(e) => setF({ ...f, spaceId: e.target.value })}><MenuItem value="">A definir</MenuItem>{spaces.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}</TextField>
          <TextField type="number" label="Alunos previstos" value={f.alunos || ""} onChange={(e) => setF({ ...f, alunos: e.target.value })} />
          <TextField label="Observações" multiline minRows={2} value={f.obs || ""} onChange={(e) => setF({ ...f, obs: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="contained" disabled={busy || !f.classSectionId || !f.inicio || !f.fim} onClick={salvar}>Agendar</Button></DialogActions>
      </Dialog>
      {node}
    </Box>
  );
}
