import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Snackbar, Switch, TextField, Typography } from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import EduResourcePage from "../EduResourcePage";
import { Empty, Feedback, Progress, Status, StudentSearch, fmtDate, itemsOf, label, useLoad } from "./util";

function Item({ it, onChanged, toast }: { it: any; onChanged: () => void; toast: (t: "success" | "error", m: string) => void }) {
  const [texto, setTexto] = useState<string>(it.documentoTexto || "");
  const [dataDoc, setDataDoc] = useState<string>(it.dataDocumento ? String(it.dataDocumento).slice(0, 10) : "");
  const [motivo, setMotivo] = useState("");
  const [definitivo, setDefinitivo] = useState(false);
  const ia = it.analiseIa;
  async function run(fn: () => Promise<any>, ok: string) { try { await fn(); toast("success", ok); onChanged(); } catch (e: any) { toast("error", e.message); } }
  const salvar = () => eduApi.patch(`/secretaria/conferencias/itens/${it.id}`, { documentoTexto: texto || undefined, dataDocumento: dataDoc ? new Date(`${dataDoc}T12:00:00`).toISOString() : undefined });
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Typography sx={{ fontWeight: 800, flex: 1 }}>{it.titulo} {it.obrigatorio ? "" : <Chip size="small" label="opcional" />}</Typography>
        <Status value={it.status} />
      </Box>
      {it.requisitos && <Typography variant="caption" color="text.secondary">Requisitos: {it.requisitos}{it.validadeDias ? ` · validade ${it.validadeDias} dias` : ""}</Typography>}
      {it.arquivoNome && <Typography variant="body2">Arquivo: <b>{it.arquivoNome}</b></Typography>}
      {it.motivo && <Typography variant="body2" color="error.main">Motivo: {it.motivo}</Typography>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 180px" }, gap: 1, mt: 1 }}>
        <TextField size="small" multiline minRows={2} label="Texto/conteúdo do documento (para análise)" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <TextField size="small" type="date" label="Data do documento" value={dataDoc} onChange={(e) => setDataDoc(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      {ia && (
        <Alert severity={ia.parecer === "APROVADO" ? "success" : ia.parecer === "REJEITADO" ? "error" : "warning"} sx={{ mt: 1 }}>
          <b>Sugestão ({ia.modo === "IA" ? "IA" : "heurística"}): {label(ia.parecer)}</b> · validade {label(ia.validade)} · confiança {Math.round((ia.confianca ?? 0) * 100)}%
          {(ia.inconsistencias || []).map((x: string, i: number) => <div key={i}>• {x}</div>)}
          {ia.observacoes && <div>{ia.observacoes}</div>}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Button size="small" onClick={() => run(salvar, "Dados do item salvos.")}>Salvar</Button>
        <Button size="small" startIcon={<AutoAwesomeOutlinedIcon />} onClick={() => run(async () => { await salvar(); await eduApi.post(`/secretaria/conferencias/itens/${it.id}/analisar`, {}); }, "Análise concluída.")}>Analisar com IA</Button>
        <Button size="small" color="success" variant="contained" onClick={() => run(() => eduApi.post(`/secretaria/conferencias/itens/${it.id}/decidir`, { status: "APROVADO" }), "Item aprovado.")}>Aprovar</Button>
        <TextField size="small" placeholder="Motivo da rejeição" value={motivo} onChange={(e) => setMotivo(e.target.value)} sx={{ minWidth: 200 }} />
        <FormControlLabel control={<Switch size="small" checked={definitivo} onChange={(e) => setDefinitivo(e.target.checked)} />} label="Definitivo" />
        <Button size="small" color="error" variant="outlined" disabled={motivo.trim().length < 5} onClick={() => { if (window.confirm("Rejeitar este item?")) run(() => eduApi.post(`/secretaria/conferencias/itens/${it.id}/decidir`, { status: "REJEITADO", motivo, definitivo }), "Item rejeitado."); }}>Rejeitar</Button>
      </Box>
    </Paper>
  );
}

function Detalhe({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data: c, loading, error, reload } = useLoad<any>(id ? `/secretaria/conferencias/${id}` : null);
  const [msg, setMsg] = useState<{ t: "success" | "error"; m: string } | null>(null);
  const refresh = () => { reload(); onChanged(); };
  const r = c?.resumo;
  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{c?.titulo || "Conferência documental"} {c && <Status value={c.status} />}</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 1.5 }}>
        <Feedback loading={loading} error={error} onRetry={reload} />
        {c && (
          <>
            <Box>
              <Typography variant="body2">Aprovados: <b>{r?.aprovados ?? 0}</b> de <b>{r?.total ?? (c.itens || []).length}</b> ({r?.percentual ?? 0}%)</Typography>
              <Progress value={r?.percentual ?? 0} color={(r?.percentual ?? 0) >= 100 ? "success" : "primary"} />
            </Box>
            {(c.itens || []).length === 0 && <Empty>Sem itens neste checklist.</Empty>}
            {(c.itens || []).map((it: any) => <Item key={it.id} it={it} onChanged={refresh} toast={(t, m) => setMsg({ t, m })} />)}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={async () => { try { const x: any = await eduApi.post(`/secretaria/conferencias/${id}/solicitar-reenvio`, {}); setMsg({ t: "success", m: `${x.solicitados} item(ns) com reenvio solicitado ao aluno.` }); refresh(); } catch (e: any) { setMsg({ t: "error", m: e.message }); } }}>Solicitar reenvio ao aluno</Button>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>{msg ? <Alert severity={msg.t} onClose={() => setMsg(null)}>{msg.m}</Alert> : undefined}</Snackbar>
    </Dialog>
  );
}

function Nova({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const modelos = useLoad<any>(open ? "/secretaria/checklists?pageSize=100&ativo=true" : null);
  const [modeloId, setModeloId] = useState("");
  const [aluno, setAluno] = useState<any>(null);
  const [titulo, setTitulo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Nova conferência documental</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Feedback loading={modelos.loading} error={modelos.error} />
        <TextField select size="small" label="Modelo de checklist" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
          {itemsOf(modelos.data).map((m) => <MenuItem key={m.id} value={m.id}>{m.nome} ({m.processo})</MenuItem>)}
        </TextField>
        <StudentSearch value={aluno} onChange={setAluno} />
        <TextField size="small" label="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={!modeloId} onClick={async () => { try { const c: any = await eduApi.post("/secretaria/conferencias", { modeloId, studentId: aluno?.id, titulo: titulo || undefined }); onDone(c.id); } catch (e: any) { setErr(e.message); } }}>Criar</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ConferenciaTab() {
  const [status, setStatus] = useState("");
  const lista = useLoad<any>(`/secretaria/conferencias${qsOf({ pageSize: 50, status })}`);
  const [sel, setSel] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
        <Box sx={{ display: "flex", gap: 2, mb: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Análise de documentos (conferência)</Typography>
            <Typography variant="body2" color="text.secondary">Checklists por processo (matrícula, diploma, transferência…), com análise assistida por IA — a decisão final é sempre do analista.</Typography>
          </Box>
          <TextField select size="small" label="Situação" sx={{ minWidth: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <MenuItem value="">Todas</MenuItem>{["EM_ANDAMENTO", "PENDENTE", "APROVADA", "REPROVADA"].map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}
          </TextField>
          <Button variant="contained" onClick={() => setNova(true)}>Nova conferência</Button>
        </Box>
        <Feedback loading={lista.loading} error={lista.error} onRetry={lista.reload} />
        {!lista.loading && !lista.error && !itemsOf(lista.data).length && <Empty>Nenhuma conferência. Crie a primeira a partir de um modelo de checklist.</Empty>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 1.5 }}>
          {itemsOf(lista.data).map((c) => (
            <Paper key={c.id} variant="outlined" onClick={() => setSel(c.id)} sx={{ p: 1.5, borderRadius: 3, cursor: "pointer", "&:hover": { boxShadow: 3 } }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}><Typography sx={{ fontWeight: 800 }} noWrap>{c.titulo || label(c.processo)}</Typography><Status value={c.status} /></Box>
              <Typography variant="caption" color="text.secondary">{label(c.processo)} · {fmtDate(c.createdAt)}</Typography>
              <Box sx={{ mt: 1 }}><Progress value={c.resumo?.percentual ?? 0} color={(c.resumo?.percentual ?? 0) >= 100 ? "success" : "primary"} /></Box>
              <Typography variant="caption">{c.resumo?.aprovados ?? 0}/{c.resumo?.total ?? 0} itens aprovados</Typography>
            </Paper>
          ))}
        </Box>
      </Paper>
      <EduResourcePage title="Modelos de checklist" base="/secretaria" resource="/checklists" dense description="Modelos por processo; os itens ficam na tabela abaixo."
        columns={[{ key: "codigo", label: "Código" }, { key: "nome", label: "Nome" }, { key: "processo", label: "Processo" }, { key: "itens", label: "Itens", render: (r) => (r.itens || []).length }, { key: "ativo", label: "Ativo" }]}
        fields={[{ key: "codigo", label: "Código", required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "processo", label: "Processo (ex.: MATRICULA, DIPLOMA)", required: true, createOnly: true }, { key: "descricao", label: "Descrição", type: "textarea" }, { key: "ativo", label: "Ativo", type: "bool" }]} />
      <EduResourcePage title="Itens dos checklists" base="/secretaria" resource="/checklist-itens" dense
        columns={[{ key: "ordem", label: "Ordem" }, { key: "titulo", label: "Documento exigido" }, { key: "obrigatorio", label: "Obrigatório" }, { key: "validadeDias", label: "Validade (dias)" }, { key: "modeloId", label: "Modelo (ID)" }]}
        fields={[{ key: "modeloId", label: "ID do modelo de checklist", required: true, createOnly: true, helper: "Copie o ID na lista de modelos" }, { key: "ordem", label: "Ordem", type: "number" }, { key: "titulo", label: "Título", required: true }, { key: "obrigatorio", label: "Obrigatório", type: "bool" }, { key: "validadeDias", label: "Validade (dias)", type: "number" }, { key: "requisitos", label: "Requisitos de conferência", type: "textarea" }]} />
      <Nova open={nova} onClose={() => setNova(false)} onDone={(id) => { setNova(false); lista.reload(); setSel(id); }} />
      <Detalhe id={sel} onClose={() => setSel(null)} onChanged={lista.reload} />
    </Box>
  );
}
