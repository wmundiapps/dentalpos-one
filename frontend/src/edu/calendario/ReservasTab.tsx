import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Card, fmtDT, itemsOf, Row, toISO, useGet, useSpaces, useToast } from "./kit";

const STATUS_COR: Record<string, "default" | "success" | "warning" | "error" | "info"> = { PENDENTE: "warning", APROVADA: "success", REJEITADA: "error", CANCELADA: "default", EXPIRADA: "default" };
const TIPOS = ["EVENTO", "AULA_EXTRA", "REUNIAO", "PROVA", "OUTRO"];

export default function ReservasTab() {
  const [status, setStatus] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const spaces = useSpaces();
  const lista = useGet<any>(`/calendario/reservas${qsOf({ status, spaceId, pageSize: 50 })}`);
  const fila = useGet<any>("/calendario/reservas/fila");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Record<string, any>>({ tipo: "EVENTO", recorrencia: "NENHUMA" });
  const [check, setCheck] = useState<any>(null);
  const [livres, setLivres] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();
  const nomeEsp = (id: string) => spaces.find((s) => s.value === id)?.label || id;
  const reloadAll = () => { lista.reload(); fila.reload(); };

  async function verificar() {
    setCheck(null);
    try { setCheck(await eduApi.post("/calendario/conflitos/verificar", { spaceId: f.spaceId, inicio: toISO(f.inicio), fim: toISO(f.fim) })); } catch (e: any) { setCheck({ erro: e.message }); }
  }
  async function buscarLivres() {
    try { const r = await eduApi.get(`/calendario/espacos/livres${qsOf({ inicio: toISO(f.inicio), fim: toISO(f.fim), capacidade: f.participantes })}`); setLivres(r.espacos || []); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function salvar() {
    setBusy(true);
    try {
      const r = await eduApi.post("/calendario/reservas", {
        spaceId: f.spaceId, titulo: f.titulo, tipo: f.tipo, finalidade: f.finalidade || undefined, inicio: toISO(f.inicio), fim: toISO(f.fim),
        participantes: f.participantes ? Number(f.participantes) : undefined, recorrencia: f.recorrencia,
        recorrenciaAte: f.recorrencia !== "NENHUMA" && f.ate ? new Date(`${f.ate}T23:59:00`).toISOString() : undefined,
      });
      toast({ type: "success", text: r?.status === "APROVADA" ? "Reserva criada e aprovada." : "Solicitação registrada e enviada para aprovação." });
      setOpen(false); reloadAll();
    } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }
  async function decidir(r: any, acao: "aprovar" | "rejeitar" | "cancelar") {
    let body: any = {};
    if (acao === "rejeitar") { const motivo = window.prompt("Motivo da rejeição:"); if (!motivo) return; body = { motivo, escopo: "ocorrencia" }; }
    else if (acao === "aprovar") body = { escopo: "ocorrencia" };
    else { if (!window.confirm(`Cancelar a reserva "${r.titulo}"?`)) return; }
    try { await eduApi.post(`/calendario/reservas/${r.id}/${acao}`, body); toast({ type: "success", text: "Feito." }); reloadAll(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  const pend = itemsOf(fila.data);
  return (
    <Box>
      <Row>
        <Card label="Aguardando decisão" value={fila.error ? "—" : pend.length} color="#f59e0b" hint={fila.error ? "Restrito à gestão/infraestrutura" : undefined} />
        <Card label="Reservas listadas" value={lista.data?.total ?? 0} />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setF({ tipo: "EVENTO", recorrencia: "NENHUMA" }); setCheck(null); setLivres(null); setOpen(true); }}>Nova reserva</Button>
      </Row>

      {pend.length ? (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Fila de aprovação</Typography>
          {pend.map((p: any) => (
            <Paper key={p.id} variant="outlined" sx={{ p: 1.5, mb: 1, borderLeft: `5px solid ${p.choqueComAgenda?.length || p.concorrentes?.length ? "#dc2626" : "#f59e0b"}` }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Box sx={{ flex: 1, minWidth: 240 }}>
                  <Typography sx={{ fontWeight: 700 }}>{p.titulo}</Typography>
                  <Typography variant="caption" color="text.secondary">{p.espaco ? `${p.espaco.codigo} — ${p.espaco.nome}` : nomeEsp(p.spaceId)} · {fmtDT(p.inicio)} até {fmtDT(p.fim)} · {p.solicitante || "—"}</Typography>
                  {p.choqueComAgenda?.length ? <Typography variant="caption" color="error" sx={{ display: "block" }}>Choca com: {p.choqueComAgenda.map((c: any) => c.titulo).join("; ")}</Typography> : null}
                  {p.concorrentes?.length ? <Typography variant="caption" color="warning.main" sx={{ display: "block" }}>{p.concorrentes.length} solicitação(ões) concorrente(s) no mesmo horário</Typography> : null}
                </Box>
                <Button size="small" color="success" variant="outlined" onClick={() => decidir(p, "aprovar")}>Aprovar</Button>
                <Button size="small" color="error" onClick={() => decidir(p, "rejeitar")}>Rejeitar</Button>
              </Box>
            </Paper>
          ))}
        </Box>
      ) : null}

      <Row>
        <TextField select size="small" label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="">Todas</MenuItem>{Object.keys(STATUS_COR).map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Espaço" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="">Todos</MenuItem>{spaces.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
        </TextField>
      </Row>
      {lista.error ? <Alert severity="warning">Não foi possível carregar as reservas: {lista.error}</Alert> : null}
      {!lista.error && !lista.loading && !itemsOf(lista.data).length ? <Alert severity="info">Nenhuma reserva encontrada.</Alert> : null}
      {itemsOf(lista.data).length ? (
        <Paper variant="outlined" sx={{ borderRadius: 3, overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Título</TableCell><TableCell>Espaço</TableCell><TableCell>Início</TableCell><TableCell>Fim</TableCell><TableCell>Tipo</TableCell><TableCell>Situação</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {itemsOf(lista.data).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.titulo}{r.bloqueio ? <Chip size="small" sx={{ ml: 1 }} label="Bloqueio" /> : null}</TableCell>
                  <TableCell>{nomeEsp(r.spaceId)}</TableCell><TableCell>{fmtDT(r.inicio)}</TableCell><TableCell>{fmtDT(r.fim)}</TableCell><TableCell>{r.tipo}</TableCell>
                  <TableCell><Chip size="small" color={STATUS_COR[r.status] || "default"} label={r.status} /></TableCell>
                  <TableCell align="right">{["PENDENTE", "APROVADA"].includes(r.status) ? <Button size="small" color="error" onClick={() => decidir(r, "cancelar")}>Cancelar</Button> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova reserva de espaço</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
          <TextField label="Título" required value={f.titulo || ""} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          <TextField select label="Tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{TIPOS.map((t) => <MenuItem key={t} value={t}>{t.replace("_", " ")}</MenuItem>)}</TextField>
          <TextField label="Início" required type="datetime-local" slotProps={{ inputLabel: { shrink: true } }} value={f.inicio || ""} onChange={(e) => setF({ ...f, inicio: e.target.value })} />
          <TextField label="Fim" required type="datetime-local" slotProps={{ inputLabel: { shrink: true } }} value={f.fim || ""} onChange={(e) => setF({ ...f, fim: e.target.value })} />
          <TextField type="number" label="Participantes previstos" value={f.participantes || ""} onChange={(e) => setF({ ...f, participantes: e.target.value })} />
          <TextField select label="Espaço" required value={f.spaceId || ""} onChange={(e) => { setF({ ...f, spaceId: e.target.value }); setCheck(null); }}>{spaces.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}</TextField>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button size="small" variant="outlined" disabled={!f.inicio || !f.fim} onClick={buscarLivres}>Buscar espaços livres</Button>
            <Button size="small" variant="outlined" disabled={!f.spaceId || !f.inicio || !f.fim} onClick={verificar}>Verificar conflitos</Button>
          </Box>
          {livres ? <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>{livres.length ? livres.slice(0, 20).map((e) => <Chip key={e.id} size="small" label={`${e.codigo} (${e.capacidade})`} onClick={() => { setF({ ...f, spaceId: e.id }); setCheck(null); }} />) : <Typography variant="caption">Nenhum espaço livre nesse horário.</Typography>}</Box> : null}
          {check ? (check.erro ? <Alert severity="warning">{check.erro}</Alert> : check.livre ? <Alert severity="success">Espaço livre no horário.</Alert> : <Alert severity="error">Conflitos: {(check.conflitos || []).map((c: any) => c.descricao).join(" | ")}</Alert>) : null}
          <TextField select label="Recorrência" value={f.recorrencia} onChange={(e) => setF({ ...f, recorrencia: e.target.value })}>{["NENHUMA", "DIARIA", "SEMANAL", "QUINZENAL", "MENSAL"].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}</TextField>
          {f.recorrencia !== "NENHUMA" ? <TextField type="date" required label="Repetir até" slotProps={{ inputLabel: { shrink: true } }} value={f.ate || ""} onChange={(e) => setF({ ...f, ate: e.target.value })} /> : null}
          <TextField label="Finalidade" multiline minRows={2} value={f.finalidade || ""} onChange={(e) => setF({ ...f, finalidade: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || !f.titulo || !f.spaceId || !f.inicio || !f.fim} onClick={salvar}>Solicitar</Button>
        </DialogActions>
      </Dialog>
      {node}
    </Box>
  );
}
