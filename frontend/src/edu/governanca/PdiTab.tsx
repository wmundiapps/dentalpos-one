import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PrintIcon from "@mui/icons-material/Print";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { StatusChip } from "../EduResourcePage";
import { Dot, fmtDate, fmtNum, Kpi, KpiGrid, openHtml, Progress, SEMAFORO, Section, Status, toIso, useApi, useToast } from "../regulatorio/ui";
import { moeda, toArr } from "./shared";

function Barras({ eixos, esperado }: { eixos: any[]; esperado: number }) {
  const h = 30;
  return (
    <svg viewBox={`0 0 600 ${eixos.length * h + 20}`} width="100%" role="img" aria-label="Execução por eixo">
      {eixos.map((e, i) => {
        const y = i * h + 10;
        return (
          <g key={e.id}>
            <text x="0" y={y + 12} fontSize="11" fill="currentColor">{String(e.nome).slice(0, 28)}</text>
            <rect x="200" y={y} width="340" height="14" rx="7" fill="#94a3b833" />
            <rect x="200" y={y} width={Math.max(0, Math.min(100, e.percentual)) * 3.4} height="14" rx="7" fill={SEMAFORO[e.semaforo] || "#94a3b8"} />
            <text x="548" y={y + 12} fontSize="11" fill="currentColor">{fmtNum(e.percentual, 0)}%</text>
          </g>
        );
      })}
      <line x1={200 + esperado * 3.4} x2={200 + esperado * 3.4} y1="2" y2={eixos.length * h + 12} stroke="#475569" strokeDasharray="4 3" />
      <text x={200 + esperado * 3.4} y={eixos.length * h + 20} fontSize="10" textAnchor="middle" fill="currentColor">esperado {fmtNum(esperado, 0)}%</text>
    </svg>
  );
}

