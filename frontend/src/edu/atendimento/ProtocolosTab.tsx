import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import { useState } from "react";
import { A, ActionsMenu, Campo, DataList, FormDialog, LoadBox, Pick, Section, StatusChip, ROTULO_STATUS, abrirArquivo, call, fmtDate, fmtDateTime, itemsOf, lerArquivo, opts, useApi, useReload, useRunner, useToast, type Col } from "./kit";

const ST = ["ABERTO", "EM_ANDAMENTO", "PENDENTE_SOLICITANTE", "CONCLUIDO", "INDEFERIDO", "CANCELADO"];

export default function ProtocolosTab() {
  const [sub, setSub] = useState<"lista" | "config">("lista");
  return (
    <>
      <Tabs value={sub} onChange={(_, v) => setSub(v)} sx={{ mb: 1 }}><Tab value="lista" label="Protocolos" /><Tab value="config" label="Visibilidade das etapas" /></Tabs>
      {sub === "lista" ? <Lista /> : <ConfigEtapas />}
    </>
  );
}

function Lista() {
  const { rev, reload } = useReload();
  const [f, setF] = useState({ status: "ABERTOS", q: "", atrasados: "" });
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const { toast, node } = useToast();
  const qs = `page=${page}&pageSize=20&status=${f.status}&q=${encodeURIComponent(f.q)}&atrasados=${f.atrasados}`;
  const l = useApi<any>(`${A}/protocolos?${qs}`, [rev]);
  const sv = useApi<any>(`${A}/servicos`);
  const cols: Col[] = [
    { label: "Protocolo", primary: true, render: (p) => <><b>{p.numero}</b><Typography variant="caption" component="div" color="text.secondary">{p.servicoNome}</Typography></> },
    { label: "Solicitante", render: (p) => p.solicitanteNome }, { label: "Etapa", hideOnMobile: true, render: (p) => p.etapaAtualCodigo ?? "—" },
    { label: "Prazo", render: (p) => <span style={{ color: p.atrasado ? "#d64545" : undefined, fontWeight: p.atrasado ? 700 : 400 }}>{fmtDate(p.prazoEm)}{p.atrasado ? " (atrasado)" : ""}</span> },
    { label: "Pendências", hideOnMobile: true, render: (p) => p.pendenciasAbertas || "—" }, { label: "Situação", render: (p) => <StatusChip s={p.status} /> },
  ];
  return (
    <Section title="Protocolos e jornada" actions={<Button variant="contained" onClick={() => setNovo(true)}>Novo protocolo</Button>}>
      {node}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <TextField size="small" label="Buscar nº, código, nome ou serviço" value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(1); }} sx={{ flex: "1 1 200px" }} />
        <Pick label="Situação" value={f.status} onChange={(v) => setF({ ...f, status: v })} all="Todas" minWidth={170} options={[{ value: "ABERTOS", label: "Em aberto" }, ...opts(ST, ROTULO_STATUS)]} />
        <FormControlLabel control={<Checkbox checked={f.atrasados === "1"} onChange={(e) => setF({ ...f, atrasados: e.target.checked ? "1" : "" })} />} label="Só atrasados" />
      </Box>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhum protocolo." onRetry={l.reload}>
        <DataList rows={itemsOf(l.data)} columns={cols} onRowClick={(p) => setSel(p.id)} />
        <Box sx={{ display: "flex", gap: 1, mt: 2, justifyContent: "flex-end", alignItems: "center" }}><Button size="small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><Typography variant="caption">Página {page}</Typography><Button size="small" disabled={page * 20 >= (l.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Próxima</Button></Box>
      </LoadBox>
      {sel && <Detalhe id={sel} onClose={() => setSel(null)} onChanged={reload} />}
      <FormDialog open={novo} title="Novo protocolo" submitLabel="Abrir protocolo" onClose={() => setNovo(false)}
        fields={[{ key: "servicoId", label: "Serviço", type: "select", required: true, options: itemsOf(sv.data).filter((s: any) => s.ativo).map((s: any) => ({ value: s.id, label: s.nome })) }, { key: "studentId", label: "Aluno", type: "student" }, { key: "solicitanteNome", label: "Nome (se não for aluno)" }, { key: "solicitanteEmail", label: "E-mail para notificações" }, { key: "solicitanteTelefone", label: "Telefone/WhatsApp" }, { key: "descricao", label: "Descrição", type: "textarea" }]}
        onSubmit={async (b) => { const p = await call("POST", `${A}/protocolos`, b); reload(); setSel(p.id); toast({ type: "success", text: `Protocolo ${p.numero} aberto. Código de rastreio: ${p.codigoRastreio}` }); }} />
    </Section>
  );
}

