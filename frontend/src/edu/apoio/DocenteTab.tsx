import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import { COLORS, FormDialog, Kanban, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDate, fmtDateTime, fmtNum, fmtPct, itemsOf, openHtml, useApi, useRunner, useToast } from "../desempenho/kit";

const FORM_FIELDS = [
  { key: "titulo", label: "Título", required: true }, { key: "tipo", label: "Tipo", type: "select" as const, options: ["OFICINA", "CURSO", "PALESTRA", "WORKSHOP", "SEMINARIO"] },
  { key: "modalidade", label: "Modalidade", type: "select" as const, options: ["PRESENCIAL", "EAD", "HIBRIDO"] }, { key: "status", label: "Status", type: "select" as const, options: ["PLANEJADA", "INSCRICOES", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"] },
  { key: "inicio", label: "Início", type: "datetime" as const, required: true }, { key: "fim", label: "Fim", type: "datetime" as const, required: true },
  { key: "cargaHoraria", label: "Carga horária (h)", type: "number" as const }, { key: "vagas", label: "Vagas", type: "number" as const }, { key: "frequenciaMinima", label: "Frequência mínima (%)", type: "number" as const },
  { key: "instrutor", label: "Instrutor" }, { key: "local", label: "Local" }, { key: "ementa", label: "Ementa", type: "textarea" as const }, { key: "emiteCertificado", label: "Emite certificado", type: "bool" as const },
];

function Formacoes() {
  const [rev, setRev] = useState(0);
  const [edit, setEdit] = useState<null | { row?: any }>(null);
  const [insc, setInsc] = useState<any | null>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useApi<any>("/apoio/formacoes?pageSize=100", [rev]);
  const rows = itemsOf(l.data);
  return (
    <Section title="Formação continuada docente" actions={<Button variant="contained" onClick={() => setEdit({})}>Nova formação</Button>}>
      {node}
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nenhuma formação cadastrada." onRetry={l.reload}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Formação</TableCell><TableCell>Quando</TableCell><TableCell>Carga</TableCell><TableCell>Vagas</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {rows.map((f) => (
                <TableRow key={f.id} hover>
                  <TableCell>{f.titulo}<Typography variant="caption" color="text.secondary" component="div">{f.tipo} · {f.modalidade}{f.instrutor ? ` · ${f.instrutor}` : ""}</Typography></TableCell>
                  <TableCell>{fmtDateTime(f.inicio)}</TableCell><TableCell>{f.cargaHoraria} h</TableCell><TableCell>{f.vagas}</TableCell><TableCell><Status value={f.status} /></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {f.status === "INSCRICOES" && <Button size="small" color="success" onClick={() => run(() => call("POST", `/apoio/formacoes/${f.id}/inscrever`), "Inscrição realizada.")}>Inscrever-me</Button>}
                    <Button size="small" onClick={() => setInsc(f)}>Inscritos</Button>
                    <Button size="small" onClick={() => setEdit({ row: f })}>Editar</Button>
                    <Button size="small" color="error" onClick={() => run(() => call("DELETE", `/apoio/formacoes/${f.id}`), "Formação removida.", "Remover esta formação?")}>Excluir</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </LoadBox>
      <FormDialog open={!!edit} onClose={() => setEdit(null)} title={edit?.row ? "Editar formação" : "Nova formação"} fields={FORM_FIELDS}
        initial={edit?.row ? { ...edit.row, inicio: String(edit.row.inicio).slice(0, 16), fim: String(edit.row.fim).slice(0, 16) } : { tipo: "OFICINA", modalidade: "PRESENCIAL", status: "INSCRICOES", cargaHoraria: 4, vagas: 30, frequenciaMinima: 75, emiteCertificado: true }}
        onSubmit={async (b) => { if (edit?.row) await call("PUT", `/apoio/formacoes/${edit.row.id}`, b); else await call("POST", "/apoio/formacoes", b); setRev((x) => x + 1); }} />
      {insc && <Inscritos f={insc} onClose={() => { setInsc(null); setRev((x) => x + 1); }} toast={toast} />}
    </Section>
  );
}

function Inscritos({ f, onClose, toast }: { f: any; onClose: () => void; toast: any }) {
  const [rev, setRev] = useState(0);
  const [freq, setFreq] = useState<Record<string, string>>({});
  const l = useApi<any>(`/apoio/formacoes/${f.id}/inscricoes`, [rev]);
  const rows = itemsOf(l.data);
  async function concluir() {
    const presencas = rows.filter((i) => i.status === "INSCRITO").map((i) => ({ userId: i.userId, frequenciaPercent: Number(freq[i.userId] ?? 100) }));
    if (!presencas.length) return;
    if (!window.confirm(`Concluir a formação? Frequência mínima: ${f.frequenciaMinima}%. Certificados serão liberados aos aprovados.`)) return;
    try { const r = await call("POST", `/apoio/formacoes/${f.id}/concluir`, { presencas }); toast({ type: "success", text: `${r.concluidos} concluído(s), ${r.reprovados} reprovado(s) por frequência.` }); setRev((x) => x + 1); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Inscritos — {f.titulo}</DialogTitle>
      <DialogContent dividers>
        <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Sem inscritos." onRetry={l.reload}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Docente/colaborador</TableCell><TableCell>Status</TableCell><TableCell>Frequência (%)</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.nome ?? i.userId}</TableCell><TableCell><Status value={i.status} /></TableCell>
                  <TableCell>{i.status !== "INSCRITO" ? (i.frequenciaPercent != null ? fmtNum(i.frequenciaPercent, 0) : "—") : <TextField size="small" type="number" sx={{ width: 90 }} value={freq[i.userId] ?? "100"} onChange={(e) => setFreq({ ...freq, [i.userId]: e.target.value })} />}</TableCell>
                  <TableCell align="right">{i.status === "CONCLUIDO" && f.emiteCertificado && <Button size="small" onClick={() => openHtml(`/apoio/formacoes/inscricoes/${i.id}/certificado`).catch((e) => toast({ type: "error", text: e.message }))}>Certificado</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button>{f.status !== "CONCLUIDA" && <Button variant="contained" disabled={!rows.length} onClick={concluir}>Concluir e certificar</Button>}</DialogActions>
    </Dialog>
  );
}

const COLS = ["ABERTO", "EM_ATENDIMENTO", "AGUARDANDO_SOLICITANTE", "RESOLVIDO", "FECHADO"];
const COLC: Record<string, string> = { ABERTO: COLORS.info, EM_ATENDIMENTO: COLORS.warn, AGUARDANDO_SOLICITANTE: "#7a5cff", RESOLVIDO: COLORS.ok, FECHADO: COLORS.mute };

function Chamado({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<null | "coment" | "status" | "aval">(null);
  const { toast, node } = useToast();
  const after = () => { setRev((x) => x + 1); onChange(); };
  const c = useApi<any>(`/apoio/chamados/${id}`, [rev]);
  const d = c.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{d?.titulo ?? "Chamado"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={c.loading} error={c.error} onRetry={c.reload}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}><Status value={d?.status} /><Chip size="small" label={String(d?.categoria).replace(/_/g, " ")} /><Chip size="small" variant="outlined" label={`Prioridade ${d?.prioridade}`} />{d?.prazoEm && <Chip size="small" color={new Date(d.prazoEm) < new Date() && ["ABERTO", "EM_ATENDIMENTO"].includes(d.status) ? "error" : "default"} label={`SLA ${fmtDate(d.prazoEm)}`} />}</Box>
          <Typography sx={{ whiteSpace: "pre-wrap", mb: 2 }}>{d?.descricao}</Typography>
          <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
            <Button size="small" variant="outlined" onClick={() => setDlg("coment")}>Comentar</Button>
            <Button size="small" variant="outlined" onClick={() => setDlg("status")}>Alterar status</Button>
            <Button size="small" onClick={async () => { try { await call("POST", `/apoio/chamados/${id}/atribuir`, {}); toast({ type: "success", text: "Chamado atribuído a você." }); after(); } catch (e: any) { toast({ type: "error", text: e.message }); } }}>Assumir</Button>
            {["RESOLVIDO", "FECHADO"].includes(d?.status) && d?.avaliacaoNota == null && <Button size="small" color="success" onClick={() => setDlg("aval")}>Avaliar atendimento</Button>}
          </Box>
          {(d?.andamentos || []).map((a: any) => <Typography key={a.id} variant="caption" component="div" color="text.secondary">{fmtDateTime(a.createdAt)} {a.publico ? "" : "(interno) "}— {a.texto}</Typography>)}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      <FormDialog open={dlg === "coment"} onClose={() => setDlg(null)} maxWidth="sm" title="Comentar" fields={[{ key: "texto", label: "Comentário", type: "textarea", required: true }, { key: "interno", label: "Nota interna (só equipe)", type: "bool" }]} onSubmit={async (b) => { await call("POST", `/apoio/chamados/${id}/comentar`, b); after(); }} />
      <FormDialog open={dlg === "status"} onClose={() => setDlg(null)} maxWidth="sm" title="Alterar status" fields={[{ key: "status", label: "Status", type: "select", options: COLS, required: true }, { key: "nota", label: "Observação", type: "textarea" }]} onSubmit={async (b) => { await call("POST", `/apoio/chamados/${id}/status`, b); after(); }} />
      <FormDialog open={dlg === "aval"} onClose={() => setDlg(null)} maxWidth="sm" title="Avaliar atendimento" fields={[{ key: "nota", label: "Nota (1 a 5)", type: "number", required: true }, { key: "comentario", label: "Comentário", type: "textarea" }]} onSubmit={async (b) => { await call("POST", `/apoio/chamados/${id}/avaliar`, b); after(); }} />
    </Dialog>
  );
}

function Chamados() {
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [det, setDet] = useState<string | null>(null);
  const [meus, setMeus] = useState(false);
  const l = useApi<any>(`/apoio/chamados?pageSize=100${meus ? "&meus=true" : ""}`, [rev]);
  const rel = useApi<any>("/apoio/chamados-relatorio", [rev]);
  const rows = itemsOf(l.data);
  const { toast, node } = useToast();
  return (
    <Box>
      {node}
      {rel.data && (
        <KpiRow>
          <Kpi title="Chamados" value={rel.data.total} /><Kpi title="Resolvidos no prazo" value={fmtPct(rel.data.percentualNoPrazo, 0)} color={(rel.data.percentualNoPrazo ?? 100) < 80 ? COLORS.bad : COLORS.ok} />
          <Kpi title="Tempo médio" value={rel.data.tempoMedioResolucaoHoras != null ? `${fmtNum(rel.data.tempoMedioResolucaoHoras, 0)} h` : "—"} /><Kpi title="Satisfação" value={rel.data.satisfacaoMedia != null ? `${fmtNum(rel.data.satisfacaoMedia)}/5` : "—"} />
          <Kpi title="Vencidos abertos" value={rel.data.vencidosAbertos ?? 0} color={rel.data.vencidosAbertos ? COLORS.bad : COLORS.ok} />
        </KpiRow>
      )}
      <Section title="Suporte ao docente (helpdesk)" actions={<><Button variant={meus ? "contained" : "outlined"} onClick={() => setMeus(!meus)}>Só meus chamados</Button><Button variant="contained" onClick={() => setNovo(true)}>Novo chamado</Button></>}>
        <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nenhum chamado." onRetry={l.reload}>
          <Kanban columns={COLS} items={rows} getCol={(c) => c.status} colors={COLC} onOpen={(c) => setDet(c.id)} title={(c) => c.titulo} subtitle={(c) => `${String(c.categoria).replace(/_/g, " ")} · ${c.solicitante ?? ""}`}
            meta={(c) => <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>{["ALTA", "URGENTE"].includes(c.prioridade) && <Chip size="small" color="error" label={c.prioridade} />}{c.prazoEm && ["ABERTO", "EM_ATENDIMENTO"].includes(c.status) && <Chip size="small" color={new Date(c.prazoEm) < new Date() ? "error" : "default"} label={`SLA ${fmtDate(c.prazoEm)}`} />}</Box>} />
        </LoadBox>
      </Section>
      <FormDialog open={novo} onClose={() => setNovo(false)} title="Novo chamado" initial={{ categoria: "OUTRO", prioridade: "NORMAL" }}
        fields={[{ key: "categoria", label: "Categoria", type: "select", options: ["TECNOLOGIA", "SALA_AULA", "MATERIAL", "SISTEMA_ACADEMICO", "RH", "BIBLIOTECA", "OUTRO"] }, { key: "prioridade", label: "Prioridade", type: "select", options: ["BAIXA", "NORMAL", "ALTA", "URGENTE"] },
          { key: "titulo", label: "Título (mín. 5)", required: true, full: true }, { key: "descricao", label: "Descrição (mín. 10)", type: "textarea", required: true }]}
        onSubmit={async (b) => { await call("POST", "/apoio/chamados", b); toast({ type: "success", text: "Chamado aberto." }); setRev((x) => x + 1); }} />
      {det && <Chamado id={det} onClose={() => setDet(null)} onChange={() => setRev((x) => x + 1)} />}
    </Box>
  );
}

function Materiais() {
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [aval, setAval] = useState<any | null>(null);
  const [status, setStatus] = useState("");
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useApi<any>(`/apoio/materiais?pageSize=100${status ? `&status=${status}` : ""}`, [rev]);
  const rows = itemsOf(l.data);
  return (
    <Section title="Banco de materiais didáticos compartilhados" actions={<><Pick label="Moderação" value={status} all="Aprovados" minWidth={150} onChange={setStatus} options={["PENDENTE", "APROVADO", "REJEITADO"].map((s) => ({ value: s, label: s }))} /><Button variant="contained" onClick={() => setNovo(true)}>Compartilhar material</Button></>}>
      {node}
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nenhum material." onRetry={l.reload}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Material</TableCell><TableCell>Tipo</TableCell><TableCell>Avaliação</TableCell><TableCell>Acessos</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id} hover>
                <TableCell>{m.titulo}<Typography variant="caption" color="text.secondary" component="div">{(m.tags || []).join(", ")}</Typography></TableCell><TableCell>{String(m.tipo).replace(/_/g, " ")}</TableCell>
                <TableCell>{m.avaliacaoMedia != null ? `${fmtNum(m.avaliacaoMedia)} (${m.avaliacaoQtd})` : "—"}</TableCell><TableCell>{m.acessos ?? 0}</TableCell><TableCell><Status value={m.status} /></TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  {m.url && <Button size="small" onClick={async () => { try { const r = await call("POST", `/apoio/materiais/${m.id}/acessar`); if (r?.url) window.open(r.url, "_blank", "noopener"); } catch (e: any) { toast({ type: "error", text: e.message }); } }}>Abrir</Button>}
                  <Button size="small" onClick={() => setAval(m)}>Avaliar</Button>
                  {m.status === "PENDENTE" && <Button size="small" color="success" onClick={() => run(() => call("POST", `/apoio/materiais/${m.id}/moderar`, { aprovado: true }), "Material aprovado.")}>Aprovar</Button>}
                  {m.status === "PENDENTE" && <Button size="small" color="warning" onClick={() => run(() => call("POST", `/apoio/materiais/${m.id}/moderar`, { aprovado: false }), "Material rejeitado.", "Rejeitar este material?")}>Rejeitar</Button>}
                  <Button size="small" color="error" onClick={() => run(() => call("DELETE", `/apoio/materiais/${m.id}`), "Material removido.", "Remover este material?")}>Excluir</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </LoadBox>
      <FormDialog open={novo} onClose={() => setNovo(false)} title="Compartilhar material" initial={{ tipo: "DOCUMENTO" }}
        fields={[{ key: "titulo", label: "Título", required: true }, { key: "tipo", label: "Tipo", type: "select", options: ["DOCUMENTO", "SLIDES", "VIDEO", "ROTEIRO", "MODELO_AVALIACAO", "LINK", "OUTRO"] }, { key: "url", label: "Link (URL completa)" }, { key: "tags", label: "Tags", type: "list" }, { key: "descricao", label: "Descrição", type: "textarea" }]}
        onSubmit={async (b) => { await call("POST", "/apoio/materiais", b); toast({ type: "success", text: "Material enviado para moderação." }); setRev((x) => x + 1); }} />
      <FormDialog open={!!aval} onClose={() => setAval(null)} maxWidth="sm" title={`Avaliar — ${aval?.titulo ?? ""}`} fields={[{ key: "nota", label: "Nota (1 a 5)", type: "number", required: true }]}
        onSubmit={async (b) => { await call("POST", `/apoio/materiais/${aval.id}/avaliar`, b); setRev((x) => x + 1); }} />
    </Section>
  );
}

export default function DocenteTab() {
  const [sub, setSub] = useState("form");
  return (
    <Box>
      <ToggleButtonGroup size="small" exclusive value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2 }}>
        <ToggleButton value="form">Formação continuada</ToggleButton><ToggleButton value="cham">Chamados</ToggleButton><ToggleButton value="mat">Materiais</ToggleButton>
      </ToggleButtonGroup>
      {sub === "form" && <Formacoes />}{sub === "cham" && <Chamados />}{sub === "mat" && <Materiais />}
      <Alert severity="info" sx={{ mt: 2 }}>Formações emitem certificado com a logomarca da instituição para quem cumprir a frequência mínima.</Alert>
    </Box>
  );
}
