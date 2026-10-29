import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Pagination, Paper, Rating, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { readSessionUser } from "../../services/DemoAccess";
import {
  ActionsMenu, DataList, Foto, FormDialog, J, Kpi, KpiRow, LoadBox, ResourceTab, Section, Status, call, fmtDT, fmtDate, fmtMoney, itemsOf, label, opts, prepararFoto, qstr, useApi, useEspacos, usePessoas,
  useRunner, useToast, type FormField,
} from "./kit2";

const CATEGORIAS = ["ELETRICA", "HIDRAULICA", "TELHADO", "BANHEIRO", "JARDIM", "PINTURA", "CALCAMENTO", "EQUIPAMENTO", "MOBILIARIO", "LIMPEZA", "SEGURANCA", "TI", "OUTROS"];
const PRIOR = ["BAIXA", "MEDIA", "ALTA", "URGENTE"];
const GESTORES = ["ADMIN", "OWNER", "RECTOR", "BOARD", "FACILITIES"];
const LEITORES = [...GESTORES, "COORDINATOR", "FINANCE", "SUPPLIES", "SECRETARY", "SUPPORT", "STAFF"];
const role = () => String(readSessionUser()?.role || "").toUpperCase();

// ------------------------------------------------------------------ nova solicitação (celular / QR da sala)
function NovaSolicitacao({ qrToken, onDone, onClose }: { qrToken?: string; onDone: () => void; onClose: () => void }) {
  const [f, setF] = useState<Record<string, any>>({ tipo: "PROBLEMA", categoria: "OUTROS", prioridade: "MEDIA" });
  const [fotos, setFotos] = useState<Array<{ arquivoNome: string; mime: string; dataUrl: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qrNome, setQrNome] = useState<string | null>(null);
  const espacos = useEspacos();
  useEffect(() => { if (qrToken) call("GET", `${J}/qr/${qrToken}`).then((q: any) => { setQrNome(q.nome); setF((o) => ({ ...o, local: o.local || q.nome })); }).catch((e) => setErr(e.message)); }, [qrToken]);
  const set = (k: string, v: any) => setF((o) => ({ ...o, [k]: v }));
  async function addFotos(files: FileList | null) {
    if (!files) return; setErr(null);
    try { const novas: Array<{ arquivoNome: string; mime: string; dataUrl: string }> = []; for (const x of Array.from(files).slice(0, 6 - fotos.length)) novas.push(await prepararFoto(x)); setFotos((o) => [...o, ...novas].slice(0, 6)); } catch (e: any) { setErr(e.message); }
  }
  async function enviar() {
    setBusy(true); setErr(null);
    try {
      await call("POST", `${J}/solicitacoes`, { tipo: f.tipo, categoria: f.categoria, prioridade: f.prioridade, titulo: f.titulo, relatorio: f.relatorio, local: f.local || undefined, spaceId: f.spaceId || undefined, qrToken: qrToken || undefined, fotos });
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const ok = (f.titulo || "").length >= 3 && (f.relatorio || "").length >= 10;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>Nova solicitação de infraestrutura</DialogTitle>
      <DialogContent dividers>
        {qrNome && <Alert severity="success" sx={{ mb: 1.5 }}>Local identificado pelo QR: <b>{qrNome}</b></Alert>}
        {err && <Alert severity="error" sx={{ mb: 1.5 }}>{err}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
          <TextField select size="small" label="O que é?" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
            <MenuItem value="PROBLEMA">Problema (algo quebrado, vazando, sujo…)</MenuItem><MenuItem value="IMPLEMENTACAO">Implementação / melhoria</MenuItem>
          </TextField>
          <TextField select size="small" label="Categoria" value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>{CATEGORIAS.map((c) => <MenuItem key={c} value={c}>{label(c)}</MenuItem>)}</TextField>
          <TextField size="small" label="Título" required value={f.titulo || ""} onChange={(e) => set("titulo", e.target.value)} sx={{ gridColumn: "1 / -1" }} />
          <TextField size="small" label="Relatório (descreva o que aconteceu ou o que precisa)" required multiline minRows={4} value={f.relatorio || ""} onChange={(e) => set("relatorio", e.target.value)} helperText="Mínimo de 10 caracteres. Não inclua senhas nem dados pessoais de terceiros." sx={{ gridColumn: "1 / -1" }} />
          <TextField size="small" label="Local" value={f.local || ""} onChange={(e) => set("local", e.target.value)} />
          <TextField select size="small" label="Sala / espaço cadastrado" value={f.spaceId || ""} onChange={(e) => set("spaceId", e.target.value)}><MenuItem value="">—</MenuItem>{espacos.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
          <TextField select size="small" label="Urgência" value={f.prioridade} onChange={(e) => set("prioridade", e.target.value)}>{PRIOR.map((c) => <MenuItem key={c} value={c}>{label(c)}</MenuItem>)}</TextField>
        </Box>
        <Box sx={{ mt: 2 }}>
          <Button variant="outlined" component="label" disabled={fotos.length >= 6}>Tirar/anexar fotos ({fotos.length}/6)
            <input hidden type="file" accept="image/*" capture="environment" multiple onChange={(e) => { void addFotos(e.target.files); e.target.value = ""; }} />
          </Button>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
            {fotos.map((x, i) => (
              <Box key={i} sx={{ position: "relative" }}>
                <img src={x.dataUrl} alt={x.arquivoNome} style={{ height: 84, borderRadius: 8, border: "1px solid #ccc" }} />
                <Button size="small" color="error" sx={{ position: "absolute", top: 0, right: 0, minWidth: 0, p: 0.2, bgcolor: "rgba(255,255,255,.85)" }} aria-label="Remover foto" onClick={() => setFotos((o) => o.filter((_, j) => j !== i))}>✕</Button>
              </Box>
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary">As fotos passam por verificação de segurança antes de serem salvas.</Typography>
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!ok || busy} onClick={enviar}>{busy ? <CircularProgress size={18} /> : "Enviar solicitação"}</Button></DialogActions>
    </Dialog>
  );
}

// ------------------------------------------------------------------ detalhe
function Detalhe({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<"triagem" | "os" | "resolver" | "avaliar" | null>(null);
  const [txt, setTxt] = useState("");
  const [interno, setInterno] = useState(false);
  const { toast, node } = useToast();
  const pessoas = usePessoas();
  const d = useApi<any>(`${J}/solicitacoes/${id}`, [rev]);
  const after = () => { setRev((x) => x + 1); onChanged(); };
  const run = useRunner(toast, after);
  const s = d.data;
  const gestor = GESTORES.includes(role());
  const myId = readSessionUser()?.id;
  const dono = s && (s.solicitanteUserId === myId);
  const aberta = s && ["NOVA", "EM_TRIAGEM", "OS_GERADA", "EM_ANDAMENTO", "AGUARDANDO"].includes(s.status);
  async function addFoto(files: FileList | null) {
    if (!files?.length) return;
    await run(async () => { for (const x of Array.from(files).slice(0, 3)) await call("POST", `${J}/anexos-infra`, { refType: "Solicitacao", refId: id, ...(await prepararFoto(x)) }); }, "Foto(s) anexada(s).");
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>{s ? `${s.numero} — ${s.titulo}` : "Solicitação"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {s && (
            <>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
                <Status value={s.status} /><Chip size="small" label={label(s.tipo)} /><Chip size="small" label={label(s.categoria)} /><Chip size="small" label={`Urgência ${label(s.prioridade)}`} />
                {s.prazoVencido && <Chip size="small" color="error" label="Prazo vencido" />}
              </Box>
              <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{s.relatorio}</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 0.5, my: 1.5, fontSize: 14 }}>
                <span>Solicitante: <b>{s.solicitanteNome || "—"}</b></span><span>Local: <b>{s.local || "—"}</b></span>
                <span>Responsável: <b>{s.responsavelNome || "a definir"}</b></span><span>Prazo: <b>{fmtDate(s.prazo)}</b></span>
                <span>Custo estimado: <b>{fmtMoney(s.custoEstimado)}</b></span><span>Custo final: <b>{fmtMoney(s.custoFinal)}</b></span>
                <span>Aberta em: <b>{fmtDT(s.createdAt)}</b></span><span>Resolvida em: <b>{fmtDT(s.resolvidoEm)}</b></span>
                {s.avaliacaoNota != null && <span style={{ gridColumn: "1 / -1" }}>Avaliação do solicitante: <Rating readOnly size="small" value={s.avaliacaoNota} /> {s.avaliacaoComentario}</span>}
                {s.motivoRejeicao && <span style={{ gridColumn: "1 / -1" }}>Motivo da rejeição: <b>{s.motivoRejeicao}</b></span>}
              </Box>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>Fotos</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", my: 1, alignItems: "center" }}>
                {(s.fotos ?? []).length ? s.fotos.map((f: any) => <Foto key={f.id} id={f.id} nome={f.nome} />) : <Typography variant="caption" color="text.secondary">Sem fotos.</Typography>}
                {(dono || gestor) && aberta && <Button size="small" component="label">+ Foto<input hidden type="file" accept="image/*" capture="environment" multiple onChange={(e) => { void addFoto(e.target.files); e.target.value = ""; }} /></Button>}
              </Box>
              {(s.ordens ?? []).length > 0 && (
                <>
                  <Typography variant="subtitle2">Ordens de serviço</Typography>
                  {s.ordens.map((o: any) => <Typography key={o.id} variant="body2">{o.numero} · <Status value={o.status} /> · {o.responsavelNome || o.equipeExterna || "sem responsável"} · prazo {fmtDate(o.prazo)} · custo {fmtMoney(o.custoReal ?? o.custoPrevisto)}{o.relatorioExecucao ? ` · ${o.relatorioExecucao}` : ""}</Typography>)}
                </>
              )}
              <Typography variant="subtitle2" sx={{ mt: 1.5 }}>Conversa</Typography>
              {(s.comentarios ?? []).map((c: any) => (
                <Box key={c.id} sx={{ py: 0.8, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Typography variant="caption" color="text.secondary">{c.autorNome || "—"} · {fmtDT(c.createdAt)}{c.interno ? " · interno" : ""}</Typography>
                  <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.texto}</Typography>
                </Box>
              ))}
              <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
                <TextField size="small" label="Comentário" value={txt} onChange={(e) => setTxt(e.target.value)} sx={{ flex: "1 1 220px" }} />
                {gestor && <Button size="small" variant={interno ? "contained" : "outlined"} onClick={() => setInterno(!interno)}>Interno</Button>}
                <Button variant="contained" disabled={!txt.trim()} onClick={() => run(async () => { await call("POST", `${J}/solicitacoes/${id}/comentarios`, { texto: txt, interno }); setTxt(""); }, "Comentário enviado.")}>Enviar</Button>
              </Box>
            </>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap" }}>
        {s && gestor && ["NOVA", "EM_TRIAGEM"].includes(s.status) && <Button onClick={() => setDlg("triagem")}>Triagem</Button>}
        {s && gestor && aberta && <Button onClick={() => setDlg("os")}>Gerar OS</Button>}
        {s && gestor && aberta && <Button onClick={() => setDlg("resolver")}>Marcar resolvida</Button>}
        {s && dono && s.status === "RESOLVIDA" && <Button variant="contained" onClick={() => setDlg("avaliar")}>Avaliar atendimento</Button>}
        {s && (dono || gestor) && ["RESOLVIDA", "FECHADA"].includes(s.status) && <Button color="warning" onClick={() => { const m = window.prompt("Motivo da reabertura?"); if (m) void run(() => call("POST", `${J}/solicitacoes/${id}/reabrir`, { motivo: m }), "Reaberta."); }}>Reabrir</Button>}
        {s && (dono || gestor) && ["NOVA", "EM_TRIAGEM"].includes(s.status) && <Button color="error" onClick={() => { void run(() => call("POST", `${J}/solicitacoes/${id}/cancelar`, {}), "Cancelada.", "Cancelar esta solicitação?"); }}>Cancelar</Button>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
      <FormDialog open={dlg === "triagem"} title="Triagem" onClose={() => setDlg(null)} maxWidth="sm" submitLabel="Salvar triagem"
        fields={[
          { key: "decisao", label: "Decisão", type: "select", required: true, options: [{ value: "ACEITAR", label: "Aceitar" }, { value: "REJEITAR", label: "Rejeitar" }] },
          { key: "prioridade", label: "Prioridade", type: "select", options: opts(PRIOR) }, { key: "categoria", label: "Categoria", type: "select", options: opts(CATEGORIAS) },
          { key: "responsavelUserId", label: "Responsável", type: "select", options: pessoas }, { key: "prazo", label: "Prazo", type: "date", helper: "Vazio = prazo padrão pela prioridade." },
          { key: "custoEstimado", label: "Custo estimado (R$)", type: "number" }, { key: "motivo", label: "Motivo (obrigatório ao rejeitar)", type: "textarea", full: true },
        ]}
        onSubmit={async (b) => { await call("POST", `${J}/solicitacoes/${id}/triagem`, b); setDlg(null); after(); }} />
      <FormDialog open={dlg === "os"} title="Gerar ordem de serviço" onClose={() => setDlg(null)} maxWidth="sm" submitLabel="Gerar OS"
        fields={[
          { key: "responsavelUserId", label: "Responsável", type: "select", options: pessoas }, { key: "equipeExterna", label: "Equipe/empresa externa" },
          { key: "prazo", label: "Prazo", type: "date" }, { key: "custoPrevisto", label: "Custo previsto (R$)", type: "number" }, { key: "descricao", label: "Instruções", type: "textarea", full: true },
        ]}
        onSubmit={async (b) => { await call("POST", `${J}/solicitacoes/${id}/gerar-os`, b); setDlg(null); after(); }} />
      <FormDialog open={dlg === "resolver"} title="Marcar como resolvida" onClose={() => setDlg(null)} maxWidth="sm" submitLabel="Resolver"
        fields={[{ key: "custoFinal", label: "Custo final (R$)", type: "number" }, { key: "nota", label: "Nota para o solicitante", type: "textarea", full: true }]}
        onSubmit={async (b) => { await call("POST", `${J}/solicitacoes/${id}/resolver`, b); setDlg(null); after(); }} />
      <AvaliarDialog open={dlg === "avaliar"} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `${J}/solicitacoes/${id}/avaliar`, b); setDlg(null); after(); }} />
    </Dialog>
  );
}

function AvaliarDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (b: { nota: number; comentario?: string }) => Promise<void> }) {
  const [nota, setNota] = useState<number | null>(5);
  const [c, setC] = useState("");
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Como foi o atendimento?</DialogTitle>
      <DialogContent><Rating size="large" value={nota} onChange={(_, v) => setNota(v)} /><TextField fullWidth size="small" multiline label="Comentário (opcional)" value={c} onChange={(e) => setC(e.target.value)} sx={{ mt: 1.5 }} /></DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!nota} onClick={() => void onSubmit({ nota: nota!, comentario: c || undefined })}>Enviar avaliação</Button></DialogActions>
    </Dialog>
  );
}

// ------------------------------------------------------------------ listas
function Lista({ path, titulo, vazio, onOpen, rev, filtros }: { path: string; titulo: string; vazio: string; onOpen: (id: string) => void; rev: number; filtros?: boolean }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const l = useApi<any>(`${J}${path}?${qstr({ page, pageSize: 15, status, q })}`, [rev]);
  const rows = itemsOf(l.data);
  return (
    <Section title={titulo}>
      {filtros && (
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
          <TextField size="small" label="Buscar" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} sx={{ flex: "1 1 180px" }} />
          <TextField select size="small" label="Situação" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} sx={{ minWidth: 170 }}>
            <MenuItem value="">Todas</MenuItem>{["NOVA", "EM_TRIAGEM", "OS_GERADA", "EM_ANDAMENTO", "RESOLVIDA", "FECHADA", "REJEITADA", "CANCELADA"].map((x) => <MenuItem key={x} value={x}>{label(x)}</MenuItem>)}
          </TextField>
        </Box>
      )}
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText={vazio} onRetry={l.reload}>
        <DataList<any> rows={rows} onRowClick={(r) => onOpen(r.id)} columns={[
          { label: "Solicitação", primary: true, render: (r) => <><b>{r.titulo}</b><Typography variant="caption" component="div" color="text.secondary">{r.numero} · {label(r.tipo)} · {label(r.categoria)}</Typography></> },
          { label: "Local", hideOnMobile: true, render: (r) => r.local || "—" }, { label: "Solicitante", hideOnMobile: true, render: (r) => r.solicitanteNome || "—" },
          { label: "Responsável", render: (r) => r.responsavelNome || "—" }, { label: "Prazo", render: (r) => <>{fmtDate(r.prazo)}{r.prazoVencido ? " ⚠" : ""}</> },
          { label: "Situação", render: (r) => <Status value={r.status} /> },
        ]} actions={(r) => <ActionsMenu items={[{ label: "Abrir", onClick: () => onOpen(r.id) }]} />} />
        <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((l.data?.total ?? 0) / 15))} page={page} onChange={(_, n) => setPage(n)} />
      </LoadBox>
    </Section>
  );
}

