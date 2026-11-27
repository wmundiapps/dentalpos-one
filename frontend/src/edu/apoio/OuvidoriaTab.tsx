import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import EduResourcePage from "../EduResourcePage";
import { Bar, COLORS, FormDialog, Kanban, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDate, fmtDateTime, fmtNum, fmtPct, itemsOf, openHtml, useApi, useRunner, useToast } from "../desempenho/kit";

const COLS = ["RECEBIDA", "EM_ANALISE", "ENCAMINHADA", "RESPONDIDA", "ENCERRADA", "ARQUIVADA"];
const COLC: Record<string, string> = { RECEBIDA: COLORS.info, EM_ANALISE: COLORS.warn, ENCAMINHADA: "#7a5cff", RESPONDIDA: COLORS.ok, ENCERRADA: "#1f7a4a", ARQUIVADA: COLORS.mute };
const TIPOS = ["RECLAMACAO", "SUGESTAO", "ELOGIO", "DENUNCIA", "SOLICITACAO"];
const ABERTAS = ["RECEBIDA", "EM_ANALISE", "ENCAMINHADA"];

/** Semáforo do prazo (SLA): verde, amarelo (>=80% do prazo usado) ou vermelho (vencida). */
function sla(m: any) {
  if (!ABERTAS.includes(m.status)) return { cor: COLORS.mute, txt: "—" };
  const total = Math.max(1, new Date(m.prazoEm).getTime() - new Date(m.createdAt).getTime());
  const usado = (Date.now() - new Date(m.createdAt).getTime()) / total;
  const dias = Math.ceil((new Date(m.prazoEm).getTime() - Date.now()) / 86_400_000);
  if (usado > 1) return { cor: COLORS.bad, txt: `vencida há ${-dias} dia(s)` };
  return { cor: usado >= 0.8 ? COLORS.warn : COLORS.ok, txt: `${dias} dia(s)` };
}

