import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Typography } from "@mui/material";
import { useState } from "react";
import { AVISO_MODELO, Bar, COLORS, DataList, J, Kpi, KpiRow, LoadBox, Pick, PromptDialog, ResourceTab, Section, Status, call, fmtDate, fmtMoney, itemsOf, opts, useApi, useRunner, useToast, type FormField } from "./kit";
import { AREAS } from "./ProcessosTab";

const DIMS = [["causaRaiz", "Causa raiz"], ["setorOrigem", "Setor de origem"], ["area", "Tipo/área"], ["assunto", "Assunto"], ["tipoOrigem", "Origem"], ["risco", "Risco"], ["resultado", "Resultado"], ["ano", "Ano"], ["uf", "UF"]];
const nome = (s: string) => (s || "").replace(/_/g, " ").toLowerCase();

function Ranking({ titulo, grupos, max }: { titulo: string; grupos: any[]; max?: number }) {
  const top = (grupos || []).slice(0, max ?? 8);
  const m = Math.max(1, ...top.map((g) => g.qtd));
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, flex: "1 1 300px", minWidth: 0 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>{titulo}</Typography>
      {!top.length && <Typography variant="body2" color="text.secondary">Sem dados.</Typography>}
      {top.map((g) => <Bar key={g.chave} value={g.qtd} max={m} label={nome(g.chave)} right={`${g.qtd} · ${fmtMoney(g.valorCausa)}`} color={COLORS.info} />)}
    </Paper>
  );
}

