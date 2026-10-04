import { Box, Typography } from "@mui/material";
import { Async, Bars, Light, Panel, ProgressBar, Stat, StatGrid, brl, num, pct, useApi } from "./kit";

const PRIO_COR: Record<string, string> = { URGENTE: "#d32f2f", ALTA: "#ed6c02", MEDIA: "#0288d1", BAIXA: "#9e9e9e" };

export default function PainelTab() {
  const ind = useApi<any>("/infraestrutura/indicadores");
  const proj = useApi<any>("/infraestrutura/projetos/painel");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Async state={ind}>
        {(d) => {
          const sla = d.slaCumpridoPct;
          const disp = d.disponibilidadeAtivosPct;
          return (
            <>
              <StatGrid>
                <Stat label="Bens ativos" value={num(d.bensAtivos, 0)} />
                <Stat label="OS em aberto" value={num(d.backlog?.osAbertas, 0)} hint={`Idade média ${num(d.backlog?.idadeMediaDias)} dia(s)`} />
                <Stat label="OS com SLA vencido" value={num(d.backlog?.vencidasSla, 0)} tone={d.backlog?.vencidasSla > 0 ? "error" : "success"} />
                <Stat label="SLA cumprido" value={pct(sla)} tone={sla === null || sla === undefined ? "default" : sla >= 80 ? "success" : sla >= 60 ? "warning" : "error"} />
                <Stat label="MTTR" value={d.mttrHoras === null || d.mttrHoras === undefined ? "—" : `${num(d.mttrHoras)} h`} hint="Tempo médio de reparo" />
                <Stat label="Disponibilidade dos ativos" value={pct(disp)} tone={disp === null || disp === undefined ? "default" : disp >= 95 ? "success" : "warning"} />
                <Stat label="Custo de manutenção" value={brl(d.custoManutencao?.total)} hint={`Custo/m²: ${brl(d.custoManutencao?.custoPorM2)}`} />
                <Stat label="Preventivas" value={pct(d.preventivaPct)} hint="Parcela das OS do período" />
              </StatGrid>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                <Panel title="Backlog por prioridade" subtitle="OS abertas agrupadas por prioridade">
                  <Bars items={Object.entries(d.backlog?.porPrioridade || {}).map(([k, v]) => ({ label: k, value: Number(v), color: PRIO_COR[k] }))} empty="Nenhuma OS em aberto." />
                </Panel>
                <Panel title="Chamados no período">
                  <Box sx={{ display: "grid", gap: 1 }}>
                    <Typography variant="body2">Abertos: <b>{num(d.chamados?.abertosNoPeriodo, 0)}</b> · Resolvidos: <b>{num(d.chamados?.resolvidos, 0)}</b></Typography>
                    <ProgressBar value={d.chamados?.abertosNoPeriodo ? (d.chamados.resolvidos / d.chamados.abertosNoPeriodo) * 100 : 0} color="success" />
                    <Typography variant="body2">Tempo médio de resolução: <b>{d.chamados?.tempoMedioResolucaoHoras === null || d.chamados?.tempoMedioResolucaoHoras === undefined ? "—" : `${num(d.chamados.tempoMedioResolucaoHoras)} h`}</b></Typography>
                    <Typography variant="body2">Satisfação média: <b>{d.chamados?.satisfacaoMedia === null || d.chamados?.satisfacaoMedia === undefined ? "—" : `${num(d.chamados.satisfacaoMedia)} / 5`}</b></Typography>
                  </Box>
                </Panel>
                <Panel title="Bens com mais corretivas" subtitle="Reincidência no período">
                  <Bars items={(d.reincidencia || []).map((b: any) => ({ label: `${b.tombamento} — ${b.descricao}`, value: b.corretivas, color: "#d32f2f" }))} empty="Sem reincidência registrada." />
                </Panel>
                <Panel title="Espaços com maior custo por m²">
                  <Bars format={brl} items={(d.custoManutencao?.espacosMaisCaros || []).map((e: any) => ({ label: e.nome, value: e.custoPorM2 || 0, hint: `${brl(e.custo)} em ${num(e.areaM2, 0)} m²` }))} empty="Sem custos por espaço." />
                </Panel>
              </Box>
            </>
          );
        }}
      </Async>
      <Async state={proj}>
        {(p) => (
          <Panel title="Melhorias e projetos" subtitle="Visão consolidada da carteira 5W2H">
            <StatGrid>
              <Stat label="Projetos" value={num(p.total, 0)} />
              <Stat label="Execução média" value={pct(p.execucaoMediaPct)} />
              <Stat label="Orçamento" value={brl(p.orcamentoTotal)} hint={`Gasto ${brl(p.gastoTotal)}`} />
              <Stat label="Vinculados ao PDI / MEC" value={`${num(p.vinculadosPdi, 0)} / ${num(p.vinculadosMec, 0)}`} />
            </StatGrid>
            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              <Light tone={p.atrasados?.length ? "error" : "success"} text={`${p.atrasados?.length || 0} projeto(s) atrasado(s)`} />
              <Light tone={p.estouroOrcamento?.length ? "warning" : "success"} text={`${p.estouroOrcamento?.length || 0} com estouro de orçamento`} />
            </Box>
          </Panel>
        )}
      </Async>
    </Box>
  );
}