function Detalhe({ id, setores, onClose, onChange }: { id: string; setores: Array<{ value: string; label: string }>; onClose: () => void; onChange: () => void }) {
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<null | "triar" | "enc" | "resp" | "prorrogar" | "arquivar" | "reabrir" | "nota">(null);
  const { toast, node } = useToast();
  const after = () => { setRev((x) => x + 1); onChange(); };
  const m = useApi<any>(`/apoio/ouvidoria/manifestacoes/${id}`, [rev]);
  const d = m.data;
  const s = d ? sla(d) : null;
  const base = `/apoio/ouvidoria/manifestacoes/${id}`;
  const f = (k: string, label: string, extra: any = {}) => ({ key: k, label, type: "textarea" as const, required: true, ...extra });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{d ? `${d.protocolo} — ${d.assunto}` : "Manifestação"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={m.loading} error={m.error} onRetry={m.reload}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
            <Status value={d?.status} /><Chip size="small" label={d?.tipo} color={d?.tipo === "DENUNCIA" ? "error" : "default"} /><Chip size="small" variant="outlined" label={`Prioridade ${d?.prioridade}`} />
            {s && <Chip size="small" sx={{ bgcolor: s.cor, color: "#fff" }} label={`Prazo: ${fmtDate(d.prazoEm)} (${s.txt})`} />}
            {d?.anonima && <Chip size="small" label="Anônima" />}{d?.prorrogadoEm && <Chip size="small" color="warning" label="Prorrogada" />}
          </Box>
          {d?.identificacaoOculta ? <Alert severity="info" sx={{ mb: 2 }}>Identificação do manifestante oculta para o seu perfil.</Alert> : (!d?.anonima && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Manifestante: {d?.nome ?? "—"} {d?.email ? `· ${d.email}` : ""} {d?.vinculo ? `· ${d.vinculo}` : ""}</Typography>)}
          <Typography sx={{ whiteSpace: "pre-wrap", mb: 2 }}>{d?.descricao}</Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
            {d?.status === "RECEBIDA" && <Button size="small" variant="contained" onClick={() => setDlg("triar")}>Triar</Button>}
            {ABERTAS.includes(d?.status) && <Button size="small" variant="outlined" onClick={() => setDlg("enc")}>Encaminhar a setor</Button>}
            {ABERTAS.includes(d?.status) && <Button size="small" variant="contained" color="success" onClick={() => setDlg("resp")}>Responder</Button>}
            {ABERTAS.includes(d?.status) && !d?.prorrogadoEm && <Button size="small" variant="outlined" color="warning" onClick={() => setDlg("prorrogar")}>Prorrogar prazo</Button>}
            {!["ARQUIVADA"].includes(d?.status) && <Button size="small" color="error" onClick={() => setDlg("arquivar")}>Arquivar</Button>}
            {["RESPONDIDA", "ENCERRADA", "ARQUIVADA"].includes(d?.status) && <Button size="small" onClick={() => setDlg("reabrir")}>Reabrir</Button>}
            <Button size="small" onClick={() => setDlg("nota")}>Nota interna</Button>
          </Box>
          {(d?.encaminhamentos || []).length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Encaminhamentos aos setores</Typography>
              {d.encaminhamentos.map((e: any) => <Typography key={e.id} variant="body2">• {setores.find((x) => x.value === e.setorId)?.label ?? "Setor"} — {e.status} (prazo {fmtDate(e.prazoEm)}){e.resposta ? ` — resposta: ${e.resposta}` : ""}</Typography>)}
            </Box>
          )}
          {d?.respostaFinal && <Alert severity="success" sx={{ mb: 2 }}><b>Resposta final:</b> {d.respostaFinal}{d.avaliacaoNota != null ? ` — avaliação do manifestante: ${d.avaliacaoNota}/5` : ""}</Alert>}
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Histórico</Typography>
          {(d?.andamentos || []).map((a: any) => <Typography key={a.id} variant="caption" component="div" color="text.secondary">{fmtDateTime(a.createdAt)} {a.publico ? "" : "(interno) "}— {a.texto}</Typography>)}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      <FormDialog open={dlg === "triar"} onClose={() => setDlg(null)} maxWidth="sm" title="Triagem" initial={{ prioridade: d?.prioridade || "NORMAL" }}
        fields={[{ key: "prioridade", label: "Prioridade", type: "select", options: ["BAIXA", "NORMAL", "ALTA", "URGENTE"] }, { key: "categoria", label: "Categoria" }, { key: "setorId", label: "Setor responsável", type: "select", options: setores }]}
        onSubmit={async (b) => { await call("POST", `${base}/triar`, b); after(); }} />
      <FormDialog open={dlg === "enc"} onClose={() => setDlg(null)} maxWidth="sm" title="Encaminhar ao setor" fields={[{ key: "setorId", label: "Setor", type: "select", options: setores, required: true }, f("solicitacao", "Solicitação ao setor (mín. 10 caracteres)"), { key: "prazoDias", label: "Prazo (dias)", type: "number" }]}
        onSubmit={async (b) => { await call("POST", `${base}/encaminhar`, b); toast({ type: "success", text: "Encaminhado ao setor." }); after(); }} />
      <FormDialog open={dlg === "resp"} onClose={() => setDlg(null)} title="Resposta conclusiva" submitLabel="Responder"
        fields={[f("resposta", "Resposta ao manifestante (mín. 20 caracteres)"), { key: "forcar", label: "Responder mesmo com encaminhamentos pendentes", type: "bool" }]}
        onSubmit={async (b) => { await call("POST", `${base}/responder`, b); toast({ type: "success", text: "Resposta registrada; manifestante notificado." }); after(); }} />
      <FormDialog open={dlg === "prorrogar"} onClose={() => setDlg(null)} maxWidth="sm" title="Prorrogar prazo (uma vez)" fields={[f("justificativa", "Justificativa (mín. 15 caracteres)")]}
        onSubmit={async (b) => { await call("POST", `${base}/prorrogar`, b); after(); }} />
      <FormDialog open={dlg === "arquivar"} onClose={() => setDlg(null)} maxWidth="sm" title="Arquivar manifestação" fields={[f("motivo", "Motivo (mín. 15 caracteres)")]}
        onSubmit={async (b) => { await call("POST", `${base}/arquivar`, b); after(); }} />
      <FormDialog open={dlg === "reabrir"} onClose={() => setDlg(null)} maxWidth="sm" title="Reabrir manifestação" fields={[f("motivo", "Motivo (mín. 10 caracteres)")]}
        onSubmit={async (b) => { await call("POST", `${base}/reabrir`, b); after(); }} />
      <FormDialog open={dlg === "nota"} onClose={() => setDlg(null)} maxWidth="sm" title="Nota interna (não visível ao manifestante)" fields={[f("texto", "Nota")]}
        onSubmit={async (b) => { await call("POST", `${base}/nota-interna`, b); after(); }} />
    </Dialog>
  );
}

