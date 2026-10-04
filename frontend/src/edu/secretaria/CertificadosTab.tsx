import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Snackbar, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import EduResourcePage from "../EduResourcePage";
import { Empty, Feedback, StatCard, Status, StudentSearch, fetchHtml, fmtDate, fmtDateTime, itemsOf, label, useHtmlPreview, useLoad } from "./util";

const TIPOS = ["CURSO", "EXTENSAO", "EVENTO", "POS_GRADUACAO", "MONITORIA", "PARTICIPACAO"];

function useModelos() {
  const r = useLoad<any>("/secretaria/cert-modelos?pageSize=100&ativo=true");
  return { ...r, lista: itemsOf(r.data) };
}

function Emitidos({ show, toast }: { show: ReturnType<typeof useHtmlPreview>["show"]; toast: (t: "success" | "error", m: string) => void }) {
  const [f, setF] = useState({ q: "", status: "" });
  const lista = useLoad<any>(`/secretaria/certificados${qsOf({ pageSize: 40, q: f.q, status: f.status })}`);
  const [reemitir, setReemitir] = useState<any>(null);
  const [motivo, setMotivo] = useState("");
  const [nome, setNome] = useState("");
  async function revogar(c: any) {
    const m = window.prompt(`Revogar o certificado ${c.numero}? Informe o motivo (mín. 5 caracteres):`);
    if (!m) return;
    try { await eduApi.post(`/secretaria/certificados/${c.id}/revogar`, { motivo: m }); toast("success", "Certificado revogado."); lista.reload(); } catch (e: any) { toast("error", e.message); }
  }
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
      <Box sx={{ display: "flex", gap: 2, mb: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Certificados emitidos</Typography>
        <TextField size="small" placeholder="Buscar nome, nº, código, evento…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <TextField select size="small" label="Situação" sx={{ minWidth: 140 }} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <MenuItem value="">Todas</MenuItem>{["EMITIDO", "REVOGADO"].map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}
        </TextField>
      </Box>
      <Feedback loading={lista.loading} error={lista.error} onRetry={lista.reload} />
      {!lista.loading && !lista.error && !itemsOf(lista.data).length && <Empty>Nenhum certificado emitido.</Empty>}
      {itemsOf(lista.data).length > 0 && (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow>{["Nº", "Destinatário", "Evento/curso", "CH", "Emissão", "Código", "Situação", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {itemsOf(lista.data).map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>{c.numero}</TableCell><TableCell>{c.destinatarioNome}</TableCell><TableCell>{c.tituloEvento}</TableCell><TableCell>{c.cargaHoraria ?? "—"}</TableCell>
                  <TableCell>{fmtDate(c.emitidoEm)}</TableCell><TableCell><code>{c.codigo}</code></TableCell><TableCell><Status value={c.status} /></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <Button size="small" onClick={() => show(`Certificado ${c.numero}`, () => fetchHtml(`/secretaria/certificados/${c.id}/html`))}>Ver / imprimir</Button>
                    {c.status !== "REVOGADO" && <Button size="small" onClick={() => { setReemitir(c); setNome(c.destinatarioNome); setMotivo(""); }}>Reemitir</Button>}
                    {c.status !== "REVOGADO" && <Button size="small" color="error" onClick={() => revogar(c)}>Revogar</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      <Dialog open={!!reemitir} onClose={() => setReemitir(null)} fullWidth maxWidth="sm">
        <DialogTitle>Reemitir certificado {reemitir?.numero}</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <Alert severity="info">O certificado original será revogado e um novo será emitido com novo código.</Alert>
          <TextField size="small" label="Nome correto" value={nome} onChange={(e) => setNome(e.target.value)} />
          <TextField size="small" label="Motivo (mín. 5 caracteres)" required value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </DialogContent>
        <DialogActions><Button onClick={() => setReemitir(null)}>Cancelar</Button>
          <Button variant="contained" disabled={motivo.trim().length < 5} onClick={async () => { try { await eduApi.post(`/secretaria/certificados/${reemitir.id}/reemitir`, { motivo, nome: nome || undefined }); toast("success", "Certificado reemitido."); setReemitir(null); lista.reload(); } catch (e: any) { toast("error", e.message); } }}>Reemitir</Button></DialogActions>
      </Dialog>
    </Paper>
  );
}

function Emitir({ toast, show }: { toast: (t: "success" | "error", m: string) => void; show: ReturnType<typeof useHtmlPreview>["show"] }) {
  const modelos = useModelos();
  const [aluno, setAluno] = useState<any>(null);
  const [f, setF] = useState<any>({});
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function emitir() {
    try {
      const c: any = await eduApi.post("/secretaria/certificados", { modeloId: f.modeloId, studentId: aluno?.id, nome: aluno ? undefined : f.nome, cpf: f.cpf || undefined, tituloEvento: f.tituloEvento, cargaHoraria: f.cargaHoraria ? Number(f.cargaHoraria) : undefined, periodo: f.periodo || undefined });
      toast("success", `Certificado ${c.numero} emitido.`);
      show(`Certificado ${c.numero}`, () => fetchHtml(`/secretaria/certificados/${c.id}/html`));
    } catch (e: any) { toast("error", e.message); }
  }
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>Emitir certificado individual</Typography>
      <Feedback loading={modelos.loading} error={modelos.error} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <TextField select size="small" label="Modelo" required value={f.modeloId || ""} onChange={set("modeloId")}>{modelos.lista.map((m) => <MenuItem key={m.id} value={m.id}>{m.nome} ({label(m.tipo)})</MenuItem>)}</TextField>
        <TextField size="small" label="Título do evento/curso" required value={f.tituloEvento || ""} onChange={set("tituloEvento")} />
        <StudentSearch value={aluno} onChange={setAluno} labelText="Aluno (ou preencha o nome ao lado)" />
        <TextField size="small" label="Nome do participante (externo)" disabled={!!aluno} value={f.nome || ""} onChange={set("nome")} />
        <TextField size="small" label="CPF (opcional)" value={f.cpf || ""} onChange={set("cpf")} />
        <TextField size="small" label="Carga horária" type="number" value={f.cargaHoraria || ""} onChange={set("cargaHoraria")} />
        <TextField size="small" label="Período" value={f.periodo || ""} onChange={set("periodo")} />
      </Box>
      <Button sx={{ mt: 2 }} variant="contained" disabled={!f.modeloId || !f.tituloEvento || (!aluno && !f.nome)} onClick={emitir}>Emitir certificado</Button>
    </Paper>
  );
}

function Lote({ toast }: { toast: (t: "success" | "error", m: string) => void }) {
  const modelos = useModelos();
  const turmas = useLoad<any[]>("/academico/class-sections");
  const cursos = useLoad<any[]>("/academico/programs");
  const [f, setF] = useState<any>({ origem: "LISTA" });
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function emitir() {
    if (!window.confirm("Emitir o lote de certificados? Cada destinatário recebe um código único.")) return;
    setBusy(true); setRes(null);
    try {
      const destinatarios = f.origem === "LISTA" ? String(f.lista || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [nome, cpf] = l.split(/[;,\t]/).map((x) => x.trim()); return { nome, cpf: cpf || undefined }; }) : undefined;
      const r: any = await eduApi.post("/secretaria/certificados/lote", { modeloId: f.modeloId, nomeLote: f.nomeLote, tituloEvento: f.tituloEvento, cargaHoraria: f.cargaHoraria ? Number(f.cargaHoraria) : undefined, periodo: f.periodo || undefined, classSectionId: f.origem === "TURMA" ? f.classSectionId : undefined, programId: f.origem === "CURSO" ? f.programId : undefined, destinatarios });
      setRes(r); toast("success", `${r.emitidos?.length ?? 0} certificado(s) emitido(s).`);
    } catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  }
  const ok = f.modeloId && f.nomeLote && f.tituloEvento && ((f.origem === "LISTA" && f.lista) || (f.origem === "TURMA" && f.classSectionId) || (f.origem === "CURSO" && f.programId));
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>Emissão em lote</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <TextField select size="small" label="Modelo" required value={f.modeloId || ""} onChange={set("modeloId")}>{modelos.lista.map((m) => <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>)}</TextField>
        <TextField size="small" label="Nome do lote" required value={f.nomeLote || ""} onChange={set("nomeLote")} />
        <TextField size="small" label="Título do evento/curso" required value={f.tituloEvento || ""} onChange={set("tituloEvento")} />
        <TextField size="small" label="Carga horária" type="number" value={f.cargaHoraria || ""} onChange={set("cargaHoraria")} />
        <TextField size="small" label="Período" value={f.periodo || ""} onChange={set("periodo")} />
        <TextField select size="small" label="Destinatários" value={f.origem} onChange={set("origem")}>
          <MenuItem value="LISTA">Lista colada (nome;CPF)</MenuItem><MenuItem value="TURMA">Todos os alunos de uma turma</MenuItem><MenuItem value="CURSO">Concluintes de um curso</MenuItem>
        </TextField>
        {f.origem === "LISTA" && <TextField sx={{ gridColumn: { md: "1 / -1" } }} multiline minRows={5} label="Um por linha: Nome completo; CPF (opcional)" value={f.lista || ""} onChange={set("lista")} />}
        {f.origem === "TURMA" && <TextField select size="small" label="Turma" value={f.classSectionId || ""} onChange={set("classSectionId")}>{(turmas.data || []).map((t: any) => <MenuItem key={t.id} value={t.id}>{t.nome} — {t.discipline?.nome}</MenuItem>)}</TextField>}
        {f.origem === "CURSO" && <TextField select size="small" label="Curso" value={f.programId || ""} onChange={set("programId")}>{(cursos.data || []).map((t: any) => <MenuItem key={t.id} value={t.id}>{t.nome}</MenuItem>)}</TextField>}
      </Box>
      <Button sx={{ mt: 2 }} variant="contained" disabled={!ok || busy} onClick={emitir}>{busy ? "Emitindo…" : "Emitir lote"}</Button>
      {res && (
        <Box sx={{ mt: 2 }}>
          <Alert severity={res.erros?.length ? "warning" : "success"}>{res.emitidos?.length ?? 0} emitido(s), {res.erros?.length ?? 0} erro(s).</Alert>
          {(res.erros || []).map((e: any, i: number) => <Typography key={i} variant="body2" color="error">• {e.destinatario}: {e.erro}</Typography>)}
        </Box>
      )}
    </Paper>
  );
}

function Verificar() {
  const [codigo, setCodigo] = useState("");
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
  async function verificar() {
    setErr(null); setRes(null);
    try {
      const r = await fetch(`${API}/public/edu/secretaria/verificar/${encodeURIComponent(codigo.trim())}?formato=json`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || (r.status === 404 ? "Código não encontrado." : `Erro ${r.status}`));
      setRes(j);
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>Verificação de autenticidade</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Confira o código impresso em certificados, documentos e diplomas. A mesma consulta é pública para terceiros.</Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField size="small" fullWidth label="Código de verificação" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && codigo.trim() && verificar()} />
        <Button variant="contained" disabled={!codigo.trim()} onClick={verificar}>Verificar</Button>
      </Box>
      {err && <Alert severity="error" sx={{ mt: 2 }}>{err}</Alert>}
      {res && (
        <Alert severity={res.valido === false || res.status === "REVOGADO" ? "error" : "success"} sx={{ mt: 2 }}>
          <b>{res.valido === false ? "Documento inválido ou revogado" : "Documento autêntico"}</b>
          <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13 }}>{Object.entries(res).filter(([, v]) => v !== null && typeof v !== "object").map(([k, v]) => `${label(k)}: ${/(em|data|valid)/i.test(k) && /^\d{4}-/.test(String(v)) ? fmtDateTime(v) : String(v)}`).join("\n")}</pre>
        </Alert>
      )}
    </Paper>
  );
}

function Modelos({ show }: { show: ReturnType<typeof useHtmlPreview>["show"] }) {
  const [info, setInfo] = useState<string | null>(null);
  return (
    <EduResourcePage title="Modelos de certificado" base="/secretaria" resource="/cert-modelos" dense
      description={'Use variáveis entre chaves duplas no texto, ex.: {{nome}}, {{evento}}, {{cargaHoraria}}, {{periodo}}, {{data}}, {{instituicao}}.' + (info ? ` ${info}` : "")}
      columns={[{ key: "codigo", label: "Código" }, { key: "nome", label: "Nome" }, { key: "tipo", label: "Tipo" }, { key: "orientacao", label: "Orientação" }, { key: "ativo", label: "Ativo" },
        { key: "prev", label: "Prévia", render: (r) => <Button size="small" onClick={() => { setInfo(null); show(`Prévia — ${r.nome}`, () => fetchHtml(`/secretaria/cert-modelos/${r.id}/preview`, "POST", {})); }}>Pré-visualizar</Button> }]}
      fields={[{ key: "codigo", label: "Código", required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "tipo", label: "Tipo", type: "select", options: TIPOS, required: true }, { key: "titulo", label: "Título impresso" },
        { key: "orientacao", label: "Orientação", type: "select", options: ["landscape", "portrait"] }, { key: "texto", label: "Texto do certificado", type: "textarea", required: true, helper: "Ex.: Certificamos que {{nome}} participou de {{evento}} com carga horária de {{cargaHoraria}} horas." }, { key: "ativo", label: "Ativo", type: "bool" }]}
      filters={[{ key: "tipo", label: "Tipo", options: TIPOS }]} />
  );
}

export default function CertificadosTab() {
  const [tab, setTab] = useState(0);
  const { show, dialog } = useHtmlPreview();
  const [msg, setMsg] = useState<{ t: "success" | "error"; m: string } | null>(null);
  const toast = (t: "success" | "error", m: string) => setMsg({ t, m });
  const resumo = useLoad<any>("/secretaria/certificados?pageSize=1");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" } }}>
        <StatCard title="Certificados emitidos" value={resumo.data?.total ?? "—"} color="#0F5FDB" />
      </Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        {["Emitidos", "Emitir", "Lote", "Modelos", "Verificar autenticidade"].map((t) => <Tab key={t} label={t} />)}
      </Tabs>
      {tab === 0 && <Emitidos show={show} toast={toast} />}
      {tab === 1 && <Emitir toast={toast} show={show} />}
      {tab === 2 && <Lote toast={toast} />}
      {tab === 3 && <Modelos show={show} />}
      {tab === 4 && <Verificar />}
      {dialog}
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>{msg ? <Alert severity={msg.t} onClose={() => setMsg(null)}>{msg.m}</Alert> : undefined}</Snackbar>
    </Box>
  );
}
