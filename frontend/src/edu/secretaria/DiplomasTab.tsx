import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Snackbar, Stepper, Step, StepLabel, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import EduResourcePage from "../EduResourcePage";
import { Empty, Feedback, StatCard, StatGrid, Status, StudentSearch, fetchHtml, fmtDate, itemsOf, label, useHtmlPreview, useLoad } from "./util";

type Toast = (t: "success" | "error", m: string) => void;

const nomeCache = new Map<string, string>();
function AlunoNome({ id }: { id: string }) {
  const [n, setN] = useState<string>(nomeCache.get(id) || "");
  useEffect(() => {
    if (nomeCache.has(id)) { setN(nomeCache.get(id)!); return; }
    let alive = true;
    eduApi.get(`/secretaria/alunos/${id}/situacao`).then((s: any) => { const nm = s?.aluno?.nome || id.slice(0, 8); nomeCache.set(id, nm); if (alive) setN(nm); }).catch(() => alive && setN(id.slice(0, 8)));
    return () => { alive = false; };
  }, [id]);
  return <>{n || "…"}</>;
}

const ETAPAS = ["SOLICITADO", "CONFERENCIA", "REGISTRO", "REGISTRADO", "ENTREGUE"];

function DiplomaCard({ d, onOpen }: { d: any; onOpen: () => void }) {
  return (
    <Paper variant="outlined" onClick={onOpen} sx={{ p: 1.25, borderRadius: 2, cursor: "pointer", "&:hover": { boxShadow: 3 } }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}><AlunoNome id={d.studentId} /></Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{d.tipo === "SEGUNDA_VIA" ? "2ª via" : "Diploma"} · solicitado {fmtDate(d.solicitadoEm)}</Typography>
      {d.numeroRegistro && <Chip size="small" sx={{ mt: 0.5 }} label={`Registro nº ${d.numeroRegistro}${d.folha ? ` · fl. ${d.folha}` : ""}`} />}
    </Paper>
  );
}