function Relatorio() {
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const r = useApi<any>(`/apoio/ouvidoria/relatorio?ano=${ano}`);
  const { toast, node } = useToast();
  const run = useRunner(toast);
  const d = r.data;
  const anos = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i)).map((a) => ({ value: a, label: a }));
  const max = Math.max(1, ...(d?.porMes || []).map((m: any) => m.total));
  return (
    <Section title="Relatório da Ouvidoria" actions={<><Pick label="Ano" value={ano} onChange={setAno} options={anos} minWidth={100} /><Button variant="outlined" onClick={() => run(() => openHtml(`/apoio/ouvidoria/relatorio-anual?ano=${ano}`), "Relatório anual aberto em nova aba.")}>Relatório anual (HTML)</Button></>}>
      {node}
      <LoadBox loading={r.loading} error={r.error} onRetry={r.reload}>
        <KpiRow>
          <Kpi title="Manifestações" value={d?.total ?? 0} hint={d?.variacaoPercentual != null ? `${d.variacaoPercentual > 0 ? "+" : ""}${fmtNum(d.variacaoPercentual)}% vs. ano anterior` : undefined} />
          <Kpi title="Respondidas no prazo" value={fmtPct(d?.percentualNoPrazo, 0)} color={(d?.percentualNoPrazo ?? 100) < 80 ? COLORS.bad : COLORS.ok} />
          <Kpi title="Tempo médio de resposta" value={d?.tempoMedioRespostaDias != null ? `${fmtNum(d.tempoMedioRespostaDias)} dias` : "—"} />
          <Kpi title="Satisfação" value={d?.satisfacaoMedia != null ? `${fmtNum(d.satisfacaoMedia, 1)}/5` : "—"} hint={`${d?.avaliacoes ?? 0} avaliações`} />
          <Kpi title="Vencidas em aberto" value={d?.abertasVencidas ?? 0} color={d?.abertasVencidas ? COLORS.bad : COLORS.ok} />
        </KpiRow>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
          <Box><Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Por tipo</Typography>{Object.entries(d?.porTipo || {}).map(([k, v]) => <Bar key={k} label={k} value={Number(v)} max={d.total || 1} right={String(v)} color={k === "DENUNCIA" ? COLORS.bad : COLORS.info} />)}</Box>
          <Box><Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Por setor</Typography>{(d?.porSetorNomeado || []).map((s: any) => <Bar key={s.setor} label={s.setor} value={s.total} max={d.total || 1} right={String(s.total)} color="#7a5cff" />)}</Box>
        </Box>
        {(d?.porMes || []).length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Volume mensal</Typography>
            <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.5, height: 100 }}>
              {d.porMes.map((m: any) => <Box key={m.mes} sx={{ flex: 1, textAlign: "center" }} title={`${m.total}`}><Box sx={{ height: `${(m.total / max) * 80}px`, minHeight: 2, bgcolor: COLORS.info, borderRadius: "4px 4px 0 0" }} /><Typography variant="caption">{m.mes}</Typography></Box>)}
            </Box>
          </Box>
        )}
        {(d?.recomendacoes || []).map((x: string) => <Alert key={x} severity="warning" sx={{ mt: 1 }}>{x}</Alert>)}
      </LoadBox>
    </Section>
  );
}

