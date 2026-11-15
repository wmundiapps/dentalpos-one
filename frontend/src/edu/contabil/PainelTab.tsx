import { Alert, Box, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { Cartao, Estado, Grade, Indicador, REGIMES, brl, data, pct, tabelaSx, useApi, useContabil } from "./kit";

/** Barras (receita x despesas) dos últimos 12 meses, sem biblioteca de gráficos: legível e acessível. */
function Serie({ serie }: { serie: Array<{ competencia: string; rotulo: string; receita: number; despesas: number }> }) {
  const max = Math.max(1, ...serie.flatMap((s) => [s.receita, s.despesas]));
  return (
    <Box role="img" aria-label="Receitas e despesas dos últimos 12 meses" sx={{ display: "flex", alignItems: "flex-end", gap: { xs: 0.5, sm: 1 }, height: 150, overflowX: "auto", pb: 0.5 }}>
      {serie.map((s) => (
        <Box key={s.competencia} sx={{ flex: "1 0 28px", minWidth: 28, textAlign: "center" }} title={`${s.rotulo}: receita ${brl(s.receita)} · despesas ${brl(s.despesas)}`}>
          <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "2px", height: 120 }}>
            <Box sx={{ width: 10, height: `${Math.max(2, (s.receita / max) * 100)}%`, bgcolor: "success.main", borderRadius: "3px 3px 0 0" }} />
            <Box sx={{ width: 10, height: `${Math.max(2, (s.despesas / max) * 100)}%`, bgcolor: "warning.main", borderRadius: "3px 3px 0 0" }} />
          </Box>
          <Typography variant="caption" sx={{ fontSize: 10 }}>{s.rotulo}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export default function PainelTab({ onIr }: { onIr: (aba: string) => void }) {
  const { empresaId } = useContabil();
  const { data: d, loading, err, reload } = useApi<any>(`/contabil/dashboard${empresaId ? `?empresaId=${empresaId}` : ""}`, [empresaId]);
  const ind = d?.indicadores;
  const nivel = (n: string) => (n === "critico" ? "error" : n === "atencao" ? "warning" : "info");
  return (
    <Estado loading={loading} err={err} onRetry={reload} vazio={!!d && d.empresasAtivas === 0} textoVazio="Nenhuma empresa cadastrada ainda. Use a aba Empresas para cadastrar o primeiro cliente do escritório.">
      {d ? (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Grade>
            <Indicador rotulo="Empresas ativas" valor={d.empresasAtivas} sub={`competência ${d.competencia}`} />
            <Indicador rotulo="Receita do mês" valor={brl(ind.receitaMes)} cor="#2e7d32" />
            <Indicador rotulo="Despesas do mês" valor={brl(ind.despesasMes)} cor="#ed6c02" />
            <Indicador rotulo="Resultado do mês" valor={brl(ind.resultadoMes)} cor={ind.resultadoMes >= 0 ? "#2e7d32" : "#d32f2f"} />
            <Indicador rotulo="A receber" valor={brl(ind.aReceber.total)} sub={`${brl(ind.aReceber.vencido)} vencido (${ind.aReceber.vencidoQuantidade})`} cor="#0288d1" />
            <Indicador rotulo="A pagar" valor={brl(ind.aPagar.total)} sub={`${brl(ind.aPagar.vencido)} vencido (${ind.aPagar.vencidoQuantidade})`} cor="#9c27b0" />
            <Indicador rotulo="Guias pendentes (simuladas)" valor={brl(ind.guiasPendentes.total)} sub={`${ind.guiasPendentes.quantidade} guia(s), ${ind.guiasPendentes.atrasadas} atrasada(s)`} cor={ind.guiasPendentes.atrasadas ? "#d32f2f" : "#ed6c02"} />
            <Indicador rotulo="Extrato a conciliar" valor={ind.extratoPendente} sub={`${ind.notasMes.quantidade} nota(s) no mês · ${brl(ind.notasMes.valor)}`} />
          </Grade>

          <Cartao titulo="Alertas">
            {d.alertas.length ? (
              <Box sx={{ display: "grid", gap: 1 }}>
                {d.alertas.map((a: any, i: number) => (
                  <Alert key={i} severity={nivel(a.nivel) as any} variant="outlined">{a.empresa ? <strong>{a.empresa}: </strong> : null}{a.texto}</Alert>
                ))}
              </Box>
            ) : <Typography color="text.secondary">Nenhum alerta no momento.</Typography>}
          </Cartao>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1.2fr 1fr" } }}>
            <Cartao titulo="Receitas x despesas (12 meses)" acao={<Box sx={{ display: "flex", gap: 1 }}><Chip size="small" color="success" label="Receita" /><Chip size="small" color="warning" label="Despesas" /></Box>}>
              <Serie serie={d.serie} />
            </Cartao>
            <Cartao titulo="Próximos vencimentos (30 dias)" acao={<Chip size="small" color="warning" variant="outlined" label="guias simuladas" />}>
              {d.proximosVencimentos.length ? (
                <TableContainer sx={tabelaSx}>
                  <Table size="small"><TableHead><TableRow><TableCell>Vence</TableCell><TableCell>Empresa</TableCell><TableCell>Tributo</TableCell><TableCell align="right">Valor</TableCell></TableRow></TableHead>
                    <TableBody>{d.proximosVencimentos.slice(0, 8).map((v: any) => (
                      <TableRow key={v.id} hover sx={{ cursor: "pointer" }} onClick={() => onIr("guias")}><TableCell>{data(v.vencimento)} <Typography component="span" variant="caption" color={v.dias <= 3 ? "error" : "text.secondary"}>({v.dias}d)</Typography></TableCell><TableCell>{v.empresa}</TableCell><TableCell>{v.tributo}</TableCell><TableCell align="right">{brl(v.valor)}</TableCell></TableRow>
                    ))}</TableBody></Table>
                </TableContainer>
              ) : <Typography color="text.secondary">Nenhuma guia a vencer nos próximos 30 dias. Gere as guias na aba Guias e obrigações.</Typography>}
            </Cartao>
          </Box>

          <Cartao titulo="Empresas atendidas (12 meses)">
            <TableContainer sx={tabelaSx}>
              <Table size="small"><TableHead><TableRow><TableCell>Empresa</TableCell><TableCell>Regime</TableCell><TableCell align="right">Receita 12m</TableCell><TableCell align="right">Resultado 12m</TableCell></TableRow></TableHead>
                <TableBody>{d.empresas.map((e: any) => (
                  <TableRow key={e.id} hover><TableCell>{e.razaoSocial}</TableCell><TableCell>{REGIMES[e.regimeAtual] ?? e.regimeAtual}</TableCell><TableCell align="right">{brl(e.receita12m)}</TableCell><TableCell align="right" sx={{ color: e.resultado12m < 0 ? "error.main" : undefined }}>{brl(e.resultado12m)}{e.receita12m ? <Typography component="span" variant="caption" color="text.secondary"> ({pct((e.resultado12m / e.receita12m) * 100, 0)})</Typography> : null}</TableCell></TableRow>
                ))}</TableBody></Table>
            </TableContainer>
          </Cartao>
          <Typography variant="caption" color="text.secondary">Valores calculados a partir dos lançamentos e do histórico informado. Tabelas fiscais versão {d.versaoTabelas} (referência — precisam ser conferidas).</Typography>
        </Box>
      ) : null}
    </Estado>
  );
}