function Spark({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), r = max - min || 1;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * 120},${28 - ((v - min) / r) * 24}`).join(" ");
  return <svg width="120" height="30"><polyline points={d} fill="none" stroke="#2563eb" strokeWidth="2" /></svg>;
}

function Medicao({ meta, onClose, onDone }: { meta: any; onClose: () => void; onDone: () => void }) {
  const { data, reload } = useApi<any>(`/governanca/pdi-metas/${meta.id}/medicoes`);
  const [v, setV] = useState("");
  const [d, setD] = useState("");
  const [obs, setObs] = useState("");
  const { toast, node } = useToast();
  const items: any[] = data?.items || [];
  async function salvar() {
    try { await eduApi.post(`/governanca/pdi-metas/${meta.id}/medicoes`, { valor: Number(v.replace(",", ".")), dataReferencia: d ? toIso(d) : undefined, observacao: obs || undefined }); setV(""); setObs(""); toast({ type: "success", text: "Medição registrada." }); reload(); onDone(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function del(id: string) {
    if (!window.confirm("Remover esta medição?")) return;
    try { await eduApi.del(`/governanca/pdi-medicoes/${id}`); reload(); onDone(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Medições — {meta.titulo}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Indicador: {meta.indicador} · base {meta.linhaBase} → meta {meta.valorMeta}{meta.unidade ? ` ${meta.unidade}` : ""}</Typography>
        <Spark pts={items.map((i) => Number(i.valor))} />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, my: 1.5 }}>
          <TextField size="small" label="Valor apurado" value={v} onChange={(e) => setV(e.target.value)} />
          <TextField size="small" type="date" label="Data de referência" value={d} onChange={(e) => setD(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label="Observação" value={obs} onChange={(e) => setObs(e.target.value)} sx={{ gridColumn: "1 / -1" }} />
          <Button variant="contained" disabled={!v} onClick={salvar}>Registrar medição</Button>
        </Box>
        {items.map((m) => (
          <Box key={m.id} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Typography variant="body2" sx={{ flex: 1 }}>{fmtDate(m.dataReferencia)} — <b>{m.valor}</b> {m.observacao ? `(${m.observacao})` : ""}</Typography>
            <Button size="small" color="error" onClick={() => del(m.id)}>Remover</Button>
          </Box>
        ))}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {node}
    </Dialog>
  );
}

function NovoPdi({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const y = new Date().getFullYear();
  const [f, setF] = useState<Record<string, any>>({ anoInicio: y, anoFim: y + 4 });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));
  async function go() {
    try { await eduApi.post("/governanca/pdis", { titulo: f.titulo, anoInicio: Number(f.anoInicio), anoFim: Number(f.anoFim), missao: f.missao || undefined, visao: f.visao || undefined, valores: f.valores || undefined }); onDone(); } catch (e: any) { setErr(e.message); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Novo PDI</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        {err && <Typography color="error" variant="body2">{err}</Typography>}
        <TextField size="small" required label="Título" value={f.titulo || ""} onChange={(e) => set("titulo", e.target.value)} />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <TextField size="small" type="number" label="Ano de início" value={f.anoInicio} onChange={(e) => set("anoInicio", e.target.value)} />
          <TextField size="small" type="number" label="Ano de fim (máx. 5 anos)" value={f.anoFim} onChange={(e) => set("anoFim", e.target.value)} />
        </Box>
        {["missao", "visao", "valores"].map((k) => <TextField key={k} size="small" multiline minRows={2} label={k[0].toUpperCase() + k.slice(1)} value={f[k] || ""} onChange={(e) => set(k, e.target.value)} />)}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!f.titulo} onClick={go}>Criar</Button></DialogActions>
    </Dialog>
  );
}

export default function PdiTab() {
  const { data: lista, loading, error, reload } = useApi<any>("/governanca/pdis?pageSize=50");
  const pdis = toArr(lista);
  const [sel, setSel] = useState("");
  const [novo, setNovo] = useState(false);
  const [med, setMed] = useState<any | null>(null);
  const { toast, node } = useToast();
  useEffect(() => { if (!sel && pdis.length) setSel((pdis.find((p: any) => p.status === "VIGENTE") || pdis[0]).id); }, [pdis, sel]);
  const exec = useApi<any>(sel ? `/governanca/pdis/${sel}/execucao` : null);
  const coletas = useApi<any>("/governanca/pdi-coletas-pendentes");
  const cur = pdis.find((p: any) => p.id === sel);
  const p = exec.data;

  async function acao(a: "ativar" | "encerrar") {
    if (!window.confirm(a === "ativar" ? "Ativar este PDI? Outro PDI vigente será encerrado." : "Encerrar este PDI?")) return;
    try { await eduApi.post(`/governanca/pdis/${sel}/${a}`, {}); toast({ type: "success", text: a === "ativar" ? "PDI ativado." : "PDI encerrado." }); reload(); exec.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function relatorio() { try { await openHtml(`/governanca/pdis/${sel}/relatorio?format=html`); } catch (e: any) { toast({ type: "error", text: e.message }); } }

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField select size="small" label="PDI" value={sel} onChange={(e) => setSel(e.target.value)} sx={{ minWidth: 300 }}>
          {pdis.map((x: any) => <MenuItem key={x.id} value={x.id}>{x.titulo} ({x.anoInicio}–{x.anoFim}) · {x.status}</MenuItem>)}
        </TextField>
        {cur && <StatusChip value={cur.status} />}
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo PDI</Button>
        {cur && cur.status !== "VIGENTE" && cur.status !== "ENCERRADO" && <Button color="success" onClick={() => acao("ativar")}>Ativar</Button>}
        {cur && cur.status === "VIGENTE" && <Button color="warning" onClick={() => acao("encerrar")}>Encerrar</Button>}
        {sel && <Button startIcon={<PrintIcon />} onClick={relatorio}>Relatório</Button>}
      </Box>
      <Status loading={loading && !lista} error={error} onRetry={reload} empty={!pdis.length} emptyText="Nenhum PDI cadastrado. Crie o primeiro (ou use o bootstrap do módulo).">
        <Status loading={exec.loading && !p} error={exec.error} onRetry={exec.reload} empty={!p}>
          {p && (<>
            <KpiGrid>
              <Kpi title="Execução geral" value={`${fmtNum(p.percentualExecucao, 0)}%`} color={SEMAFORO[p.semaforo]} hint={`Esperado pelo cronograma: ${fmtNum(p.percentualEsperado, 0)}%`} />
              <Kpi title="Metas" value={`${p.metas.VERDE}/${p.metas.AMARELO}/${p.metas.VERMELHO}`} hint={`no prazo / atenção / críticas (${p.metas.CINZA} sem medição)`} />
              <Kpi title="Ações" value={`${p.acoes.concluidas}/${p.acoes.total}`} color={p.acoes.atrasadas ? SEMAFORO.VERMELHO : undefined} hint={`${p.acoes.atrasadas} atrasada(s)`} />
              <Kpi title="Orçamento" value={moeda(p.orcamento.gasto)} color={p.orcamento.estouro ? SEMAFORO.VERMELHO : undefined} hint={`previsto ${moeda(p.orcamento.previsto)}${p.orcamento.estouro ? " — ESTOURO" : ""}`} />
            </KpiGrid>
            <Section title="Execução por eixo estratégico">
              <Status empty={!p.eixos.length} emptyText="PDI sem eixos."><Barras eixos={p.eixos} esperado={p.percentualEsperado} /></Status>
            </Section>
            {p.eixos.map((e: any) => (
              <Section key={e.id} title={`${e.nome} — ${fmtNum(e.percentual, 0)}%`} action={<Dot color={SEMAFORO[e.semaforo]} />}>
                {e.objetivos.map((o: any) => (
                  <Box key={o.id} sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{o.titulo} <Chip size="small" label={`${fmtNum(o.percentual, 0)}%`} /></Typography>
                    {o.metas.map((m: any) => (
                      <Paper key={m.id} variant="outlined" sx={{ p: 1.2, mt: 1, borderRadius: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                        <Dot color={SEMAFORO[m.semaforo]} />
                        <Box sx={{ flex: 1, minWidth: 220 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{m.titulo}</Typography>
                          <Typography variant="caption" color="text.secondary">{m.indicador}: {m.linhaBase} → {m.valorAtual ?? "—"} (meta {m.valorMeta}{m.unidade ? ` ${m.unidade}` : ""}) · esperado {fmtNum(m.esperado, 0)}%{m.coletaAtrasada ? " · coleta atrasada" : ""}</Typography>
                        </Box>
                        <Box sx={{ width: 170 }}><Progress value={m.percentual} /></Box>
                        <Button size="small" onClick={() => setMed(m)}>Medições</Button>
                      </Paper>
                    ))}
                    {!o.metas.length && <Typography variant="caption" color="text.secondary">Sem metas.</Typography>}
                  </Box>
                ))}
              </Section>
            ))}
          </>)}
        </Status>
      </Status>
      <Section title="Coletas de indicadores pendentes (próximos 15 dias)">
        <Status loading={coletas.loading && !coletas.data} error={coletas.error} onRetry={coletas.reload} empty={!toArr(coletas.data).length} emptyText="Nenhuma coleta pendente.">
          {toArr(coletas.data).map((m: any) => (
            <Box key={m.id} sx={{ display: "flex", gap: 1.5, alignItems: "center", py: 0.3 }}>
              <Typography variant="body2" sx={{ flex: 1 }}><b>{m.indicador}</b> — {m.titulo}</Typography>
              <Typography variant="caption" color={new Date(m.proximaColetaEm) < new Date() ? "error" : "text.secondary"}>{fmtDate(m.proximaColetaEm)}</Typography>
              <Button size="small" onClick={() => setMed(m)}>Registrar</Button>
            </Box>
          ))}
        </Status>
      </Section>
      {novo && <NovoPdi onClose={() => setNovo(false)} onDone={() => { setNovo(false); reload(); }} />}
      {med && <Medicao meta={med} onClose={() => setMed(null)} onDone={() => { exec.reload(); coletas.reload(); }} />}
      {node}
    </Box>
  );
}