function Detalhe({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { rev, reload } = useReload();
  const d = useApi<any>(`${A}/protocolos/${id}`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => { reload(); onChanged(); });
  const [dlg, setDlg] = useState<null | "pend" | "coment" | "concluir" | "cancelar" | "rejeitar">(null);
  const [docRej, setDocRej] = useState<any>(null);
  const p = d.data;
  const aberto = p && ["ABERTO", "EM_ANDAMENTO", "PENDENTE_SOLICITANTE"].includes(p.status);
  async function enviar(doc: any, file: File) {
    try { const dataUrl = await lerArquivo(file); await run(() => call("POST", `${A}/protocolos/${id}/documentos`, { docId: doc?.id, titulo: doc ? undefined : file.name, arquivoNome: file.name, dataUrl, origem: "BALCAO" }), "Documento recebido."); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{p ? `Protocolo ${p.numero} — ${p.servicoNome}` : "Protocolo"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {p && <>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1 }}>
              <StatusChip s={p.status} />
              <Chip size="small" variant="outlined" label={`Código de rastreio: ${p.codigoRastreio}`} onClick={() => navigator.clipboard?.writeText(p.linkRastreio || p.codigoRastreio)} />
              <Typography variant="caption" color="text.secondary">Solicitante: {p.aluno ? `${p.aluno.nomeCompleto} (RA ${p.aluno.ra})` : p.solicitanteNome} · Prazo: {fmtDate(p.prazoEm)}{p.atrasado ? " (ATRASADO)" : ""}</Typography>
            </Box>
            {p.taxaStatus !== "ISENTA" && <Alert severity={p.taxaStatus === "PAGA" ? "success" : "warning"} sx={{ mb: 1 }} action={p.taxaStatus === "PENDENTE" ? <><Button color="inherit" size="small" onClick={() => run(() => call("POST", `${A}/protocolos/${id}/sincronizar-taxa`), "Situação do pagamento atualizada.")}>Verificar pagamento</Button><Button color="inherit" size="small" onClick={() => { const m = window.prompt("Motivo da isenção da taxa:"); if (m) void run(() => call("POST", `${A}/protocolos/${id}/isentar-taxa`, { motivo: m }), "Taxa isentada."); }}>Isentar</Button></> : undefined}>Taxa de R$ {Number(p.taxaValor).toFixed(2).replace(".", ",")}: {p.taxaStatus}</Alert>}
            <LinearProgress variant="determinate" value={p.progresso} sx={{ height: 8, borderRadius: 4, mb: 1.5 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>Jornada (visão interna)</Typography>
            <Box sx={{ mb: 2 }}>
              {p.etapas.map((e: any) => (
                <Box key={e.id} sx={{ display: "flex", gap: 1.2, py: 0.7, alignItems: "flex-start", borderLeft: 2, borderColor: e.status === "CONCLUIDA" ? "success.main" : e.status === "EM_ANDAMENTO" ? "primary.main" : "divider", pl: 1.5, ml: 0.5 }}>
                  {e.status === "CONCLUIDA" ? <CheckCircleIcon color="success" fontSize="small" /> : e.status === "EM_ANDAMENTO" ? <PlayCircleIcon color="primary" fontSize="small" /> : <RadioButtonUncheckedIcon fontSize="small" color="disabled" />}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: e.status === "EM_ANDAMENTO" ? 800 : 500 }}>{e.nome} {e.atrasada && <Chip size="small" color="error" label="atrasada" />}</Typography>
                    <Typography variant="caption" color="text.secondary">{e.setor ?? "—"} · resp.: {e.responsavel ?? "—"} · prazo {fmtDate(e.prazoEm)}{e.concluidaEm ? ` · concluída ${fmtDateTime(e.concluidaEm)}` : ""}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
            {aberto && <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              <Button variant="contained" size="small" onClick={() => run(() => call("POST", `${A}/protocolos/${id}/avancar`, {}), "Etapa concluída.")}>Concluir etapa e avançar</Button>
              <Button size="small" variant="outlined" onClick={() => setDlg("pend")}>Registrar pendência</Button>
              <Button size="small" variant="outlined" onClick={() => setDlg("coment")}>Comentário</Button>
              <Button size="small" color="success" variant="outlined" onClick={() => setDlg("concluir")}>Deferir/Indeferir</Button>
              <Button size="small" color="error" onClick={() => setDlg("cancelar")}>Cancelar</Button>
            </Box>}
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Documentos (checklist)</Typography>
            {p.documentos.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Este serviço não exige documentos.</Typography>}
            {p.documentos.map((x: any) => (
              <Paper key={x.id} variant="outlined" sx={{ p: 1, my: 0.7, borderRadius: 2, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Box sx={{ flex: 1, minWidth: 180 }}><b>{x.titulo}</b> {x.obrigatorio ? <Chip size="small" label="obrigatório" /> : <Chip size="small" variant="outlined" label="opcional" />}
                  <Typography variant="caption" component="div" color="text.secondary">{x.arquivoNome ? `${x.arquivoNome} · ${x.origem ?? ""} · ${fmtDateTime(x.recebidoEm)}` : "Não recebido"}{x.motivo ? ` · Motivo: ${x.motivo}` : ""}</Typography></Box>
                <StatusChip s={x.status} />
                {aberto && x.status !== "APROVADO" && <Button size="small" component="label">{x.status === "PENDENTE" ? "Receber" : "Substituir"}<input hidden type="file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void enviar(x, f); }} /></Button>}
                {aberto && ["RECEBIDO", "REJEITADO"].includes(x.status) && x.arquivoNome && <ActionsMenu items={[
                  { label: "Baixar", onClick: () => run(() => abrirArquivo(`${A}/documentos/${x.id}/download`, x.arquivoNome, false), "Download iniciado.") },
                  { label: "Aprovar", onClick: () => run(() => call("POST", `${A}/documentos/${x.id}/conferir`, { decisao: "APROVAR" }), "Documento aprovado.") },
                  { label: "Rejeitar (gera pendência)", color: "error", onClick: () => { setDocRej(x); setDlg("rejeitar"); } },
                ]} />}
              </Paper>
            ))}
            {aberto && <Button size="small" component="label" sx={{ mb: 1 }}>Receber documento avulso<input hidden type="file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void enviar(null, f); }} /></Button>}
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Pendências com prazo</Typography>
            {p.pendencias.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma.</Typography> : p.pendencias.map((x: any) => (
              <Alert key={x.id} sx={{ my: 0.6 }} severity={x.status === "ATENDIDA" ? "success" : x.status === "VENCIDA" ? "error" : "warning"} action={["ABERTA", "VENCIDA"].includes(x.status) ? <Button color="inherit" size="small" onClick={() => run(() => call("POST", `${A}/pendencias/${x.id}/resolver`), "Pendência resolvida.")}>Resolver</Button> : undefined}>{x.descricao} — prazo {fmtDate(x.prazoEm)} ({x.status})</Alert>
            ))}
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1.5 }}>Linha do tempo e notificações</Typography>
            {p.eventos.slice().reverse().map((e: any) => <Typography key={e.id} variant="body2" sx={{ py: 0.3 }}>{fmtDateTime(e.createdAt)} · <b>{e.titulo}</b>{e.descricao ? ` — ${e.descricao}` : ""} <Typography component="span" variant="caption" color="text.secondary">({e.visivelSolicitante ? "visível ao solicitante" : "interno"}{e.usuarioNome ? ` · ${e.usuarioNome}` : ""})</Typography></Typography>)}
            {p.notificacoes.length > 0 && <Box sx={{ mt: 1 }}>{p.notificacoes.map((n: any) => <Typography key={n.id} variant="caption" component="div" color="text.secondary">✉ {fmtDateTime(n.createdAt)} · {n.canal} {n.destino ?? ""} · {n.status.replace(/_/g, " ")}{n.motivo ? ` (${n.motivo})` : ""}</Typography>)}</Box>}
          </>}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      <FormDialog open={dlg === "pend"} title="Registrar pendência" onClose={() => setDlg(null)} fields={[{ key: "descricao", label: "O que falta?", type: "textarea", required: true }, { key: "tipo", label: "Tipo", type: "select", options: opts(["INFORMACAO", "DOCUMENTO", "PAGAMENTO"]) }, { key: "prazoDias", label: "Prazo (dias úteis)", type: "number" }]} initial={{ tipo: "INFORMACAO", prazoDias: 5 }} onSubmit={async (b) => { await call("POST", `${A}/protocolos/${id}/pendencias`, b); reload(); onChanged(); }} />
      <FormDialog open={dlg === "coment"} title="Comentário" onClose={() => setDlg(null)} fields={[{ key: "texto", label: "Texto", type: "textarea", required: true }, { key: "visivelSolicitante", label: "Visível ao solicitante", type: "bool" }]} onSubmit={async (b) => { await call("POST", `${A}/protocolos/${id}/comentario`, b); reload(); }} />
      <FormDialog open={dlg === "concluir"} title="Decisão final" onClose={() => setDlg(null)} intro={<Alert severity="info" sx={{ mb: 2 }}>Deferir conclui todas as etapas e aplica o efeito do serviço (ex.: emitir documento, trancar matrícula).</Alert>} fields={[{ key: "decisao", label: "Decisão", type: "select", required: true, options: [{ value: "DEFERIDO", label: "Deferido (concluir)" }, { value: "INDEFERIDO", label: "Indeferido" }] }, { key: "motivo", label: "Motivo / observação", type: "textarea" }]} onSubmit={async (b) => { await call("POST", `${A}/protocolos/${id}/concluir`, b); reload(); onChanged(); }} />
      <FormDialog open={dlg === "cancelar"} title="Cancelar protocolo" onClose={() => setDlg(null)} fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }]} onSubmit={async (b) => { await call("POST", `${A}/protocolos/${id}/cancelar`, b); reload(); onChanged(); }} />
      <FormDialog open={dlg === "rejeitar"} title={`Rejeitar: ${docRej?.titulo ?? ""}`} onClose={() => setDlg(null)} fields={[{ key: "motivo", label: "Motivo (o solicitante verá)", type: "textarea", required: true }, { key: "prazoDias", label: "Prazo para reenvio (dias úteis)", type: "number" }]} initial={{ prazoDias: 5 }} onSubmit={async (b) => { await call("POST", `${A}/documentos/${docRej.id}/conferir`, { decisao: "REJEITAR", ...b }); reload(); onChanged(); }} />
    </Dialog>
  );
}

function ConfigEtapas() {
  const { rev, reload } = useReload();
  const c = useApi<any>(`${A}/etapas-config`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, reload);
  const rows: any[] = itemsOf(c.data);
  const salvar = (e: any, patch: any) => run(() => call("PUT", `${A}/etapas-config`, { etapas: [{ codigo: e.codigo, nome: e.nome, visivelSolicitante: e.visivelSolicitante, mensagemPublica: e.mensagemPublica ?? null, notificar: e.notificar, ordem: e.ordem, ...patch }] }), "Configuração salva.");
  return (
    <Section title="Quais etapas o solicitante enxerga?">
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>Etapas ocultas continuam existindo para a equipe, mas não aparecem no portal, na página pública de rastreio nem geram notificação ao solicitante. Você também pode renomear a etapa e definir uma mensagem pública.</Alert>
      <LoadBox loading={c.loading} error={c.error} empty={!rows.length} emptyText="Abra o catálogo de serviços para criar os padrões." onRetry={c.reload}>
        {rows.map((e) => (
          <Paper key={e.id} variant="outlined" sx={{ p: 1.5, my: 1, borderRadius: 3, display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", md: "1.2fr 1.6fr auto auto" }, alignItems: "center" }}>
            <Box><Typography sx={{ fontWeight: 800 }}>{e.nome}</Typography><Typography variant="caption" color="text.secondary">{e.codigo}</Typography></Box>
            <TextField size="small" label="Mensagem pública" defaultValue={e.mensagemPublica ?? ""} onBlur={(ev) => { if ((ev.target.value || null) !== (e.mensagemPublica ?? null)) void salvar(e, { mensagemPublica: ev.target.value || null }); }} />
            <FormControlLabel control={<Checkbox checked={e.visivelSolicitante} onChange={(ev) => salvar(e, { visivelSolicitante: ev.target.checked })} />} label="Visível" />
            <FormControlLabel control={<Checkbox checked={e.notificar} disabled={!e.visivelSolicitante} onChange={(ev) => salvar(e, { notificar: ev.target.checked })} />} label="Notificar" />
          </Paper>
        ))}
      </LoadBox>
    </Section>
  );
}
void Campo;
