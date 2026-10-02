import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Pagination, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Bar, BASE, CANAIS_ENVIO, ROTULO_CANAL, Section, Stat, StateBox, StatusPill, asList, fmtDateTime, useLoad, type Toast } from "./common";

const SEGMENTOS: Record<string, string> = {
  INADIMPLENTES: "Alunos inadimplentes", A_VENCER: "Mensalidades a vencer", REMATRICULA_PENDENTE: "Rematrícula pendente", CANDIDATOS_ETAPA: "Candidatos por etapa",
  EGRESSOS: "Egressos", ALUNOS_ATIVOS: "Alunos ativos", CONTATOS: "Contatos (por tipo/etiqueta)", LISTA: "Lista de contatos escolhidos",
};

function NovaCampanha({ open, onClose, toast, onDone }: { open: boolean; onClose: () => void; toast: (t: Toast) => void; onDone: () => void }) {
  const tpls = useLoad<any>(open ? `${BASE}/templates?pageSize=200` : null);
  const [f, setF] = useState<any>({ segmento: "ALUNOS_ATIVOS", canal: "WHATSAPP", finalidade: "MARKETING" });
  const [flt, setFlt] = useState<Record<string, string>>({});
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const setFl = (k: string) => (e: any) => setFlt({ ...flt, [k]: e.target.value });

  async function criar() {
    try {
      const filtros: Record<string, any> = {};
      Object.entries(flt).forEach(([k, v]) => { if (v !== "") filtros[k] = ["dias", "minDiasAtraso"].includes(k) ? Number(v) : v; });
      await eduApi.post(`${BASE}/campanhas`, { nome: f.nome, segmento: f.segmento, canal: f.canal, templateId: f.templateId, finalidade: f.finalidade, filtros, ...(f.agendadaPara ? { agendadaPara: new Date(f.agendadaPara).toISOString() } : {}) });
      toast({ type: "success", text: "Campanha criada. Veja a prévia antes de disparar." }); onClose(); onDone();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Nova campanha</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        <TextField size="small" label="Nome" required value={f.nome || ""} onChange={set("nome")} />
        <TextField select size="small" label="Público" value={f.segmento} onChange={(e) => { setF({ ...f, segmento: e.target.value }); setFlt({}); }}>
          {Object.entries(SEGMENTOS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
        {["INADIMPLENTES", "A_VENCER"].includes(f.segmento) ? <TextField size="small" type="number" label={f.segmento === "A_VENCER" ? "Vencem nos próximos (dias)" : "Atraso mínimo (dias)"} value={(f.segmento === "A_VENCER" ? flt.dias : flt.minDiasAtraso) ?? ""} onChange={setFl(f.segmento === "A_VENCER" ? "dias" : "minDiasAtraso")} /> : null}
        {f.segmento === "REMATRICULA_PENDENTE" ? <TextField size="small" label="ID do período letivo (termId)" required value={flt.termId || ""} onChange={setFl("termId")} /> : null}
        {["ALUNOS_ATIVOS", "EGRESSOS"].includes(f.segmento) ? <TextField size="small" label="ID do curso (opcional)" value={flt.programId || ""} onChange={setFl("programId")} /> : null}
        {f.segmento === "CANDIDATOS_ETAPA" ? <TextField select size="small" label="Etapa do candidato" value={flt.status || ""} onChange={setFl("status")}>
          <MenuItem value="">Lead e inscrito</MenuItem>{["LEAD", "INSCRITO", "PROVA", "APROVADO", "CONVOCADO"].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField> : null}
        {f.segmento === "CONTATOS" ? <>
          <TextField select size="small" label="Tipo de contato" value={flt.tipo || ""} onChange={setFl("tipo")}><MenuItem value="">Todos</MenuItem>{["ALUNO", "CANDIDATO", "EGRESSO", "RESPONSAVEL", "FUNCIONARIO", "OUTRO"].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>
          <TextField size="small" label="Etiqueta (opcional)" value={flt.tag || ""} onChange={setFl("tag")} />
        </> : null}
        <TextField select size="small" label="Canal de envio" value={f.canal} onChange={set("canal")}>{CANAIS_ENVIO.map((c) => <MenuItem key={c} value={c}>{ROTULO_CANAL[c]}</MenuItem>)}</TextField>
        <TextField select size="small" label="Template" value={f.templateId || ""} onChange={set("templateId")} required>
          {asList(tpls.data).filter((t) => t.ativo).map((t) => <MenuItem key={t.id} value={t.id}>{t.chave} — {t.nome}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Finalidade" value={f.finalidade} onChange={set("finalidade")} helperText="Divulgação respeita quem pediu para sair (SAIR/PARAR).">
          <MenuItem value="MARKETING">Divulgação (marketing)</MenuItem><MenuItem value="COBRANCA">Cobrança</MenuItem><MenuItem value="ACADEMICO">Comunicado acadêmico</MenuItem>
        </TextField>
        <TextField size="small" type="datetime-local" label="Agendar para (opcional)" value={f.agendadaPara || ""} onChange={set("agendadaPara")} slotProps={{ inputLabel: { shrink: true } }} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!f.nome || f.nome.length < 3 || !f.templateId} onClick={criar}>Criar</Button></DialogActions>
    </Dialog>
  );
}

function Detalhe({ id, onClose }: { id: string | null; onClose: () => void }) {
  const d = useLoad<any>(id ? `${BASE}/campanhas/${id}` : null);
  const [resultado, setResultado] = useState("");
  const [page, setPage] = useState(1);
  const dest = useLoad<any>(id ? `${BASE}/campanhas/${id}/destinatarios${qsOf({ resultado, page, pageSize: 15 })}` : null);
  const m = d.data?.metricas;
  const rows = asList(dest.data);
  const total = dest.data?.total ?? rows.length;
  const base = Math.max(1, (m?.enviadas ?? 0));
  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{d.data?.nome || "Campanha"} {d.data ? <StatusPill value={d.data.status} /> : null}</DialogTitle>
      <DialogContent dividers>
        <StateBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {d.data ? (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <Stat label="Público-alvo" value={d.data.totalAlvo} /><Stat label="Enfileiradas" value={d.data.totalEnfileirado} />
                <Stat label="Bloqueadas (opt-out)" value={d.data.totalBloqueado} /><Stat label="Sem destino" value={d.data.totalSemDestino} />
              </Box>
              {m ? (
                <Box sx={{ display: "grid", gap: 1 }}>
                  <Bar value={m.enviadas} max={Math.max(1, d.data.totalEnfileirado)} label={`Enviadas: ${m.enviadas} de ${d.data.totalEnfileirado} (pendentes ${m.pendentes}, falhas ${m.falhas})`} color={m.falhas ? "warning" : "success"} />
                  <Bar value={m.entregues} max={base} label={`Entrega: ${m.taxaEntrega}%`} color="info" />
                  <Bar value={m.lidas} max={base} label={`Leitura: ${m.taxaLeitura}%`} color="primary" />
                  <Bar value={m.respostas} max={base} label={`Resposta em 72h: ${m.taxaResposta}% (${m.respostas})`} color="success" />
                </Box>
              ) : null}
              <TextField select size="small" label="Resultado do destinatário" value={resultado} onChange={(e) => { setResultado(e.target.value); setPage(1); }} sx={{ maxWidth: 260 }}>
                <MenuItem value="">Todos</MenuItem>{["ENFILEIRADO", "BLOQUEADO_OPTOUT", "SEM_DESTINO"].map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, " ")}</MenuItem>)}
              </TextField>
              <StateBox loading={dest.loading} error={dest.error} empty={!rows.length} emptyText="Sem destinatários processados ainda.">
                <Table size="small">
                  <TableHead><TableRow>{["Nome", "Destino", "Resultado"].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
                  <TableBody>{rows.map((r) => <TableRow key={r.id}><TableCell>{r.nome || "—"}</TableCell><TableCell>{r.destino || "—"}</TableCell><TableCell><StatusPill value={r.resultado} /></TableCell></TableRow>)}</TableBody>
                </Table>
                {total > 15 ? <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}><Pagination count={Math.ceil(total / 15)} page={page} onChange={(_, v) => setPage(v)} /></Box> : null}
              </StateBox>
            </Box>
          ) : null}
        </StateBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function CampanhasTab({ toast }: { toast: (t: Toast) => void }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const list = useLoad<any>(`${BASE}/campanhas${qsOf({ status, page, pageSize: 20 })}`);
  const [novo, setNovo] = useState(false);
  const [det, setDet] = useState<string | null>(null);
  const [previa, setPrevia] = useState<{ nome: string; r: any } | null>(null);
  const rows = asList(list.data);
  const total = list.data?.total ?? rows.length;

  async function act(fn: () => Promise<any>, ok: (r: any) => string) {
    try { const r = await fn(); toast({ type: "success", text: ok(r) }); list.reload(); return r; } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function verPrevia(c: any) {
    try { setPrevia({ nome: c.nome, r: await eduApi.post(`${BASE}/campanhas/${c.id}/previa`) }); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  return (
    <>
      <Section title="Campanhas de comunicação" description="Envio em massa para um público, com prévia, agendamento e métricas de entrega, leitura e resposta."
        actions={<Box sx={{ display: "flex", gap: 1 }}>
          <TextField select size="small" label="Situação" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} sx={{ minWidth: 150 }}>
            <MenuItem value="">Todas</MenuItem>{["RASCUNHO", "AGENDADA", "EXECUTANDO", "CONCLUIDA", "CANCELADA"].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Nova campanha</Button>
        </Box>}>
        <StateBox loading={list.loading} error={list.error} onRetry={list.reload} empty={!rows.length} emptyText="Nenhuma campanha criada.">
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow>{["Campanha", "Público", "Canal", "Agendada", "Alcance", "Situação", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{c.nome}<Typography variant="caption" color="text.secondary" component="div">{c.finalidade}</Typography></TableCell>
                    <TableCell>{SEGMENTOS[c.segmento] || c.segmento}</TableCell><TableCell>{ROTULO_CANAL[c.canal] || c.canal}</TableCell>
                    <TableCell>{c.agendadaPara ? fmtDateTime(c.agendadaPara) : "—"}</TableCell>
                    <TableCell>{c.totalEnfileirado ? `${c.totalEnfileirado} / ${c.totalAlvo}` : "—"}</TableCell>
                    <TableCell><StatusPill value={c.status} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Button size="small" onClick={() => setDet(c.id)}>Resultados</Button>
                      {["RASCUNHO", "AGENDADA"].includes(c.status) ? <>
                        <Button size="small" onClick={() => verPrevia(c)}>Prévia</Button>
                        <Button size="small" onClick={() => {
                          const q = window.prompt("Agendar para (AAAA-MM-DD HH:MM):", new Date(Date.now() + 3600_000).toISOString().slice(0, 16).replace("T", " "));
                          const dt = q ? new Date(q.replace(" ", "T")) : null;
                          if (dt && !Number.isNaN(dt.getTime())) act(() => eduApi.post(`${BASE}/campanhas/${c.id}/agendar`, { agendadaPara: dt.toISOString() }), () => "Campanha agendada.");
                        }}>Agendar</Button>
                        <Button size="small" color="success" onClick={() => { if (window.confirm("Disparar agora para todo o público? Esta ação enfileira as mensagens.")) act(() => eduApi.post(`${BASE}/campanhas/${c.id}/disparar`), (r) => `Campanha disparada: ${r?.totalEnfileirado ?? r?.enfileiradas ?? ""} mensagem(ns) enfileirada(s).`); }}>Disparar</Button>
                      </> : null}
                      {["RASCUNHO", "AGENDADA", "EXECUTANDO"].includes(c.status) ? <Button size="small" color="error" onClick={() => { if (window.confirm("Cancelar a campanha? Mensagens ainda pendentes serão canceladas.")) act(() => eduApi.post(`${BASE}/campanhas/${c.id}/cancelar`), (r) => `Campanha cancelada (${r?.notificacoesCanceladas ?? 0} mensagem(ns) retirada(s) da fila).`); }}>Cancelar</Button> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {total > 20 ? <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / 20)} page={page} onChange={(_, v) => setPage(v)} /></Box> : null}
        </StateBox>
      </Section>
      <NovaCampanha open={novo} onClose={() => setNovo(false)} toast={toast} onDone={list.reload} />
      <Detalhe id={det} onClose={() => setDet(null)} />
      <Dialog open={!!previa} onClose={() => setPrevia(null)} fullWidth maxWidth="sm">
        <DialogTitle>Prévia — {previa?.nome}</DialogTitle>
        <DialogContent dividers>
          {previa ? (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <Stat label="Público" value={previa.r.totalAlvo} /><Stat label="Receberão" value={previa.r.enviaveis} color="#2e7d32" />
                <Stat label="Bloqueados (opt-out)" value={previa.r.bloqueados} color={previa.r.bloqueados ? "#ed6c02" : undefined} /><Stat label="Sem destino" value={previa.r.semDestino} />
              </Box>
              {previa.r.enviaveis === 0 ? <Alert severity="warning">Ninguém receberia esta campanha. Revise o público, o canal e os contatos.</Alert> : null}
              {(previa.r.amostra || []).length ? <Typography variant="body2" color="text.secondary">Amostra: {previa.r.amostra.map((a: any) => a.nome).join(", ")}</Typography> : null}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions><Button onClick={() => setPrevia(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </>
  );
}
