import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Step, StepLabel, Stepper, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { fmtDate, fmtNum, Kpi, KpiGrid, label, openHtml, Progress, Section, Status, toIso, useApi, useToast } from "../regulatorio/ui";
import { SEGMENTOS, STATUS_ACAO, toArr, useOptions } from "./shared";

const ETAPAS = ["PLANEJAMENTO", "COLETA", "ANALISE", "RELATORIO", "CONCLUIDO"];
const EIXOS: Record<string, string> = { "1": "Planejamento e Avaliação Institucional", "2": "Desenvolvimento Institucional", "3": "Políticas Acadêmicas", "4": "Políticas de Gestão", "5": "Infraestrutura Física" };
const corIdx = (v: number | null) => (v == null ? "#94a3b8" : v >= 80 ? "#16a34a" : v >= 60 ? "#65a30d" : v >= 40 ? "#eab308" : "#dc2626");

function Cell({ c }: { c: any }) {
  if (!c || c.suprimido) return <Typography variant="caption" color="text.secondary">n &lt; mín.</Typography>;
  return <Progress value={c.indice} color={corIdx(c.indice)} />;
}

function Convites({ q, onClose }: { q: any; onClose: () => void }) {
  const [qtd, setQtd] = useState("20");
  const [tokens, setTokens] = useState<string[] | null>(null);
  const resumo = useApi<any>(`/governanca/cpa/questionarios/${q.id}/convites/resumo`);
  const { toast, node } = useToast();
  async function gerar() {
    try { const r = await eduApi.post(`/governanca/cpa/questionarios/${q.id}/convites`, { quantidade: Number(qtd) }); setTokens(r.tokens); resumo.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  const r = resumo.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Convites anônimos — {q.titulo}</DialogTitle>
      <DialogContent dividers>
        {r && <Typography variant="body2" sx={{ mb: 1 }}>{r.usados}/{r.total} utilizados · participação {r.taxaParticipacao ?? "—"}%</Typography>}
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <TextField size="small" type="number" label="Quantidade" value={qtd} onChange={(e) => setQtd(e.target.value)} />
          <Button variant="contained" onClick={gerar}>Gerar códigos</Button>
        </Box>
        {tokens && (<>
          <Alert severity="warning" sx={{ mb: 1 }}>Guarde agora: os códigos não podem ser consultados depois.</Alert>
          <TextField fullWidth multiline minRows={6} value={tokens.join("\n")} slotProps={{ input: { readOnly: true, sx: { fontFamily: "monospace" } } }} />
          <Button size="small" sx={{ mt: 1 }} onClick={() => navigator.clipboard?.writeText(tokens.join("\n"))}>Copiar todos</Button>
        </>)}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {node}
    </Dialog>
  );
}

function CicloDetalhe({ ciclo, onClose, onChanged }: { ciclo: any; onClose: () => void; onChanged: () => void }) {
  const det = useApi<any>(`/governanca/cpa/ciclos/${ciclo.id}`);
  const res = useApi<any>(`/governanca/cpa/ciclos/${ciclo.id}/resultados`);
  const rels = useApi<any>(`/governanca/cpa/ciclos/${ciclo.id}/relatorios`);
  const modelos = useApi<any>("/governanca/cpa/modelos");
  const [modelo, setModelo] = useState("");
  const [conv, setConv] = useState<any | null>(null);
  const { toast, node } = useToast();
  const c = det.data || ciclo;
  const qs: any[] = c.questionarios || [];
  const r = res.data;

  async function run(fn: () => Promise<any>, ok: string, reloadAll = true) {
    try { await fn(); toast({ type: "success", text: ok }); if (reloadAll) { det.reload(); res.reload(); rels.reload(); onChanged(); } } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{c.titulo} ({c.anoBase})</DialogTitle>
      <DialogContent dividers>
        <Stepper activeStep={ETAPAS.indexOf(c.status)} alternativeLabel sx={{ mb: 2 }}>{ETAPAS.map((e) => <Step key={e}><StepLabel>{label(e)}</StepLabel></Step>)}</Stepper>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Coleta: {fmtDate(c.inicio)} a {fmtDate(c.fim)} · mínimo de {c.minRespostas} respostas para divulgar resultados (anonimato).</Typography>

        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Questionários</Typography>
        {qs.map((q) => (
          <Box key={q.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
            <Typography variant="body2" sx={{ flex: 1 }}>{q.titulo} <Chip size="small" label={label(q.segmento)} /></Typography>
            <Button size="small" onClick={() => setConv(q)}>Convites</Button>
          </Box>
        ))}
        {!qs.length && <Typography variant="body2" color="text.secondary">Nenhum questionário.</Typography>}
        {c.status === "PLANEJAMENTO" && (
          <Box sx={{ display: "flex", gap: 1, my: 1 }}>
            <TextField select size="small" label="Criar a partir de modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} sx={{ minWidth: 320 }}>
              {toArr(modelos.data).map((m: any) => <MenuItem key={m.id} value={m.chave}>{m.titulo} ({label(m.segmento)})</MenuItem>)}
            </TextField>
            <Button variant="outlined" disabled={!modelo} onClick={() => run(() => eduApi.post("/governanca/cpa/questionarios/from-modelo", { cicloId: c.id, modeloKey: modelo }), "Questionário criado.")}>Criar</Button>
            {!toArr(modelos.data).length && <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>Sem modelos: rode o bootstrap do módulo.</Typography>}
          </Box>
        )}

        <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 2 }}>Resultados por eixo SINAES</Typography>
        <Status loading={res.loading && !r} error={res.error} onRetry={res.reload} empty={!r}>
          {r && (<>
            <KpiGrid>
              <Kpi title="Respondentes" value={r.totalRespondentes} />
              <Kpi title="Convites usados" value={`${r.participacao?.respondidos ?? 0}/${r.participacao?.convitesEmitidos ?? 0}`} hint={r.participacao?.taxa != null ? `${r.participacao.taxa}%` : undefined} />
            </KpiGrid>
            {Object.keys(EIXOS).map((k) => (
              <Box key={k} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "260px 1fr 140px" }, gap: 1, alignItems: "center", py: 0.4 }}>
                <Typography variant="body2">Eixo {k} — {EIXOS[k]}</Typography>
                <Cell c={r.porEixo?.[k]} />
                <Typography variant="caption" color="text.secondary">{r.conceitos?.[k] || ""}</Typography>
              </Box>
            ))}
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Por segmento</Typography>
            {SEGMENTOS.map((s) => <Box key={s} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "260px 1fr" }, gap: 1, py: 0.2 }}><Typography variant="body2">{label(s)}</Typography><Cell c={r.porSegmento?.[s]} /></Box>)}
            {(r.fragilidades || []).length > 0 && <Box sx={{ mt: 1.5, display: "flex", gap: 1, flexWrap: "wrap" }}>{r.fragilidades.map((f: any, i: number) => <Chip key={i} color="warning" size="small" label={`${f.nivel === "EIXO" ? "Eixo" : "Dim."} ${f.chave}: ${fmtNum(f.indice, 0)}%`} />)}</Box>}
            {(r.comentarios || []).length > 0 && <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, maxHeight: 160, overflow: "auto" }}>{r.comentarios.slice(0, 20).map((t: string, i: number) => <Typography key={i} variant="body2">• {t}</Typography>)}</Paper>}
          </>)}
        </Status>

        <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 2 }}>Relatórios e plano de ação</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", my: 1 }}>
          <Button size="small" variant="outlined" onClick={() => run(() => eduApi.post(`/governanca/cpa/ciclos/${c.id}/relatorios`, { tipo: "PARCIAL" }), "Relatório parcial gerado.")}>Gerar relatório parcial</Button>
          <Button size="small" variant="outlined" onClick={() => run(() => eduApi.post(`/governanca/cpa/ciclos/${c.id}/relatorios`, { tipo: "ANUAL" }), "Relatório anual gerado.")}>Gerar relatório anual</Button>
          <Button size="small" variant="outlined" onClick={() => run(async () => { const x = await eduApi.post(`/governanca/cpa/ciclos/${c.id}/plano/gerar`, {}); toast({ type: "success", text: `${x.criadas} ação(ões) criada(s) a partir de ${x.fragilidades} fragilidade(s).` }); }, "Plano gerado.", false)}>Gerar plano de ação das fragilidades</Button>
        </Box>
        {toArr(rels.data).map((x: any) => (
          <Box key={x.id} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Typography variant="body2" sx={{ flex: 1 }}>Relatório {label(x.tipo)} — {fmtDate(x.createdAt)}</Typography>
            <Button size="small" onClick={() => openHtml(`/governanca/cpa/relatorios/${x.id}/html`).catch((e) => toast({ type: "error", text: e.message }))}>Abrir</Button>
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        {c.status !== "CONCLUIDO" && <Button color="primary" onClick={() => { if (window.confirm(`Avançar o ciclo para ${label(ETAPAS[ETAPAS.indexOf(c.status) + 1])}?`)) run(() => eduApi.post(`/governanca/cpa/ciclos/${c.id}/avancar`, {}), "Ciclo avançado."); }}>Avançar etapa</Button>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
      {conv && <Convites q={conv} onClose={() => setConv(null)} />}
      {node}
    </Dialog>
  );
}

function Ciclos() {
  const { data, loading, error, reload } = useApi<any>("/governanca/cpa/ciclos?pageSize=50");
  const [sel, setSel] = useState<any | null>(null);
  const [novo, setNovo] = useState<Record<string, string> | null>(null);
  const { toast, node } = useToast();
  const items = toArr(data);
  async function criar() {
    try { await eduApi.post("/governanca/cpa/ciclos", { titulo: novo!.titulo, anoBase: Number(novo!.anoBase), inicio: toIso(novo!.inicio), fim: toIso(novo!.fim), minRespostas: novo!.min ? Number(novo!.min) : undefined }); setNovo(null); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Section title="Ciclos de autoavaliação" action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo({ anoBase: String(new Date().getFullYear()) })}>Novo ciclo</Button>}>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!items.length} emptyText="Nenhum ciclo de autoavaliação.">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          {items.map((c) => (
            <Paper key={c.id} variant="outlined" sx={{ p: 2, borderRadius: 3, cursor: "pointer", "&:hover": { boxShadow: 3 } }} onClick={() => setSel(c)}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}><Typography sx={{ fontWeight: 800, flex: 1 }}>{c.titulo}</Typography><StatusChip value={c.status} /></Box>
              <Typography variant="caption" color="text.secondary">{c.anoBase} · coleta {fmtDate(c.inicio)} a {fmtDate(c.fim)}</Typography>
              <Box sx={{ mt: 1 }}><Progress value={(ETAPAS.indexOf(c.status) / (ETAPAS.length - 1)) * 100} showLabel={false} /></Box>
            </Paper>
          ))}
        </Box>
      </Status>
      {sel && <CicloDetalhe ciclo={sel} onClose={() => setSel(null)} onChanged={reload} />}
      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Novo ciclo de autoavaliação</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          <TextField size="small" required label="Título" value={novo?.titulo || ""} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
          <TextField size="small" type="number" label="Ano-base" value={novo?.anoBase || ""} onChange={(e) => setNovo({ ...novo, anoBase: e.target.value })} />
          <TextField size="small" type="date" required label="Início da coleta" value={novo?.inicio || ""} onChange={(e) => setNovo({ ...novo, inicio: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" required label="Fim da coleta" value={novo?.fim || ""} onChange={(e) => setNovo({ ...novo, fim: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="number" label="Mínimo de respostas p/ divulgar (3-100)" value={novo?.min || ""} onChange={(e) => setNovo({ ...novo, min: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" disabled={!novo?.titulo || !novo?.inicio || !novo?.fim} onClick={criar}>Criar</Button></DialogActions>
      </Dialog>
      {node}
    </Section>
  );
}

export default function CpaTab() {
  const [v, setV] = useState("ciclos");
  const cpas = useOptions("/governanca/cpa/comissoes?pageSize=50", (c) => c.nome);
  const ciclos = useOptions("/governanca/cpa/ciclos?pageSize=100", (c) => c.titulo);
  const B = "/governanca";
  return (
    <Box>
      <ToggleButtonGroup size="small" exclusive value={v} onChange={(_, x) => x && setV(x)} sx={{ mb: 2 }}>
        <ToggleButton value="ciclos">Ciclos e resultados</ToggleButton><ToggleButton value="comissao">Comissão</ToggleButton><ToggleButton value="membros">Membros</ToggleButton><ToggleButton value="plano">Plano de ação</ToggleButton>
      </ToggleButtonGroup>
      {v === "ciclos" && <Ciclos />}
      {v === "comissao" && <EduResourcePage title="Comissão Própria de Avaliação" base={B} resource="/cpa/comissoes" fields={[{ key: "nome", label: "Nome", required: true }, { key: "portaria", label: "Portaria" }]} columns={[{ key: "nome", label: "Nome" }, { key: "portaria", label: "Portaria" }, { key: "ativa", label: "Ativa" }]} />}
      {v === "membros" && <EduResourcePage title="Membros da CPA" base={B} resource="/cpa/membros"
        description="A composição deve ter todos os segmentos e nenhum com maioria absoluta."
        filters={[{ key: "segmento", label: "Segmento", options: SEGMENTOS }]}
        fields={[{ key: "cpaId", label: "Comissão", type: "select", options: cpas, required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "segmento", label: "Segmento", type: "select", options: SEGMENTOS.map((s) => ({ value: s, label: label(s) })), required: true }, { key: "cargo", label: "Cargo" }, { key: "inicioMandato", label: "Início do mandato", type: "date", required: true }, { key: "fimMandato", label: "Fim do mandato", type: "date", required: true }]}
        columns={[{ key: "nome", label: "Nome" }, { key: "segmento", label: "Segmento", render: (r) => label(r.segmento) }, { key: "cargo", label: "Cargo" }, { key: "fimMandato", label: "Fim do mandato", render: (r) => fmtDate(r.fimMandato) }]} />}
      {v === "plano" && <EduResourcePage title="Plano de ação da CPA" base={B} resource="/cpa/plano-acao" filters={[{ key: "status", label: "Status", options: STATUS_ACAO }]}
        fields={[{ key: "cicloId", label: "Ciclo", type: "select", options: ciclos, required: true, createOnly: true }, { key: "eixo", label: "Eixo (1-5)", type: "number" }, { key: "dimensao", label: "Dimensão (1-10)", type: "number" }, { key: "problema", label: "Problema / fragilidade", type: "textarea", required: true }, { key: "acao", label: "Ação", type: "textarea", required: true }, { key: "prazo", label: "Prazo", type: "date" }, { key: "status", label: "Status", type: "select", options: STATUS_ACAO.map((s) => ({ value: s, label: label(s) })) }]}
        columns={[{ key: "problema", label: "Problema" }, { key: "acao", label: "Ação" }, { key: "prazo", label: "Prazo", render: (r) => fmtDate(r.prazo) }, { key: "status", label: "Status", render: (r) => <StatusChip value={r.status} /> }]} />}
    </Box>
  );
}
