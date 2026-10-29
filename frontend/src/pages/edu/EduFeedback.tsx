import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Pagination, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import { readSessionUser } from "../../services/DemoAccess";
import { API, Bar, DataList, FormDialog, Kpi, KpiRow, LoadBox, Section, Status, call, fmtDT, itemsOf, label, opts, qstr, useApi, useRunner, useToast } from "../../edu/infraestrutura/kit2";

const F = "/feedback";
const TIPOS = ["SUGESTAO", "MELHORIA", "ERRO", "BUG", "DUVIDA"];
const STATUS = ["NOVO", "EM_TRIAGEM", "PLANEJADO", "EM_ANDAMENTO", "RESOLVIDO", "RECUSADO", "DUPLICADO"];
const PRIOR = ["BAIXA", "MEDIA", "ALTA", "CRITICA"];
const TRIAGEM = ["ADMIN", "OWNER", "RECTOR", "BOARD", "SUPPORT"];

function Captura({ itemId, a }: { itemId: string; a: any }) {
  const [src, setSrc] = useState<string | null>(null);
  async function ver() {
    const token = localStorage.getItem("dentalpos.token") || "";
    const r = await fetch(`${API}/edu${F}/itens/${itemId}/anexos/${a.id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setSrc(URL.createObjectURL(await r.blob()));
  }
  return src ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={a.nome} style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid #ccc" }} /></a> : <Button size="small" onClick={ver}>Ver captura: {a.nome}</Button>;
}

function Detalhe({ id, onClose, onChanged, responsaveis }: { id: string; onClose: () => void; onChanged: () => void; responsaveis: Array<{ value: string; label: string }> }) {
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const { toast, node } = useToast();
  const d = useApi<any>(`${F}/itens/${id}`, [rev]);
  const dupBusca = useApi<any>(dlg === "dup" ? `${F}/fila?pageSize=50&ordem=votos` : null, [dlg]);
  const after = () => { setRev((x) => x + 1); onChanged(); };
  const run = useRunner(toast, after);
  const i = d.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>{i ? `${i.numero} — ${i.titulo}` : "Item"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {i && (
            <>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
                <Status value={i.status} /><Chip size="small" label={label(i.tipo)} /><Chip size="small" label={label(i.categoria)} /><Chip size="small" color={i.prioridade === "CRITICA" ? "error" : "default"} label={`Prioridade ${label(i.prioridade)}`} />
                <Chip size="small" label={`${i.votos} voto(s)`} />{i.atendimentoRef && <Chip size="small" color="info" label={`Atendimento ${i.atendimentoRef}`} />}
              </Box>
              <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{i.descricao}</Typography>
              {i.passosReproduzir && <><Typography variant="subtitle2" sx={{ mt: 1.5 }}>Passos para reproduzir</Typography><Typography sx={{ whiteSpace: "pre-wrap" }}>{i.passosReproduzir}</Typography></>}
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 0.5, my: 1.5, fontSize: 14 }}>
                <span>Autor: <b>{i.autorAnonimo ? "anônimo" : i.autorNome || "—"}</b></span><span>Perfil: <b>{i.perfil || "—"}</b></span>
                <span>Tela: <b>{i.rota || "—"}</b> {i.tela ? `(${i.tela})` : ""}</span><span>Versão: <b>{i.versaoApp || "—"}</b></span>
                <span>Navegador: <b>{i.navegador || "—"}</b></span><span>Viewport: <b>{i.viewport || "—"}</b></span>
                <span>Responsável: <b>{i.responsavelNome || "—"}</b></span><span>Enviado em: <b>{fmtDT(i.createdAt)}</b></span>
              </Box>
              {i.logsConsole && <><Typography variant="subtitle2">Logs do console (sanitizados)</Typography><Box component="pre" sx={{ m: 0, p: 1, fontSize: 11, maxHeight: 160, overflow: "auto", bgcolor: "action.hover", borderRadius: 1, whiteSpace: "pre-wrap" }}>{i.logsConsole}</Box></>}
              {(i.anexos ?? []).map((a: any) => <Box key={a.id} sx={{ mt: 1 }}><Captura itemId={i.id} a={a} /></Box>)}
              {i.respostaAutor && <Alert severity="info" sx={{ mt: 1.5 }}><b>Resposta ao autor ({fmtDT(i.respondidoEm)}):</b> {i.respostaAutor}</Alert>}
              <Typography variant="subtitle2" sx={{ mt: 1.5 }}>Notas da triagem</Typography>
              {(i.comentarios ?? []).map((c: any) => <Box key={c.id} sx={{ py: 0.6, borderBottom: "1px solid", borderColor: "divider" }}><Typography variant="caption" color="text.secondary">{c.autorNome} · {fmtDT(c.createdAt)}{c.interno ? " · interna" : " · visível ao autor"}</Typography><Typography sx={{ whiteSpace: "pre-wrap" }}>{c.texto}</Typography></Box>)}
              <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                <TextField size="small" fullWidth label="Nota interna" value={nota} onChange={(e) => setNota(e.target.value)} />
                <Button variant="contained" disabled={!nota.trim()} onClick={() => run(async () => { await call("POST", `${F}/itens/${id}/comentarios`, { texto: nota, interno: true }); setNota(""); }, "Nota salva.")}>Salvar</Button>
              </Box>
            </>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap" }}>
        <Button onClick={() => setDlg("status")}>Alterar status</Button><Button onClick={() => setDlg("responder")}>Responder ao autor</Button><Button onClick={() => setDlg("atribuir")}>Atribuir / classificar</Button>
        {i && !["DUPLICADO"].includes(i.status) && <Button onClick={() => setDlg("dup")}>Marcar duplicado</Button>}
        {i && !i.atendimentoRef && <Button onClick={() => { void run(() => call("POST", `${F}/itens/${id}/encaminhar-atendimento`, {}), "Encaminhado ao Atendimento.", "Abrir um chamado no Atendimento (Apoio) a partir deste item?"); }}>Encaminhar ao Atendimento</Button>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
      <FormDialog open={dlg === "status"} title="Alterar status" onClose={() => setDlg(null)} maxWidth="sm" fields={[{ key: "status", label: "Novo status", type: "select", required: true, options: opts(STATUS.filter((s) => s !== "DUPLICADO")) }, { key: "resposta", label: "Mensagem ao autor (obrigatória para recusar)", type: "textarea", full: true }]}
        onSubmit={async (b) => { await call("POST", `${F}/itens/${id}/status`, b); setDlg(null); after(); }} />
      <FormDialog open={dlg === "responder"} title="Responder ao autor" onClose={() => setDlg(null)} maxWidth="sm" fields={[{ key: "resposta", label: "Resposta", type: "textarea", required: true, full: true }]}
        onSubmit={async (b) => { await call("POST", `${F}/itens/${id}/responder`, b); setDlg(null); after(); }} />
      <FormDialog open={dlg === "atribuir"} title="Atribuir / classificar" onClose={() => setDlg(null)} maxWidth="sm" fields={[{ key: "responsavelUserId", label: "Responsável", type: "select", options: responsaveis }, { key: "prioridade", label: "Prioridade", type: "select", options: opts(PRIOR) }, { key: "tipo", label: "Tipo", type: "select", options: opts(TIPOS) }]}
        onSubmit={async (b) => { await call("PATCH", `${F}/itens/${id}`, b); setDlg(null); after(); }} />
      <FormDialog open={dlg === "dup"} title="Marcar como duplicado de…" onClose={() => setDlg(null)} maxWidth="sm" intro={<Typography variant="body2" sx={{ mb: 1 }}>Os votos migram para o item principal e o autor é avisado.</Typography>}
        fields={[{ key: "duplicadoDeId", label: "Item principal", type: "select", required: true, options: itemsOf(dupBusca.data).filter((x: any) => x.id !== id && x.status !== "DUPLICADO").map((x: any) => ({ value: x.id, label: `${x.numero} — ${x.titulo.slice(0, 60)}` })) }]}
        onSubmit={async (b) => { await call("POST", `${F}/itens/${id}/duplicado`, b); setDlg(null); after(); }} />
    </Dialog>
  );
}

function Painel() {
  const p = useApi<any>(`${F}/painel`);
  const x = p.data;
  return (
    <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
      {x && (
        <>
          <KpiRow>
            <Kpi title="Abertos" value={x.abertos} /><Kpi title="Sem responsável" value={x.semResponsavel} color={x.semResponsavel ? "#e0a100" : undefined} /><Kpi title="Críticos abertos" value={x.criticosAbertos} color={x.criticosAbertos ? "#d64545" : undefined} />
            <Kpi title="Tempo médio (dias)" value={x.tempoMedioResolucaoDias ?? "—"} /><Kpi title="Taxa de resposta" value={x.taxaResposta != null ? `${x.taxaResposta}%` : "—"} /><Kpi title="Total" value={x.total} />
          </KpiRow>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Section title="Por status">{Object.entries(x.porStatus as Record<string, number>).map(([k, v]) => <Bar key={k} label={label(k)} value={v} max={x.total || 1} right={v} />)}</Section>
            <Section title="Por tipo">{Object.entries(x.porTipo as Record<string, number>).map(([k, v]) => <Bar key={k} label={label(k)} value={v} max={x.total || 1} right={v} />)}</Section>
            <Section title="Telas com mais erros">{x.telasComMaisErros.length ? x.telasComMaisErros.map((t: any) => <Bar key={t.rota} label={t.rota} value={t.total} max={x.telasComMaisErros[0].total} right={t.total} />) : <Typography color="text.secondary">Nenhum erro relatado.</Typography>}</Section>
            <Section title="Sugestões mais votadas">{x.maisVotadas.length ? x.maisVotadas.map((t: any) => <Typography key={t.id} variant="body2" sx={{ py: 0.4 }}>👍 {t.votos} · {t.numero} — {t.titulo}</Typography>) : <Typography color="text.secondary">Sem sugestões ainda.</Typography>}</Section>
          </Box>
        </>
      )}
    </LoadBox>
  );
}

function Fila() {
  const [f, setF] = useState<Record<string, string>>({ abertos: "true", ordem: "prioridade" });
  const [page, setPage] = useState(1);
  const [rev, setRev] = useState(0);
  const [det, setDet] = useState<string | null>(null);
  const resp = useApi<any>(`${F}/responsaveis`);
  const l = useApi<any>(`${F}/fila?${qstr({ ...f, page, pageSize: 20 })}`, [rev]);
  const responsaveis = itemsOf(resp.data).map((u: any) => ({ value: u.id, label: u.nome }));
  const set = (k: string, v: string) => { setF((o) => ({ ...o, [k]: v })); setPage(1); };
  async function exportar() {
    const token = localStorage.getItem("dentalpos.token") || "";
    const r = await fetch(`${API}/edu${F}/exportar?${qstr({ ...f, format: "csv" })}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { window.alert("Não foi possível exportar."); return; }
    const url = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = url; a.download = "feedback.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const rows = itemsOf(l.data);
  return (
    <Section title="Fila de triagem" actions={<Button onClick={exportar}>Exportar CSV</Button>}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <TextField size="small" label="Buscar" onChange={(e) => set("q", e.target.value)} sx={{ flex: "1 1 180px" }} />
        {([["status", "Status", STATUS], ["tipo", "Tipo", TIPOS], ["prioridade", "Prioridade", PRIOR]] as const).map(([k, l2, o]) => (
          <TextField key={k} select size="small" label={l2} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} sx={{ minWidth: 150 }}><MenuItem value="">Todos</MenuItem>{o.map((x) => <MenuItem key={x} value={x}>{label(x)}</MenuItem>)}</TextField>
        ))}
        <TextField select size="small" label="Ordenar por" value={f.ordem} onChange={(e) => set("ordem", e.target.value)} sx={{ minWidth: 150 }}><MenuItem value="prioridade">Prioridade</MenuItem><MenuItem value="votos">Votos</MenuItem><MenuItem value="recentes">Mais recentes</MenuItem></TextField>
        <TextField select size="small" label="Mostrar" value={f.abertos ?? ""} onChange={(e) => set("abertos", e.target.value)} sx={{ minWidth: 130 }}><MenuItem value="true">Só abertos</MenuItem><MenuItem value="">Todos</MenuItem></TextField>
      </Box>
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nada na fila." onRetry={l.reload}>
        <DataList<any> rows={rows} onRowClick={(r) => setDet(r.id)} columns={[
          { label: "Item", primary: true, render: (r) => <><b>{r.titulo}</b><Typography variant="caption" component="div" color="text.secondary">{r.numero} · {label(r.tipo)} · {label(r.categoria)} · {r.rota || "sem tela"}</Typography></> },
          { label: "Prioridade", render: (r) => <Status value={r.prioridade} /> }, { label: "Votos", hideOnMobile: true, render: (r) => r.votos }, { label: "Responsável", hideOnMobile: true, render: (r) => r.responsavelNome || "—" }, { label: "Enviado", hideOnMobile: true, render: (r) => fmtDT(r.createdAt) }, { label: "Status", render: (r) => <Status value={r.status} /> },
        ]} />
        <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((l.data?.total ?? 0) / 20))} page={page} onChange={(_, n) => setPage(n)} />
      </LoadBox>
      {det && <Detalhe id={det} responsaveis={responsaveis} onClose={() => setDet(null)} onChanged={() => setRev((x) => x + 1)} />}
    </Section>
  );
}

export default function EduFeedback() {
  const [tab, setTab] = useState(0);
  const permitido = TRIAGEM.includes(String(readSessionUser()?.role || "").toUpperCase());
  return (
    <EduShell title="Central de feedback" subtitle="Triagem de sugestões, melhorias, erros e bugs enviados pelos usuários em qualquer tela.">
      {!permitido ? <Alert severity="info">A central é restrita à administração e ao suporte. Para enviar uma sugestão ou relatar um problema, use o botão discreto no canto da tela.</Alert> : (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}><Tab label="Painel" /><Tab label="Fila de triagem" /></Tabs>
          {tab === 0 ? <Painel /> : <Fila />}
        </>
      )}
    </EduShell>
  );
}
