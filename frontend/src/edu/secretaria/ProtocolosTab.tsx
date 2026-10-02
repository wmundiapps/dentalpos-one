import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, Paper, Snackbar, Switch, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import EduResourcePage from "../EduResourcePage";
import { Empty, Feedback, Status, StatCard, StatGrid, StudentSearch, fmtDate, fmtDateTime, itemsOf, label, useLoad } from "./util";

const COLUNAS: Array<{ key: string; titulo: string; statuses: string[]; cor: string }> = [
  { key: "novos", titulo: "Abertos", statuses: ["ABERTO"], cor: "#0F5FDB" },
  { key: "analise", titulo: "Em análise", statuses: ["EM_ANALISE"], cor: "#ED6C02" },
  { key: "pend", titulo: "Aguardando documento", statuses: ["PENDENTE_DOCUMENTO"], cor: "#9C27B0" },
  { key: "dec", titulo: "Deferidos / Indeferidos", statuses: ["DEFERIDO", "INDEFERIDO"], cor: "#2E7D32" },
  { key: "fim", titulo: "Concluídos", statuses: ["CONCLUIDO", "CANCELADO"], cor: "#607D8B" },
];

const SLA_COR: Record<string, "default" | "success" | "warning" | "error"> = { OK: "success", VENCENDO: "warning", ATRASADO: "error" };

function slaChip(p: any) {
  const s = p.sla;
  const v = typeof s === "string" ? s : s?.nivel;
  if (!v || (v === "OK" && s?.diasRestantes == null)) return null;
  return <Chip size="small" color={SLA_COR[String(v).toUpperCase()] || "default"} label={v === "ATRASADO" ? `Atrasado ${Math.abs(s?.diasRestantes ?? 0)}d` : v === "VENCENDO" ? "Vence em breve" : `${s?.diasRestantes ?? ""}d restantes`} />;
}

function Resumo() {
  const { data, error, loading } = useLoad<any>("/secretaria/protocolos-resumo");
  if (loading || error) return <Feedback loading={loading} error={error} />;
  if (!data) return null;
  return (
    <StatGrid>
      <StatCard title="Atrasados" value={data.atrasados ?? 0} color="#D32F2F" hint="Fora do prazo (SLA)" />
      <StatCard title="Vencem em 2 dias" value={data.vencendoEm2Dias ?? 0} color="#ED6C02" />
      <StatCard title="Sem responsável" value={data.semResponsavel ?? 0} color="#9C27B0" />
      <StatCard title="Concluídos (30 dias)" value={data.concluidos30d ?? 0} color="#2E7D32" hint={data.tempoMedioDias != null ? `Tempo médio ${data.tempoMedioDias} dias · ${data.percentualNoPrazo ?? "—"}% no prazo` : undefined} />
    </StatGrid>
  );
}

function NovoProtocolo({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const tipos = useLoad<any>(open ? "/secretaria/tipos?pageSize=100&ativo=true" : null);
  const [aluno, setAluno] = useState<any>(null);
  const [f, setF] = useState<any>({ prioridade: "NORMAL", canal: "BALCAO" });
  const [err, setErr] = useState<string | null>(null);
  async function salvar() {
    setErr(null);
    try {
      await eduApi.post("/secretaria/protocolos", { tipoId: f.tipoId, studentId: aluno?.id, solicitanteNome: f.solicitanteNome || undefined, assunto: f.assunto || undefined, descricao: f.descricao || undefined, prioridade: f.prioridade, canal: f.canal });
      setAluno(null); setF({ prioridade: "NORMAL", canal: "BALCAO" });
      onDone("Protocolo aberto.");
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Novo requerimento / protocolo</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Feedback loading={tipos.loading} error={tipos.error} />
        <TextField select size="small" label="Tipo de requerimento" required value={f.tipoId || ""} onChange={(e) => setF({ ...f, tipoId: e.target.value })}>
          {itemsOf(tipos.data).map((t) => <MenuItem key={t.id} value={t.id}>{t.nome} {t.taxa > 0 ? `· taxa R$ ${t.taxa}` : ""} · SLA {t.slaDias}d</MenuItem>)}
        </TextField>
        <StudentSearch value={aluno} onChange={setAluno} />
        {!aluno && <TextField size="small" label="Nome do solicitante (se não for aluno)" value={f.solicitanteNome || ""} onChange={(e) => setF({ ...f, solicitanteNome: e.target.value })} />}
        <TextField size="small" label="Assunto" value={f.assunto || ""} onChange={(e) => setF({ ...f, assunto: e.target.value })} />
        <TextField size="small" label="Descrição" multiline minRows={3} value={f.descricao || ""} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <TextField select size="small" label="Prioridade" value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value })}>
            {["BAIXA", "NORMAL", "ALTA", "URGENTE"].map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Canal" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}>
            {["BALCAO", "PORTAL", "EMAIL", "TELEFONE"].map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}
          </TextField>
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!f.tipoId} onClick={salvar}>Abrir protocolo</Button></DialogActions>
    </Dialog>
  );
}

