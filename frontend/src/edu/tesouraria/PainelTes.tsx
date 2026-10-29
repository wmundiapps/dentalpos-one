import { Alert, Box, Button, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Async, Bars, Panel, Stat, StatGrid, TES, brl, isoDia, num, useApi } from "./tes";

const ORIGENS: Record<string, string> = { FOLHA: "Folha", PROLABORE: "Pró-labore", TERCEIRO: "Terceiros (RPA/PJ)", COMPRA: "Compras", CONTRATO: "Contratos", NOTA_FISCAL: "Notas fiscais", IMPOSTO: "Impostos", MANUAL: "Outras", LEGADO: "Financeiro geral", TRIBUTOS_RETIDOS: "Tributos retidos a recolher" };

function FluxoCaixa() {
  const [de, setDe] = useState(isoDia(-7));
  const [ate, setAte] = useState(isoDia(60));
  const [agrupar, setAgrupar] = useState("semana");
  const st = useApi<any>(`${TES}/relatorios/fluxo?de=${de}&ate=${ate}&agrupar=${agrupar}`);
  return (
    <Panel title="Fluxo de caixa projetado" subtitle="Realizado (bancos e caixa) + previsto (mensalidades líquidas de bolsa, contas a pagar por origem, folha, notas e tributos retidos)"
      actions={
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TextField size="small" type="date" label="De" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="Até" value={ate} onChange={(e) => setAte(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select size="small" label="Agrupar" value={agrupar} onChange={(e) => setAgrupar(e.target.value)} sx={{ minWidth: 110 }}>
            <MenuItem value="dia">Dia</MenuItem><MenuItem value="semana">Semana</MenuItem><MenuItem value="mes">Mês</MenuItem>
          </TextField>
        </Box>
      }>
      <Async state={st}>
        {(f) => (
          <>
            <StatGrid min={150}>
              <Stat label="Saldo inicial" value={brl(f.saldoInicial)} />
              <Stat label="Entradas (real + prev.)" value={brl(f.totais.entradasRealizadas + f.totais.entradasPrevistas)} tone="success" />
              <Stat label="Saídas (real + prev.)" value={brl(f.totais.saidasRealizadas + f.totais.saidasPrevistas)} tone="warning" />
              <Stat label="Saldo projetado" value={brl(f.totais.saldoFinalProjetado)} tone={f.totais.saldoFinalProjetado < 0 ? "error" : "success"} />
              <Stat label="Atrasados" value={`${brl(f.atrasados.receber)} / ${brl(f.atrasados.pagar)}`} hint="a receber / a pagar" tone={f.atrasados.pagar > 0 ? "error" : "default"} />
            </StatGrid>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>Período</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>Entradas realizadas</TableCell><TableCell align="right" sx={{ fontWeight: 800 }}>Saídas realizadas</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>Entradas previstas</TableCell><TableCell align="right" sx={{ fontWeight: 800 }}>Saídas previstas</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>Saldo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {f.buckets.map((b: any) => (
                    <TableRow key={b.chave} hover>
                      <TableCell>{b.chave}</TableCell>
                      <TableCell align="right">{brl(b.entradasRealizadas)}</TableCell><TableCell align="right">{brl(b.saidasRealizadas)}</TableCell>
                      <TableCell align="right">{brl(b.entradasPrevistas)}</TableCell><TableCell align="right">{brl(b.saidasPrevistas)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: b.saldoFinal < 0 ? "error.main" : undefined }}>{brl(b.saldoFinal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mt: 2 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Saídas previstas por origem</Typography>
                <Bars format={brl} items={Object.entries(f.saidasPrevistasPorOrigem || {}).map(([k, v]) => ({ label: ORIGENS[k] || k, value: Number(v), color: k === "TRIBUTOS_RETIDOS" ? "#ed6c02" : undefined }))} empty="Sem saídas previstas no período." />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Fora do caixa (permutas aprovadas)</Typography>
                <Typography variant="body2">Receber (bens/serviços): <b>{brl(f.naoCaixa.permutasAprovadasReceber)}</b></Typography>
                <Typography variant="body2">Pagar (cessões/serviços prestados): <b>{brl(f.naoCaixa.permutasAprovadasPagar)}</b></Typography>
                <Typography variant="caption" color="text.secondary">Permutas não movimentam caixa; entram no DRE ao serem liquidadas.</Typography>
              </Box>
            </Box>
          </>
        )}
      </Async>
    </Panel>
  );
}

function Dre() {
  const [de, setDe] = useState(isoDia(-30));
  const [ate, setAte] = useState(isoDia(0));
  const st = useApi<any>(`${TES}/relatorios/dre?de=${de}&ate=${ate}`);
  const Linha = ({ t, v, forte, neg }: { t: string; v: number; forte?: boolean; neg?: boolean }) => (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.4, borderTop: forte ? 1 : 0, borderColor: "divider", fontWeight: forte ? 800 : 400 }}>
      <Typography variant="body2" sx={{ fontWeight: forte ? 800 : 400 }}>{t}</Typography>
      <Typography variant="body2" sx={{ fontWeight: forte ? 800 : 400, color: neg ? "text.secondary" : undefined, whiteSpace: "nowrap" }}>{neg ? `(${brl(v)})` : brl(v)}</Typography>
    </Box>
  );
  return (
    <Panel title="DRE gerencial (regime de caixa)" subtitle="Inclui permutas, bolsas/descontos como dedução e despesas por origem (folha, terceiros, compras, notas)"
      actions={
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TextField size="small" type="date" label="De" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="Até" value={ate} onChange={(e) => setAte(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
      }>
      <Async state={st}>
        {(d) => (
          <Box sx={{ maxWidth: 640 }}>
            <Linha t="Mensalidades e encargos (bruto)" v={d.receitaBruta.mensalidades} />
            <Linha t="Receitas por permuta (não caixa)" v={d.receitaBruta.permutas} />
            <Linha t="Receita bruta" v={d.receitaBruta.total} forte />
            <Linha t="Bolsas concedidas" v={d.deducoes.bolsas} neg />
            <Linha t="Descontos concedidos" v={d.deducoes.descontos} neg />
            <Linha t="Receita líquida" v={d.receitaLiquida} forte />
            {d.despesas.detalhe.filter((x: any) => x.valor > 0).map((x: any) => <Linha key={x.chave} t={x.rotulo} v={x.valor} neg />)}
            <Linha t="Total de despesas" v={d.despesas.total} forte neg />
            <Linha t="Resultado do período" v={d.resultado} forte />
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
              Tributos retidos na fonte (informativo): INSS {brl(d.informativo.tributosRetidosNaFonte.inss)} · IRRF {brl(d.informativo.tributosRetidosNaFonte.irrf)} · ISS {brl(d.informativo.tributosRetidosNaFonte.iss)} · outros {brl(d.informativo.tributosRetidosNaFonte.outras)}. {d.informativo.observacao}
            </Typography>
          </Box>
        )}
      </Async>
    </Panel>
  );
}

export default function PainelTes({ onGo }: { onGo: (secao: string) => void }) {
  const st = useApi<any>(`${TES}/painel`);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Async state={st}>
        {(p) => (
          <>
            {p.alertas.length > 0 && (
              <Box sx={{ display: "grid", gap: 1 }}>
                {p.alertas.map((a: any, i: number) => (
                  <Alert key={i} severity={a.nivel === "critico" ? "error" : a.nivel === "atencao" ? "warning" : "info"} action={<Button size="small" color="inherit" onClick={() => onGo(a.secao)}>Abrir</Button>}>{a.texto}</Alert>
                ))}
              </Box>
            )}
            <StatGrid>
              <Stat label="Saldo em bancos e caixa" value={brl(p.saldoTotal)} />
              <Stat label="A receber vencido" value={brl(p.receber.vencidos.valor)} hint={`${num(p.receber.vencidos.qtd, 0)} mensalidade(s)`} tone={p.receber.vencidos.qtd ? "error" : "success"} />
              <Stat label="A receber em 7 dias" value={brl(p.receber.proximos7.valor)} hint={`30 dias: ${brl(p.receber.proximos30.valor)}`} />
              <Stat label="Recebido no mês" value={brl(p.receber.recebidoNoMes.valor)} hint={`${num(p.receber.recebidoNoMes.qtd, 0)} baixa(s)`} tone="success" />
              <Stat label="A pagar vencido" value={brl(p.pagar.vencidos.valor)} hint={`${num(p.pagar.vencidos.qtd, 0)} título(s)`} tone={p.pagar.vencidos.qtd ? "error" : "success"} />
              <Stat label="A pagar em 7 dias" value={brl(p.pagar.proximos7.valor)} />
              <Stat label="Pago no mês" value={brl(p.pagar.pagoNoMes.valor)} hint={`${num(p.pagar.pagoNoMes.qtd, 0)} pagamento(s)`} />
              <Stat label="Fila de conferência" value={num(p.fila.aConferir, 0)} hint={`${num(p.fila.aAutorizar, 0)} aguardando autorização`} tone={p.fila.aConferir + p.fila.aAutorizar ? "warning" : "success"} />
              <Stat label="Remessas" value={num(p.remessas.aEnviar, 0)} hint={`${num(p.remessas.aguardandoRetorno, 0)} aguardando retorno`} />
              <Stat label="Extrato a conciliar" value={num(p.conciliacao.itensPendentes, 0)} tone={p.conciliacao.itensPendentes ? "warning" : "success"} />
              <Stat label="Notas pendentes" value={num(p.notas.semVinculo + p.notas.divergentes, 0)} hint={`${p.notas.semVinculo} sem vínculo · ${p.notas.divergentes} divergentes`} />
              <Stat label="Recibos no mês" value={num(p.recibos.emitidosNoMes, 0)} hint={`${p.permutas.emAndamento} permuta(s) em andamento`} />
            </StatGrid>
            <Panel title="Saldos por conta">
              <Bars format={brl} items={p.saldos.map((s: any) => ({ label: s.nome, value: Math.max(0, s.saldo), hint: s.saldo < 0 ? `Saldo negativo: ${brl(s.saldo)}` : undefined, color: s.tipo === "CAIXA" ? "#ed6c02" : undefined }))} empty="Cadastre contas em Bancos e Conciliação." />
            </Panel>
          </>
        )}
      </Async>
      <FluxoCaixa />
      <Dre />
    </Box>
  );
}