function Acoes({ plano, onClose }: { plano: any; onClose: () => void }) {
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const l = useApi<any>(`${J}/planos-prevencao/${plano.id}`, [rev]);
  const ef = useApi<any>(`${J}/planos-prevencao/${plano.id}/efetividade`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const p = l.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Plano: {plano.titulo}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
          {p && <>
            <Typography variant="body2" sx={{ mb: 1 }}>Causa: <b>{nome(p.causaRaiz)}</b> · Responsável: <b>{p.responsavelNome || "—"}</b> · Prazo: <b>{fmtDate(p.prazo)}</b> · Meta: {p.meta || "—"}</Typography>
            {ef.data && <Alert severity={ef.data.avaliacao === "EFETIVO" ? "success" : ef.data.avaliacao === "PIOROU" ? "error" : "info"} sx={{ mb: 1.5 }}>
              Efetividade ({ef.data.avaliacao.toLowerCase().replace("_", " ")}): {ef.data.ocorrenciasAntes} ocorrência(s) antes → {ef.data.ocorrenciasDepois} depois{ef.data.reducaoPct !== null ? ` (${ef.data.reducaoPct}% de redução)` : ""}. {ef.data.observacao}
            </Alert>}
            {(p.acoes || []).map((a: any) => (
              <Box key={a.id} sx={{ py: 0.8, borderBottom: "1px solid", borderColor: "divider", display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Box sx={{ flex: 1, minWidth: 180 }}><Typography>{a.descricao}</Typography><Typography variant="caption" color="text.secondary">{a.responsavelNome || "—"} · {fmtDate(a.prazo)}</Typography></Box>
                <Status value={a.status} />
                {a.status !== "CONCLUIDA" && a.status !== "CANCELADA" && <Button size="small" onClick={() => run(() => call("POST", `${J}/planos-acoes/${a.id}/status`, { status: "CONCLUIDA" }), "Ação concluída.")}>Concluir</Button>}
              </Box>
            ))}
            {!(p.acoes || []).length && <Typography color="text.secondary">Nenhuma ação cadastrada.</Typography>}
          </>}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={() => setNovo(true)}>Nova ação</Button><Button onClick={onClose}>Fechar</Button></DialogActions>
      <PromptDialog open={novo} title="Nova ação do plano" onClose={() => setNovo(false)} fields={[{ key: "descricao", label: "Ação", type: "textarea", required: true }, { key: "responsavelNome", label: "Responsável" }, { key: "prazo", label: "Prazo", type: "date" }]}
        onSubmit={async (b) => { await call("POST", `${J}/planos-prevencao/${plano.id}/acoes`, b); setRev((x) => x + 1); }} />
    </Dialog>
  );
}

export default function InteligenciaTab() {
  const [area, setArea] = useState("");
  const [desde, setDesde] = useState("");
  const [linhas, setLinhas] = useState("causaRaiz");
  const [colunas, setColunas] = useState("setorOrigem");
  const [rev, setRev] = useState(0);
  const [novoPlano, setNovoPlano] = useState<null | Record<string, any>>(null);
  const [acoes, setAcoes] = useState<any>(null);
  const q = `${area ? `area=${area}` : ""}${desde ? `${area ? "&" : ""}desde=${desde}` : ""}`;
  const r = useApi<any>(`${J}/inteligencia/resumo${q ? "?" + q : ""}`, [rev]);
  const ind = useApi<any>(`${J}/inteligencia/indicadores${q ? "?" + q : ""}`, [rev]);
  const cz = useApi<any>(`${J}/inteligencia/cruzamento?linhas=${linhas}&colunas=${colunas}${q ? "&" + q : ""}`, [rev]);
  const rec = useApi<any>(`${J}/inteligencia/recomendacoes${q ? "?" + q : ""}`, [rev]);
  const catalogo = useApi<any>(`${J}/inteligencia/catalogo`);
  const causas = (catalogo.data?.causas || []).map((c: any) => ({ value: c.chave, label: c.rotulo }));
  const d = r.data;
  const PLANO: FormField[] = [
    { key: "titulo", label: "Título do plano", required: true }, { key: "causaRaiz", label: "Causa raiz", type: "select", required: true, options: causas }, { key: "setor", label: "Setor" },
    { key: "prioridade", label: "Prioridade", type: "select", options: opts(["BAIXA", "MEDIA", "ALTA"]) }, { key: "responsavelNome", label: "Responsável (obrigatório)", required: true }, { key: "prazo", label: "Prazo", type: "date" },
    { key: "meta", label: "Meta (ex.: reduzir 50% em 12 meses)" }, { key: "descricao", label: "Descrição", type: "textarea" },
  ];
  return (
    <>
      <Section title="Inteligência de processos sofridos" actions={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Pick label="Área" value={area} onChange={setArea} options={opts(AREAS)} all="Todas" minWidth={140} />
        <Pick label="Desde" value={desde} onChange={setDesde} all="Todo o histórico" minWidth={150} options={[1, 2, 3].map((a) => ({ value: new Date(Date.now() - a * 365 * 86_400_000).toISOString().slice(0, 10), label: `Últimos ${a} ano(s)` }))} />
      </Box>}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Considera processos em que a instituição é ré/investigada. Cruza causa raiz, assunto, setor e tipo para achar recorrência e orientar a prevenção. Classifique a causa raiz em cada processo para melhorar a leitura.</Typography>
        <LoadBox loading={r.loading} error={r.error} onRetry={r.reload}>
          {d && <>
            {d.recorrentesSemPlano.length > 0 && <Alert severity="warning" sx={{ mb: 2 }}>Causas recorrentes sem plano de prevenção ativo: <b>{d.recorrentesSemPlano.map(nome).join(", ")}</b>. Veja as recomendações abaixo.</Alert>}
            {d.semClassificacao > 0 && <Alert severity="info" sx={{ mb: 2 }}>{d.semClassificacao} processo(s) sem causa raiz classificada.</Alert>}
            <KpiRow>
              <Kpi title="Processos sofridos" value={d.total} hint={ind.data ? `${ind.data.ativos} ativos · ${ind.data.encerrados} encerrados` : undefined} />
              <Kpi title="Valor total das causas" value={fmtMoney(d.valorCausaTotal)} /><Kpi title="Provisão" value={fmtMoney(d.provisaoTotal)} color={COLORS.warn} />
              <Kpi title="Taxa de êxito" value={ind.data?.taxaExito != null ? `${ind.data.taxaExito}%` : "—"} hint={ind.data?.taxaPerda != null ? `perda: ${ind.data.taxaPerda}%` : undefined} />
              <Kpi title="Duração média" value={ind.data?.duracaoMediaDias != null ? `${ind.data.duracaoMediaDias} d` : "—"} /><Kpi title="Total pago" value={fmtMoney(ind.data?.totalPago)} />
            </KpiRow>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Ranking das causas</Typography>
            <DataList rows={d.ranking.map((x: any) => ({ ...x, id: x.causaRaiz }))} columns={[
              { label: "Causa", primary: true, render: (x: any) => <b>{x.rotulo}</b> }, { label: "12 meses", render: (x: any) => x.qtd12m }, { label: "12 meses anteriores", hideOnMobile: true, render: (x: any) => x.qtdAnterior12m },
              { label: "Tendência", render: (x: any) => <Chip size="small" color={x.tendencia === "ALTA" || x.tendencia === "NOVA" ? "error" : x.tendencia === "QUEDA" ? "success" : "default"} label={x.tendencia.toLowerCase()} /> },
              { label: "Recorrente", render: (x: any) => (x.recorrente ? <Chip size="small" color="warning" label="sim" /> : "não") }, { label: "Valor (12 m)", render: (x: any) => fmtMoney(x.valorCausa12m) },
              { label: "Plano ativo", render: (x: any) => (x.comPlanoAtivo ? <Chip size="small" color="success" label="sim" /> : <Chip size="small" color="error" label="não" />) },
            ]} />
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 2 }}>
              <Ranking titulo="Por causa raiz" grupos={d.porCausa} /><Ranking titulo="Por assunto" grupos={d.porAssunto} /><Ranking titulo="Por setor de origem" grupos={d.porSetor} /><Ranking titulo="Por tipo / área" grupos={d.porTipo} />
            </Box>
            {ind.data && <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>Processos distribuídos por mês (12 meses): {ind.data.evolucaoMensal.map((m: any) => `${m.mes.slice(5)}:${m.qtd}`).join(" · ")}</Typography>}
          </>}
        </LoadBox>
      </Section>

      <Section title="Cruzamento">
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 1.5 }}>
          <Pick label="Linhas" value={linhas} onChange={setLinhas} options={DIMS.map(([v, l]) => ({ value: v, label: l }))} minWidth={170} />
          <Pick label="Colunas" value={colunas} onChange={setColunas} options={DIMS.map(([v, l]) => ({ value: v, label: l }))} minWidth={170} />
        </Box>
        <LoadBox loading={cz.loading} error={cz.error} empty={!cz.data?.rows?.length} onRetry={cz.reload}>
          {cz.data && <Box sx={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead><tr><th style={{ textAlign: "left", padding: 6 }}>{nome(cz.data.linhas)} \ {nome(cz.data.colunas)}</th>{cz.data.colunasValores.map((c: string) => <th key={c} style={{ padding: 6, textAlign: "center" }}>{nome(c)}</th>)}<th style={{ padding: 6 }}>Total</th></tr></thead>
              <tbody>{cz.data.rows.map((row: any) => (
                <tr key={row.linha}><td style={{ padding: 6, fontWeight: 700 }}>{nome(row.linha)}</td>
                  {cz.data.colunasValores.map((c: string) => { const q2 = row.celulas[c].qtd; return <td key={c} style={{ padding: 6, textAlign: "center", background: q2 ? `rgba(224,123,0,${Math.min(0.15 + q2 * 0.15, 0.7)})` : undefined }}>{q2 || "·"}</td>; })}
                  <td style={{ padding: 6, textAlign: "center", fontWeight: 800 }}>{row.total}</td></tr>))}</tbody>
            </table>
          </Box>}
        </LoadBox>
      </Section>

      <Section title="Causas prováveis e recomendações de prevenção">
        <LoadBox loading={rec.loading} error={rec.error} empty={!itemsOf(rec.data).length} emptyText="Nenhuma causa recorrente ou em alta no período." onRetry={rec.reload}>
          {itemsOf(rec.data).map((x: any) => (
            <Paper key={x.causaRaiz} variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 1.5 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1, minWidth: 200 }}>{x.rotulo}</Typography>
                <Chip size="small" label={`${x.ocorrencias12m} em 12 meses`} /><Chip size="small" color={x.tendencia === "ALTA" || x.tendencia === "NOVA" ? "error" : "default"} label={x.tendencia.toLowerCase()} />
                {x.precisaPlano ? <Chip size="small" color="error" label="sem plano" /> : <Chip size="small" color="success" label="com plano" />}
              </Box>
              <Typography variant="body2"><b>Causa provável:</b> {x.causaProvavel}</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}><b>Setor mais afetado:</b> {x.setorMaisAfetado ?? "—"}</Typography>
              <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 3 }}>{x.recomendacoes.map((t: string) => <li key={t}><Typography variant="body2">{t}</Typography></li>)}</Box>
              {x.precisaPlano && <Button sx={{ mt: 1 }} variant="outlined" size="small" onClick={() => setNovoPlano({ causaRaiz: x.causaRaiz, titulo: `Prevenção: ${x.rotulo}`, setor: x.setorMaisAfetado ?? "", descricao: x.recomendacoes.join("\n"), prioridade: "ALTA" })}>Criar plano de prevenção</Button>}
            </Paper>
          ))}
          <Alert severity="warning">{rec.data?.aviso} {AVISO_MODELO}</Alert>
        </LoadBox>
      </Section>

      <ResourceTab title="Planos de prevenção" path="/planos-prevencao" fields={PLANO} editFields={PLANO.filter((f) => f.key !== "causaRaiz")} newLabel="Novo plano" refreshKey={rev}
        filters={[{ key: "status", label: "Situação", options: opts(["PLANEJADO", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]) }]} onRowClick={(r) => setAcoes(r)}
        columns={[
          { label: "Plano", primary: true, render: (r) => <><b>{r.titulo}</b><Typography variant="caption" component="div" color="text.secondary">causa: {nome(r.causaRaiz)}</Typography></> },
          { label: "Responsável", render: (r) => r.responsavelNome || "—" }, { label: "Prazo", render: (r) => fmtDate(r.prazo) }, { label: "Prioridade", render: (r) => r.prioridade.toLowerCase() },
          { label: "Ações", render: (r) => `${(r.acoes || []).filter((a: any) => a.status === "CONCLUIDA").length}/${(r.acoes || []).length}` }, { label: "Situação", render: (r) => <Status value={r.status} /> },
        ]}
        rowActions={(r, { run: go }) => [
          { label: "Ações e efetividade", onClick: () => setAcoes(r) },
          { label: "Iniciar", show: r.status === "PLANEJADO", onClick: () => { void go(() => call("POST", `${J}/planos-prevencao/${r.id}/iniciar`), "Plano iniciado."); } },
          { label: "Concluir", show: r.status === "EM_ANDAMENTO", onClick: () => { void go(() => call("POST", `${J}/planos-prevencao/${r.id}/concluir`), "Plano concluído."); } },
          { label: "Cancelar plano", color: "error", show: ["PLANEJADO", "EM_ANDAMENTO"].includes(r.status), onClick: () => { void go(() => call("POST", `${J}/planos-prevencao/${r.id}/cancelar`), "Plano cancelado.", "Cancelar este plano?"); } },
        ]} />
      <PromptDialog open={!!novoPlano} title="Criar plano de prevenção" fields={PLANO} initial={novoPlano ?? undefined} onClose={() => setNovoPlano(null)}
        onSubmit={async (b) => { await call("POST", `${J}/planos-prevencao`, b); setRev((x) => x + 1); }} intro={novoPlano ? <Alert severity="info" sx={{ mb: 2 }}>Causa: <b>{nome(novoPlano.causaRaiz)}</b>. Revise os campos e informe o responsável.</Alert> : undefined} />
      {acoes && <Acoes plano={acoes} onClose={() => { setAcoes(null); setRev((x) => x + 1); }} />}
    </>
  );
}