function Detalhe({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data: p, loading, error, reload } = useLoad<any>(id ? `/secretaria/protocolos/${id}` : null);
  const [para, setPara] = useState("EM_ANALISE");
  const [parecer, setParecer] = useState("");
  const [visivel, setVisivel] = useState(true);
  const [coment, setComent] = useState("");
  const [resp, setResp] = useState("");
  const [msg, setMsg] = useState<{ t: "success" | "error"; m: string } | null>(null);

  async function run(fn: () => Promise<any>, ok: string, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    try { await fn(); setMsg({ t: "success", m: ok }); await reload(); onChanged(); } catch (e: any) { setMsg({ t: "error", m: e.message }); }
  }
  const final = p && ["CONCLUIDO", "CANCELADO"].includes(p.status);
  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Protocolo {p?.numero || ""} {p && <Status value={p.status} />}</DialogTitle>
      <DialogContent dividers>
        <Feedback loading={loading} error={error} onRetry={reload} />
        {p && (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
              <Typography><b>Tipo:</b> {p.tipo?.nome}</Typography>
              <Typography><b>Solicitante:</b> {p.solicitanteNome || p.studentId || "—"}</Typography>
              <Typography><b>Assunto:</b> {p.assunto}</Typography>
              <Typography><b>Prazo:</b> {fmtDate(p.prazoEm)} {slaChip(p)}</Typography>
              <Typography><b>Canal / prioridade:</b> {p.canal} · {p.prioridade}</Typography>
              <Typography><b>Taxa:</b> {p.taxaValor > 0 ? `R$ ${p.taxaValor} (${label(p.taxaStatus)})` : "Isenta"}</Typography>
              {p.documentoCodigo && <Typography><b>Documento gerado:</b> {p.documentoCodigo}</Typography>}
            </Box>
            {p.descricao && <Paper variant="outlined" sx={{ p: 1.5 }}><Typography variant="body2">{p.descricao}</Typography></Paper>}
            {(p.anexos || []).length > 0 && <Box><Typography variant="subtitle2">Anexos</Typography>{p.anexos.map((a: any) => <Chip key={a.id} sx={{ mr: 0.5, mt: 0.5 }} size="small" label={`${a.nome}${a.enviadoPorAluno ? " (aluno)" : ""}`} />)}</Box>}
            <Divider />
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Linha do tempo</Typography>
            {(p.tramites || []).length === 0 && <Empty>Sem trâmites.</Empty>}
            {(p.tramites || []).map((t: any) => (
              <Box key={t.id} sx={{ pl: 1.5, borderLeft: "3px solid", borderColor: "primary.main" }}>
                <Typography variant="body2"><b>{label(t.acao)}</b>{t.paraStatus ? ` → ${label(t.paraStatus)}` : ""} · <span style={{ opacity: .7 }}>{fmtDateTime(t.createdAt)}{t.usuarioNome ? ` · ${t.usuarioNome}` : ""}</span></Typography>
                {t.parecer && <Typography variant="body2" color="text.secondary">{t.parecer}</Typography>}
              </Box>
            ))}
            {!final && (
              <>
                <Divider />
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Ações do fluxo</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "200px 1fr auto" }, gap: 1, alignItems: "center" }}>
                  <TextField select size="small" label="Mover para" value={para} onChange={(e) => setPara(e.target.value)}>
                    {["EM_ANALISE", "PENDENTE_DOCUMENTO", "DEFERIDO", "INDEFERIDO", "CONCLUIDO", "CANCELADO"].map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}
                  </TextField>
                  <TextField size="small" label="Parecer" value={parecer} onChange={(e) => setParecer(e.target.value)} />
                  <Button variant="contained" onClick={() => run(() => eduApi.post(`/secretaria/protocolos/${p.id}/status`, { para, parecer: parecer || undefined, visivelAluno: visivel }), "Status atualizado.", ["INDEFERIDO", "CANCELADO"].includes(para) ? `Confirmar ${label(para).toLowerCase()} do protocolo?` : undefined)}>Aplicar</Button>
                </Box>
                <FormControlLabel control={<Switch checked={visivel} onChange={(e) => setVisivel(e.target.checked)} />} label="Parecer visível ao aluno" />
                <Box sx={{ display: "flex", gap: 1 }}>
                  <TextField size="small" fullWidth label="Comentário interno" value={coment} onChange={(e) => setComent(e.target.value)} />
                  <Button disabled={!coment.trim()} onClick={() => run(async () => { await eduApi.post(`/secretaria/protocolos/${p.id}/comentarios`, { texto: coment, visivelAluno: false }); setComent(""); }, "Comentário registrado.")}>Comentar</Button>
                </Box>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <TextField size="small" fullWidth label="ID do usuário responsável" value={resp} onChange={(e) => setResp(e.target.value)} helperText={p.responsavelId ? `Atual: ${p.responsavelId}` : "Sem responsável"} />
                  <Button disabled={!resp.trim()} onClick={() => run(async () => { await eduApi.post(`/secretaria/protocolos/${p.id}/atribuir`, { responsavelId: resp.trim() }); setResp(""); }, "Responsável atribuído.")}>Atribuir</Button>
                </Box>
                {p.taxaStatus === "PENDENTE" && <Button color="warning" onClick={() => { const motivo = window.prompt("Motivo da isenção da taxa (mín. 5 caracteres):"); if (motivo) run(() => eduApi.post(`/secretaria/protocolos/${p.id}/taxa/isentar`, { motivo }), "Taxa isentada."); }}>Isentar taxa</Button>}
              </>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>{msg ? <Alert severity={msg.t} onClose={() => setMsg(null)}>{msg.m}</Alert> : undefined}</Snackbar>
    </Dialog>
  );
}

