import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Pagination, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { StatusChip } from "../EduResourcePage";
import { BASE, Section, Stat, StateBox, asList, fmtDate, money, pct, useLoad, type Toast } from "./common";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const STATUS = ["PENDENTE_DOCUMENTOS", "DOCUMENTOS_OK", "CONCLUIDA", "CANCELADA"];

async function abrirContrato(id: string, toast: (t: Toast) => void) {
  try {
    const res = await fetch(`${API}/edu${BASE}/matriculas/${id}/contrato`, { headers: { Authorization: `Bearer ${localStorage.getItem("dentalpos.token") || ""}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Erro ${res.status}`);
    const url = URL.createObjectURL(new Blob([await res.text()], { type: "text/html" }));
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e: any) { toast({ type: "error", text: e.message }); }
}

function Checklist({ candidatoId, toast, onChanged }: { candidatoId: string; toast: (t: Toast) => void; onChanged: () => void }) {
  const docs = useLoad<any[]>(`${BASE}/candidatos/${candidatoId}/documentos`);
  const list = asList(docs.data);
  const ok = list.filter((d) => d.status === "APROVADO").length;
  async function act(fn: () => Promise<any>, msg: string) {
    try { await fn(); toast({ type: "success", text: msg }); docs.reload(); onChanged(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <StateBox loading={docs.loading} error={docs.error} onRetry={docs.reload} empty={!list.length} emptyText="Checklist vazio. Use “Preparar dados padrão” no Painel para criar os tipos de documento.">
      <Typography variant="body2" sx={{ mb: 1 }}>{ok} de {list.length} documentos aprovados</Typography>
      <Box sx={{ display: "grid", gap: 1 }}>
        {list.map((d) => (
          <Box key={d.codigo} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", border: 1, borderColor: "divider", borderRadius: 2, p: 1 }}>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 160, fontWeight: 600 }}>{d.nome}{d.obrigatorio ? " *" : ""}</Typography>
            <StatusChip value={d.status} />
            {d.url ? <Button size="small" href={d.url} target="_blank" rel="noreferrer">Ver arquivo</Button> : null}
            <Button size="small" onClick={() => { const url = window.prompt("Link do arquivo do documento:"); if (url) act(() => eduApi.post(`${BASE}/candidatos/${candidatoId}/documentos/${d.codigo}/enviar`, { url }), "Documento registrado."); }}>Anexar</Button>
            {d.status === "ENVIADO" ? <>
              <Button size="small" color="success" onClick={() => act(() => eduApi.post(`${BASE}/candidatos/${candidatoId}/documentos/${d.codigo}/revisar`, { status: "APROVADO" }), "Documento aprovado.")}>Aprovar</Button>
              <Button size="small" color="error" onClick={() => { const o = window.prompt("Motivo da rejeição:"); if (o) act(() => eduApi.post(`${BASE}/candidatos/${candidatoId}/documentos/${d.codigo}/revisar`, { status: "REJEITADO", observacao: o }), "Documento rejeitado."); }}>Rejeitar</Button>
            </> : null}
            {d.observacao ? <Typography variant="caption" color="error" sx={{ width: "100%" }}>{d.observacao}</Typography> : null}
          </Box>
        ))}
      </Box>
    </StateBox>
  );
}

function IniciarDialog({ open, onClose, toast, onDone }: { open: boolean; onClose: () => void; toast: (t: Toast) => void; onDone: () => void }) {
  const apr = useLoad<any>(open ? `${BASE}/candidatos${qsOf({ status: "CONVOCADO", pageSize: 100 })}` : null);
  const apr2 = useLoad<any>(open ? `${BASE}/candidatos${qsOf({ status: "APROVADO", pageSize: 100 })}` : null);
  const cands = [...asList(apr.data), ...asList(apr2.data)];
  const [cid, setCid] = useState("");
  async function ir() {
    try { await eduApi.post(`${BASE}/matriculas/iniciar`, { candidatoId: cid }); toast({ type: "success", text: "Matrícula iniciada: gere o checklist de documentos." }); onClose(); onDone(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Iniciar matrícula</DialogTitle>
      <DialogContent dividers sx={{ pt: 2 }}>
        <StateBox loading={apr.loading || apr2.loading} error={apr.error || apr2.error} empty={!cands.length} emptyText="Nenhum candidato convocado/aprovado aguardando matrícula.">
          <TextField select fullWidth size="small" label="Candidato convocado" value={cid} onChange={(e) => setCid(e.target.value)}>
            {cands.map((c) => <MenuItem key={c.id} value={c.id}>{c.nome} — {c.protocolo} ({c.status.toLowerCase()})</MenuItem>)}
          </TextField>
        </StateBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!cid} onClick={ir}>Iniciar</Button></DialogActions>
    </Dialog>
  );
}

function EfetivarDialog({ m, onClose, toast, onDone }: { m: any | null; onClose: () => void; toast: (t: Toast) => void; onDone: () => void }) {
  const [dia, setDia] = useState("10");
  async function ir() {
    try {
      const r = await eduApi.post(`${BASE}/matriculas/${m.id}/efetivar`, { diaVencimento: Number(dia) });
      toast({ type: "success", text: `Matrícula efetivada${r?.matricula?.ra ? ` — RA ${r.matricula.ra}` : ""}.` }); onClose(); onDone();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open={!!m} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Efetivar matrícula</DialogTitle>
      <DialogContent dividers sx={{ pt: 2 }}>
        <Typography variant="body2" sx={{ mb: 2 }}>{m?.candidato?.nome}: cria o aluno (RA), a matrícula acadêmica e as mensalidades. Exige documentos aprovados e contrato aceito.</Typography>
        <TextField type="number" size="small" fullWidth label="Dia de vencimento das mensalidades (1 a 28)" value={dia} onChange={(e) => setDia(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 28 } }} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={ir}>Efetivar</Button></DialogActions>
    </Dialog>
  );
}

export default function MatriculaTab({ toast }: { toast: (t: Toast) => void }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const list = useLoad<any>(`${BASE}/matriculas${qsOf({ status, page, pageSize: 20 })}`);
  const [iniciar, setIniciar] = useState(false);
  const [docsDe, setDocsDe] = useState<any | null>(null);
  const [efet, setEfet] = useState<any | null>(null);
  const rows = asList(list.data);
  const total = list.data?.total ?? rows.length;

  async function act(fn: () => Promise<any>, msg: string) {
    try { const r = await fn(); toast({ type: "success", text: typeof msg === "function" ? (msg as any)(r) : msg }); list.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  const pendentes = rows.filter((r) => ["PENDENTE_DOCUMENTOS", "DOCUMENTOS_OK"].includes(r.status)).length;

  return (
    <>
      <Section title="Matrículas" description="Do convocado ao aluno: documentos, contrato, efetivação e primeira mensalidade."
        actions={<Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField select size="small" label="Situação" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} sx={{ minWidth: 200 }}>
            <MenuItem value="">Todas</MenuItem>{STATUS.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, " ")}</MenuItem>)}
          </TextField>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setIniciar(true)}>Iniciar matrícula</Button>
        </Box>}>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
          <Stat label="Nesta lista" value={total} /><Stat label="Em andamento (página)" value={pendentes} />
        </Box>
        <StateBox loading={list.loading} error={list.error} onRetry={list.reload} empty={!rows.length} emptyText="Nenhuma matrícula encontrada.">
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow>{["Candidato", "Mensalidade", "Desconto", "Contrato", "Situação", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {rows.map((m) => {
                  const fechada = ["CONCLUIDA", "CANCELADA"].includes(m.status);
                  return (
                    <TableRow key={m.id} hover>
                      <TableCell><b>{m.candidato?.nome}</b><br /><Typography variant="caption" color="text.secondary">{m.candidato?.protocolo}{m.ra ? ` · RA ${m.ra}` : ""}</Typography></TableCell>
                      <TableCell>{money(m.valorComDesconto)} × {m.parcelas}<br /><Typography variant="caption" color="text.secondary">tabela {money(m.valorMensalidade)}</Typography></TableCell>
                      <TableCell>{pct(m.percentualDesconto)}</TableCell>
                      <TableCell>{m.contratoAceitoEm ? <Chip size="small" color="success" label={`Aceito em ${fmtDate(m.contratoAceitoEm)}`} /> : <Chip size="small" label="Não aceito" />}</TableCell>
                      <TableCell><StatusChip value={m.status} /></TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        <Button size="small" onClick={() => setDocsDe(m)}>Documentos</Button>
                        <Button size="small" onClick={() => abrirContrato(m.id, toast)}>Contrato</Button>
                        {!fechada && !m.contratoAceitoEm ? <Button size="small" onClick={() => act(() => eduApi.post(`${BASE}/matriculas/${m.id}/aceitar-contrato`), "Aceite do contrato registrado.")}>Registrar aceite</Button> : null}
                        {!fechada ? <Button size="small" onClick={() => act(() => eduApi.post(`${BASE}/matriculas/${m.id}/lembrar-documentos`), "Lembrete enviado ao candidato.")}>Cobrar docs</Button> : null}
                        {!fechada ? <Button size="small" color="success" onClick={() => setEfet(m)}>Efetivar</Button> : null}
                        {m.status !== "CONCLUIDA" && m.status !== "CANCELADA" ? (
                          <Button size="small" color="error" onClick={() => { const motivo = window.prompt("Motivo do cancelamento:"); if (motivo && motivo.length >= 3) act(() => eduApi.post(`${BASE}/matriculas/${m.id}/cancelar`, { motivo }), "Matrícula cancelada."); }}>Cancelar</Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
          {total > 20 ? <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / 20)} page={page} onChange={(_, v) => setPage(v)} /></Box> : null}
        </StateBox>
      </Section>
      <Dialog open={!!docsDe} onClose={() => setDocsDe(null)} fullWidth maxWidth="md">
        <DialogTitle>Documentos — {docsDe?.candidato?.nome}</DialogTitle>
        <DialogContent dividers>{docsDe ? <Checklist candidatoId={docsDe.candidatoId} toast={toast} onChanged={list.reload} /> : null}</DialogContent>
        <DialogActions><Button onClick={() => setDocsDe(null)}>Fechar</Button></DialogActions>
      </Dialog>
      <IniciarDialog open={iniciar} onClose={() => setIniciar(false)} toast={toast} onDone={list.reload} />
      <EfetivarDialog m={efet} onClose={() => setEfet(null)} toast={toast} onDone={list.reload} />
    </>
  );
}