function Painel({ rev }: { rev: number }) {
  const p = useApi<any>(`${J}/solicitacoes/painel`, [rev]);
  const x = p.data;
  if (!x) return null;
  return (
    <KpiRow>
      <Kpi title="Abertas" value={x.abertas} /><Kpi title="Sem triagem" value={x.novasSemTriagem} color={x.novasSemTriagem ? "#e0a100" : undefined} /><Kpi title="Prazo vencido" value={x.vencidas} color={x.vencidas ? "#d64545" : undefined} />
      <Kpi title="Tempo médio (dias)" value={x.tempoMedioResolucaoDias ?? "—"} /><Kpi title="Avaliação média" value={x.avaliacaoMedia ?? "—"} /><Kpi title="Custo total" value={fmtMoney(x.custoTotal)} />
    </KpiRow>
  );
}

function OrdensTab() {
  const pessoas = usePessoas();
  const [conc, setConc] = useState<any>(null);
  const [rev, setRev] = useState(0);
  const fields: FormField[] = [
    { key: "titulo", label: "Título", required: true, full: true }, { key: "tipo", label: "Tipo", type: "select", options: opts(["CORRETIVA", "PREVENTIVA", "IMPLEMENTACAO"]) },
    { key: "prioridade", label: "Prioridade", type: "select", options: opts(PRIOR) }, { key: "responsavelUserId", label: "Responsável", type: "select", options: pessoas },
    { key: "equipeExterna", label: "Equipe externa" }, { key: "prazo", label: "Prazo", type: "date" }, { key: "custoPrevisto", label: "Custo previsto (R$)", type: "number" }, { key: "descricao", label: "Descrição", type: "textarea", full: true },
  ];
  return (
    <>
      <ResourceTab title="Ordens de serviço" path="/os" fields={fields} newLabel="Nova OS" anexoRef="Ordem" refreshKey={rev} editable={false}
        filters={[{ key: "status", label: "Situação", options: opts(["ABERTA", "EM_EXECUCAO", "AGUARDANDO_MATERIAL", "CONCLUIDA", "CANCELADA"]) }, { key: "tipo", label: "Tipo", options: opts(["CORRETIVA", "PREVENTIVA", "IMPLEMENTACAO"]) }]}
        columns={[
          { label: "OS", primary: true, render: (o) => <><b>{o.titulo}</b><Typography variant="caption" component="div" color="text.secondary">{o.numero} · {label(o.tipo)}</Typography></> },
          { label: "Responsável", render: (o) => o.responsavelNome || o.equipeExterna || "—" }, { label: "Prazo", render: (o) => fmtDate(o.prazo) },
          { label: "Custo", render: (o) => fmtMoney(o.custoReal ?? o.custoPrevisto) }, { label: "No prazo", hideOnMobile: true, render: (o) => (o.noPrazo == null ? "—" : o.noPrazo ? "sim" : "não") }, { label: "Situação", render: (o) => <Status value={o.status} /> },
        ]}
        rowActions={(o, { run }) => [
          { label: "Iniciar", show: ["ABERTA", "AGUARDANDO_MATERIAL"].includes(o.status), onClick: () => { void run(() => call("POST", `${J}/os/${o.id}/iniciar`), "OS iniciada."); } },
          { label: "Concluir", show: ["ABERTA", "EM_EXECUCAO", "AGUARDANDO_MATERIAL"].includes(o.status), onClick: () => setConc(o) },
          { label: "Cancelar", color: "error", show: !["CONCLUIDA", "CANCELADA"].includes(o.status), onClick: () => { void run(() => call("POST", `${J}/os/${o.id}/cancelar`), "OS cancelada.", "Cancelar a OS?"); } },
        ]} />
      <FormDialog open={!!conc} title={`Concluir ${conc?.numero ?? ""}`} onClose={() => setConc(null)} maxWidth="sm" submitLabel="Concluir"
        fields={[{ key: "relatorioExecucao", label: "Relatório de execução", type: "textarea", required: true, full: true }, { key: "custoReal", label: "Custo real (R$)", type: "number" }]}
        onSubmit={async (b) => { await call("POST", `${J}/os/${conc.id}/concluir`, b); setConc(null); setRev((x) => x + 1); }} />
    </>
  );
}

