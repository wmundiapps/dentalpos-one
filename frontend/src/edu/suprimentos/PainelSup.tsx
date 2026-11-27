import { Box, Typography } from "@mui/material";
import { Async, Bars, Panel, Stat, StatGrid, brl, num, pct, useApi } from "../infraestrutura/kit";

export default function PainelSup() {
  const dash = useApi<any>("/suprimentos/dashboard");
  const gasto = useApi<any>("/suprimentos/relatorios/gasto");
  const eco = useApi<any>("/suprimentos/relatorios/economia-cotacoes");
  const prazo = useApi<any>("/suprimentos/relatorios/prazo-entrega");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Async state={dash}>
        {(d) => (
          <StatGrid>
            <Stat label="Requisições aguardando aprovação" value={num(d.requisicoesAguardandoAprovacao, 0)} tone={d.requisicoesAguardandoAprovacao ? "warning" : "success"} />
            <Stat label="Cotações abertas" value={num(d.cotacoesAbertas, 0)} />
            <Stat label="Pedidos em aberto" value={num(d.pedidosEmAberto, 0)} hint={`${num(d.pedidosAtrasados, 0)} atrasado(s)`} tone={d.pedidosAtrasados ? "error" : "default"} />
            <Stat label="Contratos vencendo (90 dias)" value={num(d.contratosVencendo90d, 0)} tone={d.contratosVencendo90d ? "warning" : "success"} />
            <Stat label="Certidões a vencer (30 dias)" value={num(d.documentosFornecedorVencendo30d, 0)} tone={d.documentosFornecedorVencendo30d ? "warning" : "success"} />
            <Stat label="Valor em estoque" value={brl(d.valorEstoque)} />
            <Stat label="Itens abaixo do mínimo" value={num(d.itensAbaixoDoMinimo, 0)} tone={d.itensAbaixoDoMinimo ? "error" : "success"} />
          </StatGrid>
        )}
      </Async>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <Panel title="Gasto por categoria" subtitle="Compras recebidas (últimos 180 dias)">
          <Async state={gasto}>{(g) => (<><Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>{brl(g.total)}</Typography><Bars format={brl} items={(g.porCategoria || []).slice(0, 8).map((c: any) => ({ label: c.chave, value: c.valor }))} /></>)}</Async>
        </Panel>
        <Panel title="Gasto por fornecedor">
          <Async state={gasto}>{(g) => <Bars format={brl} items={(g.porFornecedor || []).slice(0, 8).map((c: any) => ({ label: c.fornecedor || c.chave, value: c.valor, color: "#7b1fa2" }))} />}</Async>
        </Panel>
        <Panel title="Economia nas cotações" subtitle="Diferença entre o valor de referência e o contratado">
          <Async state={eco}>
            {(e) => (
              <>
                <StatGrid min={130}>
                  <Stat label="Economia" value={brl(e.economiaTotal)} tone="success" /><Stat label="% sobre referência" value={pct(e.percentual)} /><Stat label="Cotações" value={num(e.cotacoes, 0)} />
                </StatGrid>
                <Bars format={brl} items={Object.entries(e.porMes || {}).map(([m, v]) => ({ label: m, value: Number(v), color: "#2e7d32" }))} empty="Sem cotações encerradas no período." />
              </>
            )}
          </Async>
        </Panel>
        <Panel title="Prazo de entrega por fornecedor" subtitle="Pedidos recebidos no período">
          <Async state={prazo}>
            {(p) => (
              <>
                <Typography variant="body2" sx={{ mb: 1 }}>Prazo médio geral: <b>{p.prazoMedioDias == null ? "—" : `${num(p.prazoMedioDias)} dia(s)`}</b> · {p.pedidos} pedido(s)</Typography>
                <Bars format={(v) => `${num(v)} d`} items={(p.porFornecedor || []).slice(0, 8).map((f: any) => ({ label: f.fornecedor, value: f.prazoMedioDias, hint: f.pontualidade == null ? undefined : `Pontualidade ${num(f.pontualidade, 0)}%`, color: "#ed6c02" }))} />
              </>
            )}
          </Async>
        </Panel>
      </Box>
    </Box>
  );
}