export default function ProtocolosTab() {
  const [filtros, setFiltros] = useState<{ q: string; atrasados: boolean; minhas: boolean }>({ q: "", atrasados: false, minhas: false });
  const { data, loading, error, reload } = useLoad<any>(`/secretaria/protocolos${qsOf({ pageSize: 100, q: filtros.q, atrasados: filtros.atrasados || undefined, minhas: filtros.minhas || undefined })}`);
  const [novo, setNovo] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const rows = itemsOf(data);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Resumo />
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 4 }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Funil de requerimentos</Typography>
          <TextField size="small" placeholder="Buscar nº, assunto, solicitante…" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} />
          <FormControlLabel control={<Switch checked={filtros.atrasados} onChange={(e) => setFiltros({ ...filtros, atrasados: e.target.checked })} />} label="Só atrasados" />
          <FormControlLabel control={<Switch checked={filtros.minhas} onChange={(e) => setFiltros({ ...filtros, minhas: e.target.checked })} />} label="Meus" />
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo protocolo</Button>
        </Box>
        <Feedback loading={loading} error={error} onRetry={reload} />
        {!loading && !error && rows.length === 0 && <Empty>Nenhum protocolo encontrado.</Empty>}
        {rows.length > 0 && (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(5, minmax(0,1fr))" }, gap: 1.5, alignItems: "start" }}>
            {COLUNAS.map((c) => {
              const col = rows.filter((r) => c.statuses.includes(r.status));
              return (
                <Box key={c.key} sx={{ bgcolor: "action.hover", borderRadius: 3, p: 1, borderTop: `4px solid ${c.cor}` }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, px: 0.5, pb: 1 }}>{c.titulo} <Chip size="small" label={col.length} /></Typography>
                  <Box sx={{ display: "grid", gap: 1, maxHeight: 520, overflow: "auto" }}>
                    {col.map((r) => (
                      <Paper key={r.id} variant="outlined" onClick={() => setSel(r.id)} sx={{ p: 1.25, borderRadius: 2, cursor: "pointer", "&:hover": { boxShadow: 3 } }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{r.numero} · {r.tipo?.nome}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{r.assunto}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{r.solicitanteNome || "Aluno"} · prazo {fmtDate(r.prazoEm)}</Typography>
                        <Box sx={{ mt: 0.5, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                          {slaChip(r)}
                          {r.prioridade !== "NORMAL" && <Chip size="small" variant="outlined" label={r.prioridade} />}
                          {r.status === "INDEFERIDO" && <Status value="INDEFERIDO" />}
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Paper>
      <EduResourcePage title="Tipos de requerimento" base="/secretaria" resource="/tipos" dense
        description="Catálogo de requerimentos: SLA, taxa, documento gerado e se o aluno pode abrir pelo portal."
        columns={[{ key: "codigo", label: "Código" }, { key: "nome", label: "Nome" }, { key: "categoria", label: "Categoria" }, { key: "slaDias", label: "SLA (dias)" }, { key: "taxa", label: "Taxa (R$)" }, { key: "abertoPeloAluno", label: "Portal" }, { key: "ativo", label: "Ativo" }]}
        fields={[
          { key: "codigo", label: "Código", required: true, createOnly: true }, { key: "nome", label: "Nome", required: true },
          { key: "categoria", label: "Categoria", type: "select", options: ["ACADEMICO", "DOCUMENTO", "FINANCEIRO", "DIPLOMA", "GERAL"] },
          { key: "slaDias", label: "SLA (dias)", type: "number" }, { key: "taxa", label: "Taxa (R$)", type: "number" },
          { key: "prazoReenvioDias", label: "Prazo de reenvio (dias)", type: "number" },
          { key: "geraDocumento", label: "Documento gerado na conclusão", type: "select", options: ["DECLARACAO_MATRICULA", "DECLARACAO_VINCULO", "HISTORICO_ESCOLAR", "COMPROVANTE_CONCLUSAO"] },
          { key: "responsavelRole", label: "Papel responsável", type: "select", options: ["SECRETARY", "COORDINATOR", "FINANCE"] },
          { key: "abertoPeloAluno", label: "Aberto pelo aluno (portal)", type: "bool" }, { key: "exigeAnexo", label: "Exige anexo", type: "bool" }, { key: "ativo", label: "Ativo", type: "bool" },
          { key: "descricao", label: "Descrição", type: "textarea" },
        ]}
        filters={[{ key: "categoria", label: "Categoria", options: ["ACADEMICO", "DOCUMENTO", "FINANCEIRO", "DIPLOMA", "GERAL"] }]} />
      <NovoProtocolo open={novo} onClose={() => setNovo(false)} onDone={(m) => { setNovo(false); setToast(m); reload(); }} />
      <Detalhe id={sel} onClose={() => setSel(null)} onChanged={reload} />
      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)}><Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert></Snackbar>
    </Box>
  );
}
