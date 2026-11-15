import { Box, Button, Typography } from "@mui/material";
import { Async, Bars, Empty, Panel, Stat, StatGrid, brl, fmtDate, num, useApi } from "./host";
import { C } from "./kit";

/** Painel do escritório: KPIs, série de 6 meses e alertas do dia. */
export default function PainelTab({ onGo }: { onGo: (aba: string, extra?: Record<string, string>) => void }) {
  const st = useApi<any>(`${C}/dashboard`);
  return (
    <Async state={st}>
      {(d) => {
        const k = d.kpis;
        return (
          <>
            <StatGrid>
              <Stat label="Clientes ativos" value={num(k.clientesAtivos, 0)} hint={`${k.prospectos} prospecto(s) · ${k.suspensos} suspenso(s)`} />
              <Stat label="Receita recorrente (MRR)" value={brl(k.mrr)} hint={k.mrrVariacaoPct === null ? "sem comparação" : `${k.mrrVariacaoPct >= 0 ? "+" : ""}${num(k.mrrVariacaoPct, 1)}% vs. mês anterior`} tone="success" />
              <Stat label="Inadimplência" value={brl(k.inadimplenciaValor)} hint={`${num(k.inadimplenciaPct, 1)}% do emitido`} tone={k.inadimplenciaValor > 0 ? "error" : "default"} />
              <Stat label="Tarefas atrasadas" value={num(k.tarefasAtrasadas, 0)} hint={`${k.tarefasAbertas} em aberto`} tone={k.tarefasAtrasadas > 0 ? "warning" : "default"} />
              <Stat label="Guias a vencer (7 dias)" value={num(k.guiasAVencerSemana, 0)} hint={`${k.guiasVencidas} vencida(s)`} tone={k.guiasVencidas > 0 ? "error" : "default"} />
              <Stat label="Leads em andamento" value={num(k.leadsEmAndamento, 0)} hint={`${k.propostasAbertas} proposta(s) aberta(s)`} />
              <Stat label="Clientes em risco" value={num(k.clientesEmRisco, 0)} tone={k.clientesEmRisco > 0 ? "warning" : "default"} />
              <Stat label="NPS" value={k.nps === null ? "—" : num(k.nps, 0)} hint={`churn 12 meses: ${k.churn12mPct === null ? "—" : num(k.churn12mPct, 1) + "%"}`} />
            </StatGrid>
            {d.fiscal?.simulado ? <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>Guias vêm da camada local (módulo fiscal não conectado{d.fiscal.degradado ? " ou indisponível" : ""}): valores lançados manualmente.</Typography> : null}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
              <Panel title="Receita recorrente e honorários" subtitle="Últimos 6 meses">
                <Bars items={d.serie.map((s: any) => ({ label: s.competencia, value: s.mrr, hint: `emitido ${brl(s.emitido)} · recebido ${brl(s.recebido)}` }))} format={(v) => brl(v)} />
              </Panel>
              <Panel title="Clientes por regime" actions={<Button size="small" onClick={() => onGo("relatorios")}>Relatórios</Button>}>
                <Bars items={d.porRegime.map((r: any) => ({ label: r.regime, value: r.total }))} />
              </Panel>
              <Panel title="Tarefas atrasadas" actions={<Button size="small" onClick={() => onGo("tarefas", { f: "atrasadas" })}>Ver todas</Button>}>
                {d.alertas.tarefasAtrasadas.length ? d.alertas.tarefasAtrasadas.map((t: any) => (
                  <Typography key={t.id} variant="body2" sx={{ py: 0.4 }}><b>{t.cliente}</b> — {t.titulo} <Typography component="span" variant="caption" color="error.main">({t.diasAtraso} dia(s))</Typography></Typography>
                )) : <Empty text="Nenhuma tarefa atrasada." />}
              </Panel>
              <Panel title="Guias a vencer / vencidas" actions={<Button size="small" onClick={() => onGo("tarefas", { v: "calendario" })}>Calendário</Button>}>
                {d.alertas.guias.length ? d.alertas.guias.map((g: any) => (
                  <Typography key={g.id} variant="body2" sx={{ py: 0.4 }}><b>{g.cliente}</b> — {g.tipo} {brl(g.valor)} · vence {fmtDate(g.vencimento)}</Typography>
                )) : <Empty text="Nenhuma guia nos próximos 7 dias." />}
              </Panel>
              <Panel title="Lembretes de contato">
                {d.alertas.lembretes.length ? d.alertas.lembretes.map((l: any) => <Typography key={l.id} variant="body2" sx={{ py: 0.4 }}><b>{l.cliente}</b> — {l.assunto || "retornar contato"} · {fmtDate(l.lembreteEm)}</Typography>) : <Empty text="Sem lembretes pendentes." />}
              </Panel>
              <Panel title="Aniversários de empresa (7 dias)">
                {d.alertas.aniversarios.length ? d.alertas.aniversarios.map((a: any) => <Typography key={a.clienteId} variant="body2" sx={{ py: 0.4 }}>{a.cliente}</Typography>) : <Empty text="Nenhum aniversário nesta semana." />}
              </Panel>
            </Box>
          </>
        );
      }}
    </Async>
  );
}