export default function OuvidoriaTab() {
  const [sub, setSub] = useState("quadro");
  const [rev, setRev] = useState(0);
  const [det, setDet] = useState<string | null>(null);
  const [fTipo, setFTipo] = useState("");
  const [venc, setVenc] = useState(false);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const setoresApi = useApi<any>("/apoio/ouvidoria/setores?pageSize=100", [rev]);
  const setores = itemsOf(setoresApi.data).map((s) => ({ value: s.id, label: s.nome }));
  const l = useApi<any>(`/apoio/ouvidoria/manifestacoes?pageSize=100${fTipo ? `&tipo=${fTipo}` : ""}${venc ? "&vencidas=true" : ""}`, [rev]);
  const rows = itemsOf(l.data);
  const vencidas = rows.filter((m) => ABERTAS.includes(m.status) && new Date(m.prazoEm) < new Date()).length;
  return (
    <Box>
      {node}
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <ToggleButtonGroup size="small" exclusive value={sub} onChange={(_, v) => v && setSub(v)}>
          <ToggleButton value="quadro">Manifestações</ToggleButton><ToggleButton value="rel">Relatório</ToggleButton><ToggleButton value="setores">Setores</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" variant="outlined" onClick={() => run(() => call("POST", "/apoio/bootstrap"), "Setores, programas de bolsa e instrumentos padrão garantidos.", "Criar os cadastros padrão do módulo (setores de ouvidoria, programas de bolsa, instrumentos)? Itens existentes são preservados.")}>Carregar cadastros padrão</Button>
      </Box>
      {sub === "quadro" && (
        <Section title="Ouvidoria — manifestações" actions={<><Pick label="Tipo" value={fTipo} all="Todos" minWidth={150} onChange={setFTipo} options={TIPOS.map((t) => ({ value: t, label: t }))} /><Button variant={venc ? "contained" : "outlined"} color="error" onClick={() => setVenc(!venc)}>Só vencidas</Button></>}>
          <KpiRow><Kpi title="Em aberto" value={rows.filter((m) => ABERTAS.includes(m.status)).length} /><Kpi title="Vencidas" value={vencidas} color={vencidas ? COLORS.bad : COLORS.ok} /><Kpi title="Denúncias abertas" value={rows.filter((m) => m.tipo === "DENUNCIA" && ABERTAS.includes(m.status)).length} color={COLORS.bad} /></KpiRow>
          <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nenhuma manifestação." onRetry={l.reload}>
            <Kanban columns={COLS} items={rows} getCol={(m) => m.status} colors={COLC} onOpen={(m) => setDet(m.id)} title={(m) => m.assunto} subtitle={(m) => `${m.protocolo} · ${m.tipo}`}
              meta={(m) => { const s = sla(m); return <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}><Chip size="small" sx={{ bgcolor: s.cor, color: "#fff" }} label={ABERTAS.includes(m.status) ? s.txt : fmtDate(m.prazoEm)} />{["ALTA", "URGENTE"].includes(m.prioridade) && <Chip size="small" color="error" label={m.prioridade} />}</Box>; }} />
          </LoadBox>
        </Section>
      )}
      {sub === "rel" && <Relatorio />}
      {sub === "setores" && (
        <EduResourcePage key={rev} title="Setores da ouvidoria" base="/apoio" resource="/ouvidoria/setores" searchable={false} description="Setores que recebem encaminhamentos e seus prazos de resposta (SLA)."
          columns={[{ key: "codigo", label: "Código" }, { key: "nome", label: "Setor" }, { key: "email", label: "E-mail" }, { key: "slaDias", label: "SLA (dias)" }, { key: "ativo", label: "Ativo" }]}
          fields={[{ key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome", required: true }, { key: "email", label: "E-mail" }, { key: "slaDias", label: "SLA (dias)", type: "number" }, { key: "ativo", label: "Ativo", type: "bool" }]} />
      )}
      {det && <Detalhe id={det} setores={setores} onClose={() => setDet(null)} onChange={() => setRev((x) => x + 1)} />}
    </Box>
  );
}
