import { Alert, Box, Button, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { Fragment, useState } from "react";
import { C, Cartao, Estado, ExigeEmpresa, Grade, Indicador, REGIMES, api, brl, comp, numero, pct, tabelaSx, useAcao, useApi, useContabil } from "./kit";

function Historico({ empresaId }: { empresaId: string }) {
  const { pode } = useContabil();
  const { data: h, loading, err, reload } = useApi<any>(`${C}/empresas/${empresaId}/historico?ate=${comp(0)}`, [empresaId]);
  const [ed, setEd] = useState<any | null>(null);
  const { rodar, aviso, ocupado } = useAcao();
  const salvar = async () => {
    const corpo = { receitaBruta: numero(ed.receitaBruta), despesas: numero(ed.despesas), folha: numero(ed.folha || "0"), comprasInsumos: numero(ed.comprasInsumos || "0"), irrfRetido: numero(ed.irrfRetido || "0") };
    if ([corpo.receitaBruta, corpo.despesas, corpo.folha, corpo.comprasInsumos, corpo.irrfRetido].some((x) => !Number.isFinite(x) || x < 0)) return;
    if (await rodar(() => api.put(`${C}/empresas/${empresaId}/historico/${ed.competencia}`, corpo), "Mês salvo.")) { setEd(null); reload(); }
  };
  return (
    <Cartao titulo="Histórico dos últimos 12 meses" acao={<Typography variant="caption" color="text.secondary">Fonte: informado manualmente, lançamentos contábeis ou notas</Typography>}>
      {aviso}
      <Estado loading={loading} err={err} onRetry={reload}>
        {h ? (
          <TableContainer sx={tabelaSx}>
            <Table size="small"><TableHead><TableRow><TableCell>Mês</TableCell><TableCell align="right">Receita</TableCell><TableCell align="right">Despesas</TableCell><TableCell align="right">Folha</TableCell><TableCell align="right">Compras/insumos</TableCell><TableCell>Fonte</TableCell>{pode("empresa.escrever") ? <TableCell /> : null}</TableRow></TableHead>
              <TableBody>{h.meses.map((m: any) => (
                <TableRow key={m.competencia} hover><TableCell>{m.competencia}</TableCell><TableCell align="right">{brl(m.receitaBruta)}</TableCell><TableCell align="right">{brl(m.despesas)}</TableCell><TableCell align="right">{brl(m.folha)}</TableCell><TableCell align="right">{brl(m.comprasInsumos)}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={m.fonte.toLowerCase()} /></TableCell>
                  {pode("empresa.escrever") ? <TableCell><Button size="small" onClick={() => setEd({ competencia: m.competencia, receitaBruta: String(m.receitaBruta).replace(".", ","), despesas: String(m.despesas).replace(".", ","), folha: String(m.folha).replace(".", ","), comprasInsumos: String(m.comprasInsumos).replace(".", ","), irrfRetido: String(m.irrfRetido).replace(".", ",") })}>Informar</Button></TableCell> : null}
                </TableRow>
              ))}</TableBody></Table>
          </TableContainer>
        ) : null}
      </Estado>
      <Dialog open={!!ed} onClose={() => setEd(null)} fullWidth maxWidth="xs">
        <DialogTitle>Valores de {ed?.competencia}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          {([["receitaBruta", "Receita bruta (R$)"], ["despesas", "Despesas totais (R$)"], ["folha", "Folha de pagamento bruta (R$)"], ["comprasInsumos", "Compras e insumos (R$)"], ["irrfRetido", "IRRF retido (R$)"]] as const).map(([k, rot]) => (
            <TextField key={k} label={rot} value={ed?.[k] ?? ""} onChange={(e) => setEd((x: any) => ({ ...x, [k]: e.target.value }))} error={ed && ed[k] !== "" && !(numero(ed[k]) >= 0)} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
          ))}
          <Typography variant="caption" color="text.secondary">Os valores informados substituem, para este mês, o que seria derivado dos lançamentos.</Typography>
        </DialogContent>
        <DialogActions><Button onClick={() => setEd(null)}>Cancelar</Button><Button variant="contained" onClick={salvar} disabled={ocupado}>Salvar</Button></DialogActions>
      </Dialog>
    </Cartao>
  );
}

function Resultado({ r, empresa, onAplicar }: { r: any; empresa: any; onAplicar: (regime: string) => void }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const { pode } = useContabil();
  const min = Math.min(...r.regimes.filter((x: any) => x.elegivel).map((x: any) => x.totalAnual));
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Alert severity="warning" variant="outlined"><strong>É uma estimativa.</strong> {r.ressalvas.join(" ")} Tabelas versão <strong>{r.versaoTabelas}</strong>: {r.situacaoTabelas}</Alert>
      <Grade min={170}>
        <Indicador rotulo="Receita (12 meses)" valor={brl(r.resumo.receitaAnual)} sub={`${r.resumo.mesesComDados} mês(es) com dados${r.resumo.anualizado ? " — anualizado" : ""}`} />
        <Indicador rotulo="Despesas (12 meses)" valor={brl(r.resumo.despesasAnual)} />
        <Indicador rotulo="Folha / fator R" valor={brl(r.resumo.folhaAnual)} sub={r.resumo.fatorRPct == null ? "—" : `fator R ${pct(r.resumo.fatorRPct)}`} />
        <Indicador rotulo="Regime recomendado" valor={r.recomendado ? REGIMES[r.recomendado] : "—"} sub={r.economiaVsAtual != null && r.recomendado && r.recomendado !== empresa?.regimeAtual ? `economia estimada de ${brl(r.economiaVsAtual)}/ano vs. ${REGIMES[empresa?.regimeAtual] ?? ""}` : r.recomendado ? "já é o regime atual" : undefined} cor="#2e7d32" />
      </Grade>
      {r.alertas.map((a: any, i: number) => <Alert key={i} severity={a.nivel === "critico" ? "error" : a.nivel === "atencao" ? "warning" : "info"}>{a.texto}</Alert>)}
      <TableContainer sx={tabelaSx}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Regime</TableCell><TableCell align="right">Carga anual estimada</TableCell><TableCell align="right">% da receita</TableCell><TableCell>Situação</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>{r.regimes.map((x: any) => (
            <Fragment key={x.regime}>
              <TableRow hover selected={x.regime === r.recomendado}>
                <TableCell><strong>{x.nome}</strong>{x.anexo ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Anexo {x.anexo}</Typography> : null}</TableCell>
                <TableCell align="right" sx={{ fontWeight: x.elegivel && x.totalAnual === min ? 800 : 400 }}>{brl(x.totalAnual)}</TableCell>
                <TableCell align="right">{x.cargaEfetivaPct == null ? "—" : pct(x.cargaEfetivaPct)}</TableCell>
                <TableCell>{x.regime === r.recomendado ? <Chip size="small" color="success" label="menor carga" /> : null} {!x.elegivel ? <Chip size="small" color="error" variant="outlined" label="inelegível" /> : null} {x.regime === empresa?.regimeAtual ? <Chip size="small" label="atual" /> : null}</TableCell>
                <TableCell><Button size="small" onClick={() => setAberto(aberto === x.regime ? null : x.regime)}>{aberto === x.regime ? "Ocultar cálculo" : "Memória de cálculo"}</Button>{pode("empresa.escrever") && x.elegivel && x.regime !== empresa?.regimeAtual ? <Button size="small" onClick={() => onAplicar(x.regime)}>Registrar regime</Button> : null}</TableCell>
              </TableRow>
              <TableRow><TableCell colSpan={5} sx={{ py: 0, border: aberto === x.regime ? undefined : 0 }}>
                <Collapse in={aberto === x.regime} unmountOnExit>
                  <Box sx={{ py: 1.5 }}>
                    {x.motivos.map((m: string, i: number) => <Alert key={i} severity="warning" sx={{ mb: 1 }}>{m}</Alert>)}
                    <TableContainer sx={tabelaSx}><Table size="small"><TableHead><TableRow><TableCell>Tributo</TableCell><TableCell align="right">Base</TableCell><TableCell align="right">Alíquota</TableCell><TableCell align="right">Valor/ano</TableCell></TableRow></TableHead>
                      <TableBody>{x.tributos.map((t: any, i: number) => <TableRow key={i}><TableCell>{t.nome}{t.obs ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{t.obs}</Typography> : null}</TableCell><TableCell align="right">{brl(t.base)}</TableCell><TableCell align="right">{t.aliquotaPct == null ? "—" : pct(t.aliquotaPct)}</TableCell><TableCell align="right">{brl(t.valor)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
                    <Typography variant="subtitle2" sx={{ mt: 1.5 }}>Memória de cálculo</Typography>
                    <Box component="ol" sx={{ m: 0, pl: 3, "& li": { fontSize: 13, mb: 0.5 } }}>{x.memoria.map((m: string, i: number) => <li key={i}>{m}</li>)}</Box>
                  </Box>
                </Collapse>
              </TableCell></TableRow>
            </Fragment>
          ))}</TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function Simulador({ empresaId, empresa, onAplicado }: { empresaId: string; empresa: any; onAplicado: () => void }) {
  const [res, setRes] = useState<any>(null);
  const [iss, setIss] = useState("");
  const [icms, setIcms] = useState("");
  const { rodar, aviso, ocupado } = useAcao();
  const { pode } = useContabil();
  const [motivo, setMotivo] = useState<{ regime: string; texto: string } | null>(null);
  const simular = () => rodar(async () => {
    const corpo: any = {};
    if (iss) corpo.issAliquota = numero(iss);
    if (icms) corpo.icmsAliquota = numero(icms);
    setRes(await api.post(`${C}/empresas/${empresaId}/regime/simular`, corpo));
  });
  return (
    <Cartao titulo="Recomendador de regime tributário" acao={<Chip size="small" color="warning" variant="outlined" label="ESTIMATIVA" sx={{ fontWeight: 800 }} />}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Compara MEI, Simples Nacional (anexos I–V e fator R), Lucro Presumido e Lucro Real com base nos últimos 12 meses de receita e despesa e na atividade (CNAE) da empresa.</Typography>
      {aviso}
      {pode("regime.simular") ? (
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
          <TextField size="small" label="ISS do município (%)" value={iss} onChange={(e) => setIss(e.target.value)} sx={{ width: 170 }} helperText="vazio = cadastro da empresa" />
          <TextField size="small" label="ICMS efetivo (%)" value={icms} onChange={(e) => setIcms(e.target.value)} sx={{ width: 170 }} helperText="vazio = 18% (referência)" />
          <Button variant="contained" onClick={simular} disabled={ocupado} sx={{ alignSelf: "flex-start" }}>Simular e comparar regimes</Button>
        </Box>
      ) : <Alert severity="info" sx={{ mb: 2 }}>Seu papel permite consultar, mas não rodar novas simulações.</Alert>}
      {res ? <Resultado r={res} empresa={res.empresa ?? empresa} onAplicar={(regime) => setMotivo({ regime, texto: "" })} /> : <Typography color="text.secondary">Clique em “Simular” para ver a comparação.</Typography>}
      <Dialog open={!!motivo} onClose={() => setMotivo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Registrar regime: {motivo ? REGIMES[motivo.regime] : ""}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>Isto apenas registra o regime NESTE sistema. A opção/alteração junto à Receita, estado e prefeitura é feita pelo contador, nos prazos legais (em geral em janeiro).</Alert>
          <TextField fullWidth multiline minRows={2} label="Motivo (obrigatório, vai para a auditoria)" value={motivo?.texto ?? ""} onChange={(e) => setMotivo((m) => (m ? { ...m, texto: e.target.value } : m))} />
        </DialogContent>
        <DialogActions><Button onClick={() => setMotivo(null)}>Cancelar</Button><Button variant="contained" disabled={(motivo?.texto.trim().length ?? 0) < 10} onClick={async () => { if (await rodar(() => api.post(`${C}/empresas/${empresaId}/regime/aplicar`, { regime: motivo!.regime, motivo: motivo!.texto }), "Regime registrado.")) { setMotivo(null); onAplicado(); } }}>Registrar</Button></DialogActions>
      </Dialog>
    </Cartao>
  );
}

export default function RegimeTab() {
  const { recarregarEmpresas } = useContabil();
  return (
    <ExigeEmpresa>
      {(id, empresa) => (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Simulador key={id} empresaId={id} empresa={empresa} onAplicado={recarregarEmpresas} />
          <Historico empresaId={id} />
        </Box>
      )}
    </ExigeEmpresa>
  );
}