function DiplomaDetalhe({ id, onClose, onChanged, toast, show }: { id: string | null; onClose: () => void; onChanged: () => void; toast: Toast; show: ReturnType<typeof useHtmlPreview>["show"] }) {
  const { data: d, loading, error, reload } = useLoad<any>(id ? `/secretaria/diplomas/${id}` : null);
  const livros = useLoad<any>(d?.status === "REGISTRO" ? "/secretaria/livros?aberto=true&pageSize=50" : null);
  const [livroId, setLivroId] = useState("");
  const [ret, setRet] = useState({ retiradoPor: "", retiradoDoc: "" });
  const [pend, setPend] = useState("");
  async function run(fn: () => Promise<any>, ok: string, conf?: string) {
    if (conf && !window.confirm(conf)) return;
    try { await fn(); toast("success", ok); reload(); onChanged(); } catch (e: any) { toast("error", e.message); }
  }
  const idx = d ? ETAPAS.indexOf(d.status === "PENDENCIA" ? "CONFERENCIA" : d.status) : 0;
  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Diploma {d && <Status value={d.status} />}</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        <Feedback loading={loading} error={error} onRetry={reload} />
        {d && (
          <>
            <Typography variant="h6"><AlunoNome id={d.studentId} /></Typography>
            {d.status !== "CANCELADO" && <Stepper activeStep={idx} alternativeLabel>{ETAPAS.map((e) => <Step key={e}><StepLabel error={d.status === "PENDENCIA" && e === "CONFERENCIA"}>{label(e)}</StepLabel></Step>)}</Stepper>}
            {d.conferencia && <Alert severity="info">Conferência documental: {label(d.conferencia.status)} ({d.conferencia.percentual}%). Veja na aba Análise de documentos.</Alert>}
            {Array.isArray(d.pendencias) && d.pendencias.length > 0 && <Alert severity="warning">{d.pendencias.map((p: string, i: number) => <div key={i}>• {p}</div>)}</Alert>}
            {d.numeroRegistro && <Typography>Registro nº <b>{d.numeroRegistro}</b>, folha {d.folha}, livro {d.livro?.numero} · {fmtDate(d.dataRegistro)}</Typography>}
            {d.status === "ENTREGUE" && <Typography>Entregue em {fmtDate(d.entregueEm)} a {d.retiradoPor} (doc. {d.retiradoDoc})</Typography>}
            {d.status === "SOLICITADO" && <Button variant="contained" onClick={() => run(() => eduApi.post(`/secretaria/diplomas/${d.id}/transitar`, { para: "CONFERENCIA" }), "Enviado para conferência.")}>Iniciar conferência</Button>}
            {["CONFERENCIA", "PENDENCIA"].includes(d.status) && (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button variant="contained" onClick={() => run(() => eduApi.post(`/secretaria/diplomas/${d.id}/transitar`, { para: "REGISTRO" }), "Liberado para registro.")}>Conferência OK → registro</Button>
                <TextField size="small" label="Registrar pendência" value={pend} onChange={(e) => setPend(e.target.value)} />
                <Button disabled={!pend.trim()} onClick={() => run(async () => { await eduApi.post(`/secretaria/diplomas/${d.id}/transitar`, { para: "PENDENCIA", pendencias: [pend] }); setPend(""); }, "Pendência registrada.")}>Marcar pendência</Button>
              </Box>
            )}
            {d.status === "REGISTRO" && (
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField select size="small" sx={{ minWidth: 260 }} label="Livro de registro aberto" value={livroId} onChange={(e) => setLivroId(e.target.value)} helperText={livros.error || undefined}>
                  {itemsOf(livros.data).filter((l) => l.tipo === "REGISTRO_DIPLOMA").map((l) => <MenuItem key={l.id} value={l.id}>Livro {l.numero} — {l.titulo}</MenuItem>)}
                </TextField>
                <Button variant="contained" disabled={!livroId} onClick={() => run(() => eduApi.post(`/secretaria/diplomas/${d.id}/registrar`, { livroId }), "Diploma registrado.", "Registrar o diploma no livro? A numeração é definitiva.")}>Registrar</Button>
              </Box>
            )}
            {d.status === "REGISTRADO" && (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr auto" }, gap: 1 }}>
                <TextField size="small" label="Retirado por" value={ret.retiradoPor} onChange={(e) => setRet({ ...ret, retiradoPor: e.target.value })} />
                <TextField size="small" label="Documento do retirante" value={ret.retiradoDoc} onChange={(e) => setRet({ ...ret, retiradoDoc: e.target.value })} />
                <Button variant="contained" disabled={ret.retiradoPor.length < 3 || ret.retiradoDoc.length < 3} onClick={() => run(() => eduApi.post(`/secretaria/diplomas/${d.id}/entregar`, ret), "Entrega registrada.")}>Registrar entrega</Button>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {d && ["REGISTRADO", "ENTREGUE"].includes(d.status) && <Button onClick={() => show("Termo de registro", () => fetchHtml(`/secretaria/diplomas/${d.id}/termo-registro`))}>Termo de registro</Button>}
        {d && !["ENTREGUE", "CANCELADO", "REGISTRADO"].includes(d.status) && <Button color="error" onClick={() => { const m = window.prompt("Motivo do cancelamento:"); if (m) run(() => eduApi.post(`/secretaria/diplomas/${d.id}/transitar`, { para: "CANCELADO", motivo: m }), "Diploma cancelado."); }}>Cancelar solicitação</Button>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}

function Diplomas({ toast, show }: { toast: Toast; show: ReturnType<typeof useHtmlPreview>["show"] }) {
  const lista = useLoad<any>("/secretaria/diplomas?pageSize=100");
  const [sel, setSel] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [aluno, setAluno] = useState<any>(null);
  const [tipo, setTipo] = useState("DIPLOMA");
  const rows = itemsOf(lista.data);
  const cols = [...ETAPAS.slice(0, 4).map((e) => ({ k: e, s: e === "CONFERENCIA" ? ["CONFERENCIA", "PENDENCIA"] : [e] })), { k: "ENTREGUE", s: ["ENTREGUE"] }];
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
      <Box sx={{ display: "flex", mb: 1.5, gap: 2, alignItems: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Esteira de diplomas</Typography>
        <Button variant="contained" onClick={() => setNovo(true)}>Solicitar diploma</Button>
      </Box>
      <Feedback loading={lista.loading} error={lista.error} onRetry={lista.reload} />
      {!lista.loading && !lista.error && !rows.length && <Empty>Nenhuma solicitação de diploma.</Empty>}
      {rows.length > 0 && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(5, minmax(0,1fr))" }, gap: 1.5, alignItems: "start" }}>
          {cols.map((c) => {
            const col = rows.filter((r) => c.s.includes(r.status));
            return (
              <Box key={c.k} sx={{ bgcolor: "action.hover", borderRadius: 3, p: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, pb: 1 }}>{label(c.k)} <Chip size="small" label={col.length} /></Typography>
                <Box sx={{ display: "grid", gap: 1, maxHeight: 460, overflow: "auto" }}>{col.map((d) => <DiplomaCard key={d.id} d={d} onOpen={() => setSel(d.id)} />)}</Box>
              </Box>
            );
          })}
        </Box>
      )}
      <Dialog open={novo} onClose={() => setNovo(false)} fullWidth maxWidth="sm">
        <DialogTitle>Solicitar diploma</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <StudentSearch value={aluno} onChange={setAluno} required />
          <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}><MenuItem value="DIPLOMA">Diploma</MenuItem><MenuItem value="SEGUNDA_VIA">2ª via</MenuItem></TextField>
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(false)}>Cancelar</Button>
          <Button variant="contained" disabled={!aluno} onClick={async () => { try { await eduApi.post("/secretaria/diplomas", { studentId: aluno.id, tipo }); toast("success", "Solicitação registrada."); setNovo(false); setAluno(null); lista.reload(); } catch (e: any) { toast("error", e.message); } }}>Solicitar</Button></DialogActions>
      </Dialog>
      <DiplomaDetalhe id={sel} onClose={() => setSel(null)} onChanged={lista.reload} toast={toast} show={show} />
    </Paper>
  );
}

function Formandos({ colacao, onClose, toast, show }: { colacao: any; onClose: () => void; toast: Toast; show: ReturnType<typeof useHtmlPreview>["show"] }) {
  const { data, loading, error, reload } = useLoad<any>(colacao ? `/secretaria/colacoes/${colacao.id}/formandos` : null);
  const c = data?.colacao || colacao;
  const resumo = data?.resumo || {};
  const [aluno, setAluno] = useState<any>(null);
  async function run(fn: () => Promise<any>, ok: (r: any) => string, conf?: string) {
    if (conf && !window.confirm(conf)) return;
    try { const r = await fn(); toast("success", ok(r)); reload(); } catch (e: any) { toast("error", e.message); }
  }
  const apto = resumo.APTO || 0;
  const total = (data?.formandos || []).length;
  return (
    <Dialog open={!!colacao} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{colacao?.nome} {c && <Status value={c.status} />}</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        <Feedback loading={loading} error={error} onRetry={reload} />
        <StatGrid>
          <StatCard title="Formandos" value={total} />
          <StatCard title="Aptos" value={apto} color="#2E7D32" />
          <StatCard title="Com pendências" value={resumo.PENDENTE || 0} color="#ED6C02" />
          <StatCard title="Colaram grau" value={resumo.COLOU || 0} color="#0F5FDB" />
        </StatGrid>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Box sx={{ minWidth: 280, flex: 1 }}><StudentSearch value={aluno} onChange={setAluno} labelText="Inscrever aluno" /></Box>
          <Button disabled={!aluno} onClick={() => run(async () => { const r = await eduApi.post(`/secretaria/colacoes/${colacao.id}/formandos`, { studentIds: [aluno.id] }); setAluno(null); return r; }, (r) => `${r.incluidos} formando(s) inscrito(s).`)}>Inscrever</Button>
          <Button onClick={() => run(() => eduApi.post(`/secretaria/colacoes/${colacao.id}/formandos`, { incluirConcluintesDoCurso: true }), (r) => `${r.incluidos} concluinte(s) incluído(s).`, "Incluir todos os concluintes do curso?")}>Incluir concluintes do curso</Button>
          <Button onClick={() => run(() => eduApi.post(`/secretaria/colacoes/${colacao.id}/reavaliar`, {}), (r) => `Reavaliados: ${r.aptos} aptos, ${r.pendentes} com pendências.`)}>Reavaliar aptidão</Button>
        </Box>
        {total === 0 && !loading && <Empty>Nenhum formando inscrito.</Empty>}
        {total > 0 && (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow>{["Formando", "Situação", "Pendências", "Juramento", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {data.formandos.map((f: any) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.nome}</TableCell><TableCell><Status value={f.status} /></TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>{Array.isArray(f.pendencias) && f.pendencias.length ? f.pendencias.join("; ") : "—"}</TableCell>
                    <TableCell>{f.juramento ? "Sim" : "Não"}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {c?.status === "REALIZADA" && f.status === "APTO" && <Button size="small" onClick={() => run(() => eduApi.patch(`/secretaria/colacoes/${colacao.id}/formandos/${f.id}`, { status: "COLOU" }), () => "Presença registrada.")}>Colou grau</Button>}
                      {c?.status === "REALIZADA" && ["APTO", "PENDENTE", "INSCRITO"].includes(f.status) && <Button size="small" color="warning" onClick={() => run(() => eduApi.patch(`/secretaria/colacoes/${colacao.id}/formandos/${f.id}`, { status: "AUSENTE" }), () => "Ausência registrada.")}>Ausente</Button>}
                      {!["EXCLUIDO", "COLOU"].includes(f.status) && <Button size="small" color="error" onClick={() => run(() => eduApi.patch(`/secretaria/colacoes/${colacao.id}/formandos/${f.id}`, { status: "EXCLUIDO" }), () => "Formando excluído da lista.", "Excluir este formando da colação?")}>Excluir</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap" }}>
        <Button onClick={() => show("Lista de formandos", () => fetchHtml(`/secretaria/colacoes/${colacao.id}/lista`))}>Lista de presença</Button>
        {c && ["PLANEJADA", "CONVOCADA", "REALIZADA"].includes(c.status) && (
          <Button onClick={() => { const prox = { PLANEJADA: "CONVOCADA", CONVOCADA: "REALIZADA", REALIZADA: "ENCERRADA" }[c.status as string]; run(() => eduApi.post(`/secretaria/colacoes/${colacao.id}/status`, { para: prox }), () => `Colação ${label(prox).toLowerCase()}.`, `Avançar a colação para ${label(prox)}?`); }}>Avançar status</Button>
        )}
        {c && ["REALIZADA", "ENCERRADA"].includes(c.status) && !c.ataId && <Button variant="contained" onClick={() => run(() => eduApi.post(`/secretaria/colacoes/${colacao.id}/ata`, { gerarDiplomas: true }), (r) => `Ata gerada; ${r.diplomasCriados} diploma(s) aberto(s).`, "Gerar a ata e abrir os diplomas dos que colaram grau?")}>Gerar ata e diplomas</Button>}
        {c?.ataId && <Button onClick={() => show("Ata da colação", () => fetchHtml(`/secretaria/atas/${c.ataId}/html`))}>Ver ata</Button>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}

function Colacoes({ toast, show }: { toast: Toast; show: ReturnType<typeof useHtmlPreview>["show"] }) {
  const [sel, setSel] = useState<any>(null);
  const cursos = useLoad<any[]>("/academico/programs");
  const opts = (cursos.data || []).map((p: any) => ({ value: p.id, label: p.nome }));
  return (
    <>
      <EduResourcePage title="Colações de grau" base="/secretaria" resource="/colacoes" dense key={sel ? "k1" : "k0"}
        description="Cadastre a cerimônia e abra os formandos para conferir aptidão, registrar presença e gerar ata/diplomas."
        columns={[{ key: "nome", label: "Colação" }, { key: "data", label: "Data", render: (r) => fmtDate(r.data) }, { key: "local", label: "Local" }, { key: "status", label: "Situação", render: (r) => <Status value={r.status} /> }, { key: "n", label: "Formandos", render: (r) => r._count?.formandos ?? 0 },
          { key: "abrir", label: "", render: (r) => <Button size="small" variant="outlined" onClick={() => setSel(r)}>Formandos</Button> }]}
        fields={[{ key: "nome", label: "Nome", required: true }, { key: "data", label: "Data da cerimônia", type: "datetime", required: true }, { key: "local", label: "Local" }, { key: "programId", label: "Curso", type: "select", options: opts }, { key: "prazoInscricaoEm", label: "Prazo de inscrição", type: "date" }, { key: "observacoes", label: "Observações", type: "textarea" }]}
        filters={[{ key: "status", label: "Situação", options: ["PLANEJADA", "CONVOCADA", "REALIZADA", "ENCERRADA", "CANCELADA"] }]} />
      <Formandos colacao={sel} onClose={() => setSel(null)} toast={toast} show={show} />
    </>
  );
}

function Livros({ toast, show }: { toast: Toast; show: ReturnType<typeof useHtmlPreview>["show"] }) {
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <EduResourcePage title="Livros de registro e atas" base="/secretaria" resource="/livros" dense canDelete={false}
        columns={[{ key: "tipo", label: "Tipo" }, { key: "numero", label: "Nº" }, { key: "titulo", label: "Título" }, { key: "aberto", label: "Situação", render: (r) => <Status value={r.aberto ? "ABERTO" : "ENCERRADO"} /> },
          { key: "x", label: "", render: (r) => <>
            <Button size="small" onClick={() => show(`Termo — livro ${r.numero}`, () => fetchHtml(`/secretaria/livros/${r.id}/termo`))}>Termo</Button>
            {r.aberto && <Button size="small" color="warning" onClick={async () => { if (!window.confirm("Encerrar o livro? Não será possível novos registros.")) return; try { await eduApi.post(`/secretaria/livros/${r.id}/encerrar`, {}); toast("success", "Livro encerrado."); } catch (e: any) { toast("error", e.message); } }}>Encerrar</Button>}
          </> }]}
        fields={[{ key: "tipo", label: "Tipo", type: "select", required: true, createOnly: true, options: ["REGISTRO_DIPLOMA", "ATAS_COLACAO", "ATAS_GERAIS", "REGISTRO_CERTIFICADO"] }, { key: "numero", label: "Número (automático se vazio)", type: "number", createOnly: true }, { key: "titulo", label: "Título", required: true }, { key: "registrosPorFolha", label: "Registros por folha", type: "number" }, { key: "termoAbertura", label: "Termo de abertura", type: "textarea" }]}
        filters={[{ key: "tipo", label: "Tipo", options: ["REGISTRO_DIPLOMA", "ATAS_COLACAO", "ATAS_GERAIS", "REGISTRO_CERTIFICADO"] }]} />
      <EduResourcePage title="Atas" base="/secretaria" resource="/atas" dense
        columns={[{ key: "tipo", label: "Tipo" }, { key: "numero", label: "Nº" }, { key: "titulo", label: "Título" }, { key: "data", label: "Data", render: (r) => fmtDate(r.data) },
          { key: "x", label: "", render: (r) => <Button size="small" onClick={() => show(r.titulo, () => fetchHtml(`/secretaria/atas/${r.id}/html`))}>Ver / imprimir</Button> }]}
        fields={[{ key: "tipo", label: "Tipo", type: "select", options: ["COLACAO", "COLEGIADO", "BANCA", "REUNIAO", "GERAL"] }, { key: "titulo", label: "Título", required: true }, { key: "data", label: "Data", type: "date", required: true }, { key: "livroId", label: "ID do livro (opcional)" }, { key: "conteudo", label: "Conteúdo", type: "textarea", required: true }]}
        filters={[{ key: "tipo", label: "Tipo", options: ["COLACAO", "COLEGIADO", "BANCA", "REUNIAO", "GERAL"] }]} />
    </Box>
  );
}

export default function DiplomasTab() {
  const [tab, setTab] = useState(0);
  const { show, dialog } = useHtmlPreview();
  const [msg, setMsg] = useState<{ t: "success" | "error"; m: string } | null>(null);
  const toast: Toast = (t, m) => setMsg({ t, m });
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">{["Diplomas", "Colação de grau", "Livros e atas"].map((t) => <Tab key={t} label={t} />)}</Tabs>
      {tab === 0 && <Diplomas toast={toast} show={show} />}
      {tab === 1 && <Colacoes toast={toast} show={show} />}
      {tab === 2 && <Livros toast={toast} show={show} />}
      {dialog}
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>{msg ? <Alert severity={msg.t} onClose={() => setMsg(null)}>{msg.m}</Alert> : undefined}</Snackbar>
    </Box>
  );
}
