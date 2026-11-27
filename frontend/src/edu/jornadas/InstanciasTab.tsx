import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Pagination, Paper, Snackbar, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import BoltIcon from "@mui/icons-material/Bolt";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import InstanciaDialog from "./InstanciaDialog";
import { Loadable, fmtData, papelLabel, useAsync } from "./common";

const PERSON_TYPE: Record<string, string> = { ALUNO: "aluno", PROFESSOR: "professor", COORDENADOR: "coordenador", FUNCIONARIO: "funcionario", DIRETORIA: "diretoria", EGRESSO: "egresso", CANDIDATO: "candidato", REITORIA: "reitoria" };

/** Instâncias de jornada por pessoa, com etapas atuais, detalhe e avanço. */
export default function InstanciasTab({ persona, templateId, templateChave }: { persona: string; templateId: string; templateChave?: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ATIVA");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [evento, setEvento] = useState(false);
  const [form, setForm] = useState({ personId: "", personNome: "", evento: "" });
  const [msg, setMsg] = useState<{ t: "success" | "error"; s: string } | null>(null);
  const pageSize = 20;

  const { data, loading, error, reload } = useAsync(
    () => eduApi.get(`/jornadas/instancias${qsOf({ templateId, status, q, page, pageSize })}`), [templateId, status, q, page]);
  const items: any[] = data?.items || [];
  const total: number = data?.total ?? items.length;

  async function iniciar() {
    try {
      const r = await eduApi.post("/jornadas/instancias", { templateId, personType: PERSON_TYPE[persona] || persona.toLowerCase(), personId: form.personId.trim(), personNome: form.personNome.trim() || undefined });
      setMsg({ t: "success", s: r.jaExistia ? "A pessoa já possui esta jornada ativa." : "Jornada iniciada." });
      setNovo(false); setForm({ personId: "", personNome: "", evento: "" }); reload();
    } catch (e: any) { setMsg({ t: "error", s: e.message }); }
  }
  async function disparar() {
    try {
      await eduApi.post("/jornadas/eventos", { evento: form.evento.trim(), personType: PERSON_TYPE[persona] || undefined, personId: form.personId.trim() || undefined });
      setMsg({ t: "success", s: "Evento disparado." }); setEvento(false); reload();
    } catch (e: any) { setMsg({ t: "error", s: e.message }); }
  }

  if (!templateId) return <Alert severity="info">Selecione uma jornada.</Alert>;
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Jornadas em andamento</Typography>
          <Typography variant="body2" color="text.secondary">{templateChave ? `Modelo: ${templateChave}. ` : ""}Abra uma pessoa para ver o fluxograma com o progresso e avançar etapas.</Typography>
        </Box>
        <TextField size="small" placeholder="Buscar por nome…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <TextField select size="small" label="Situação" sx={{ minWidth: 140 }} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <MenuItem value="">Todas</MenuItem><MenuItem value="ATIVA">Ativas</MenuItem><MenuItem value="PAUSADA">Pausadas</MenuItem><MenuItem value="CONCLUIDA">Concluídas</MenuItem><MenuItem value="CANCELADA">Canceladas</MenuItem>
        </TextField>
        <Button startIcon={<BoltIcon />} onClick={() => setEvento(true)}>Disparar evento</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Iniciar jornada</Button>
      </Box>
      <Loadable loading={loading} error={error}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell sx={{ fontWeight: 800 }}>Pessoa</TableCell><TableCell sx={{ fontWeight: 800 }}>Situação</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>Etapas atuais</TableCell><TableCell sx={{ fontWeight: 800 }}>Início</TableCell><TableCell />
            </TableRow></TableHead>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => setOpenId(r.id)}>
                  <TableCell><b>{r.personNome || r.personId}</b><Typography variant="caption" sx={{ display: "block" }} color="text.secondary">{r.personType}</Typography></TableCell>
                  <TableCell><Chip size="small" color={r.status === "ATIVA" ? "primary" : r.status === "CONCLUIDA" ? "success" : "default"} label={r.status} /></TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                      {(r.etapas || []).map((e: any) => <Chip key={e.id} size="small" variant="outlined" color={e.status === "ATRASADA" ? "error" : "default"} label={`${e.titulo} · ${papelLabel(e.papel)}${e.prazoEm ? ` · ${fmtData(e.prazoEm)}` : ""}`} />)}
                      {!(r.etapas || []).length ? "—" : null}
                    </Box>
                  </TableCell>
                  <TableCell>{fmtData(r.iniciadaEm)}</TableCell>
                  <TableCell align="right"><Button size="small">Abrir</Button></TableCell>
                </TableRow>
              ))}
              {!items.length && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Nenhuma jornada encontrada para os filtros.</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </Box>
        {total > pageSize && <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / pageSize)} page={page} onChange={(_, v) => setPage(v)} /></Box>}
        <Typography variant="caption" color="text.secondary">{total} jornada(s)</Typography>
      </Loadable>

      {openId ? <InstanciaDialog id={openId} onClose={() => setOpenId(null)} onChanged={reload} /> : null}

      <Dialog open={novo} onClose={() => setNovo(false)} fullWidth maxWidth="sm">
        <DialogTitle>Iniciar jornada</DialogTitle>
        <DialogContent>
          <TextField fullWidth sx={{ mt: 1 }} required label="Identificador da pessoa (ID)" value={form.personId} onChange={(e) => setForm({ ...form, personId: e.target.value })} helperText="ID do aluno, professor, funcionário etc. no sistema." />
          <TextField fullWidth sx={{ mt: 2 }} label="Nome (para exibição)" value={form.personNome} onChange={(e) => setForm({ ...form, personNome: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(false)}>Cancelar</Button><Button variant="contained" disabled={!form.personId.trim()} onClick={iniciar}>Iniciar</Button></DialogActions>
      </Dialog>
      <Dialog open={evento} onClose={() => setEvento(false)} fullWidth maxWidth="sm">
        <DialogTitle>Disparar evento</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Destrava etapas que aguardam um evento (ex.: “matricula.confirmada”).</Typography>
          <TextField fullWidth required label="Nome do evento" value={form.evento} onChange={(e) => setForm({ ...form, evento: e.target.value })} />
          <TextField fullWidth sx={{ mt: 2 }} label="ID da pessoa (opcional)" value={form.personId} onChange={(e) => setForm({ ...form, personId: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setEvento(false)}>Cancelar</Button><Button variant="contained" disabled={form.evento.trim().length < 2} onClick={disparar}>Disparar</Button></DialogActions>
      </Dialog>
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.t} onClose={() => setMsg(null)}>{msg.s}</Alert> : undefined}
      </Snackbar>
    </Paper>
  );
}