function QrTab() {
  const [rev] = useState(0);
  const [qr, setQr] = useState<any>(null);
  const [img, setImg] = useState<string>("");
  const espacos = useEspacos();
  useEffect(() => {
    if (!qr) return;
    const url = `${window.location.origin}/edu/infraestrutura?secao=solicitacoes&qr=${qr.token}`;
    QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setImg).catch(() => setImg(""));
  }, [qr]);
  return (
    <>
      <ResourceTab title="QR das salas e locais" path="/qr-locais" editable={false} deletable newLabel="Novo QR" refreshKey={rev}
        intro={<Alert severity="info" sx={{ mb: 1.5 }}>Imprima o QR e fixe na sala. Quem ler com o celular (já logado) abre o formulário de solicitação com o local preenchido.</Alert>}
        fields={[{ key: "nome", label: "Nome do local", required: true, full: true }, { key: "spaceId", label: "Sala / espaço cadastrado", type: "select", options: espacos }]}
        columns={[{ label: "Local", primary: true, render: (q) => q.nome }, { label: "Token", hideOnMobile: true, render: (q) => <code>{q.token}</code> }]}
        rowActions={(q) => [{ label: "Ver / imprimir QR", onClick: () => setQr(q) }]} />
      <Dialog open={!!qr} onClose={() => setQr(null)}>
        <DialogTitle>{qr?.nome}</DialogTitle>
        <DialogContent sx={{ textAlign: "center" }}>{img ? <img src={img} alt={`QR ${qr?.nome}`} width={280} /> : <CircularProgress />}<Typography variant="body2">Encontrou um problema? Leia o QR e relate.</Typography></DialogContent>
        <DialogActions><Button onClick={() => window.print()}>Imprimir</Button><Button onClick={() => setQr(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </>
  );
}

export default function SolicitacoesTab() {
  const [params, setParams] = useSearchParams();
  const qrToken = params.get("qr") || undefined;
  const gestor = GESTORES.includes(role());
  const leitor = LEITORES.includes(role());
  const [sub, setSub] = useState(0);
  const [nova, setNova] = useState(!!qrToken);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const { toast, node } = useToast();
  const subs = [{ k: "minhas", l: "Minhas solicitações" }, ...(leitor ? [{ k: "fila", l: "Fila e triagem" }, { k: "os", l: "Ordens de serviço" }] : []), ...(gestor ? [{ k: "qr", l: "QR das salas" }] : [])];
  const cur = subs[Math.min(sub, subs.length - 1)].k;
  return (
    <>
      {node}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 4, mb: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Notificar problema ou implementação</Typography>
          <Typography variant="body2" color="text.secondary">Qualquer pessoa pode relatar, com fotos. Você acompanha o andamento, o prazo, o responsável e avalia o atendimento.</Typography>
        </Box>
        <Button variant="contained" size="large" onClick={() => setNova(true)}>Nova solicitação</Button>
      </Paper>
      {leitor && <Painel rev={rev} />}
      <Tabs value={Math.min(sub, subs.length - 1)} onChange={(_, v) => setSub(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>{subs.map((s) => <Tab key={s.k} label={s.l} sx={{ textTransform: "none", fontWeight: 700 }} />)}</Tabs>
      {cur === "minhas" && <Lista path="/solicitacoes/minhas" titulo="Minhas solicitações" vazio="Você ainda não abriu solicitações." onOpen={setDetalhe} rev={rev} />}
      {cur === "fila" && <Lista path="/solicitacoes" titulo="Fila de solicitações" vazio="Nenhuma solicitação encontrada." onOpen={setDetalhe} rev={rev} filtros />}
      {cur === "os" && <OrdensTab />}
      {cur === "qr" && <QrTab />}
      {nova && <NovaSolicitacao qrToken={qrToken} onClose={() => { setNova(false); if (qrToken) { params.delete("qr"); setParams(params, { replace: true }); } }} onDone={() => { setNova(false); setRev((x) => x + 1); toast({ type: "success", text: "Solicitação enviada! Você será avisado a cada atualização." }); if (qrToken) { params.delete("qr"); setParams(params, { replace: true }); } }} />}
      {detalhe && <Detalhe id={detalhe} onClose={() => setDetalhe(null)} onChanged={() => setRev((x) => x + 1)} />}
    </>
  );
}
