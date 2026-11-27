import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tab, Tabs, TextField, Typography } from "@mui/material";
import { Fragment, useState } from "react";
import { C, Cartao, Estado, ExigeEmpresa, Grade, Indicador, Situacao, SimulacaoChip, abrirImprimivel, api, brl, comp, data, isoDia, tabelaSx, useAcao, useApi, useContabil } from "./kit";

const NIVEL: Record<string, "error" | "warning" | "info" | "success"> = { critico: "error", atencao: "warning", info: "info" };

function Calendario({ empresaId, onGerar }: { empresaId: string; onGerar: (competencia: string) => void }) {
  const { data: d, loading, err, reload } = useApi<any>(`${C}/calendario?empresaId=${empresaId}&de=${isoDia(-45)}&ate=${isoDia(75)}`, [empresaId]);
  return (
    <Cartao titulo="Calendário de vencimentos" acao={<Chip size="small" color="warning" variant="outlined" label="datas de referência — confira" />}>
      <Estado loading={loading} err={err} onRetry={reload} vazio={!!d && !d.items.length} textoVazio="Nenhuma obrigação prevista no período (a empresa ainda não tem movimento).">
        {d ? (
          <>
            <Grade min={150}>
              <Indicador rotulo="Atrasadas" valor={d.resumo.atrasadas} cor={d.resumo.atrasadas ? "#d32f2f" : undefined} />
              <Indicador rotulo="Vencem em 7 dias" valor={d.resumo.proximos7dias} cor="#ed6c02" />
              <Indicador rotulo="A gerar" valor={d.resumo.aGerar} />
              <Indicador rotulo="Pagas" valor={d.resumo.pagas} cor="#2e7d32" />
            </Grade>
            <TableContainer sx={{ ...tabelaSx, mt: 1.5 }}>
              <Table size="small"><TableHead><TableRow><TableCell>Vencimento</TableCell><TableCell>Tributo</TableCell><TableCell>Competência</TableCell><TableCell>Situação</TableCell><TableCell>Aviso</TableCell><TableCell align="right">Valor</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>{d.items.map((i: any, k: number) => (
                  <TableRow key={k} hover>
                    <TableCell>{data(i.vencimento)}</TableCell><TableCell>{i.nomeTributo.replace(' (não confundir com "corona")', "")}</TableCell><TableCell>{i.competencia}{i.periodicidade === "TRIMESTRAL" ? " (tri)" : ""}</TableCell>
                    <TableCell><Situacao v={i.status} /></TableCell>
                    <TableCell>{i.nivel ? <Chip size="small" color={NIVEL[i.nivel]} variant={i.status === "PAGA" ? "outlined" : "filled"} label={i.aviso} /> : i.aviso}</TableCell>
                    <TableCell align="right">{brl(i.valor)}</TableCell>
                    <TableCell>{i.status === "A_GERAR" || (i.status === "ATRASADA" && !i.guiaId) ? <Button size="small" onClick={() => onGerar(i.competencia)}>Gerar</Button> : null}</TableCell>
                  </TableRow>
                ))}</TableBody></Table>
            </TableContainer>
            <Typography variant="caption" color="text.secondary">{d.aviso}</Typography>
          </>
        ) : null}
      </Estado>
    </Cartao>
  );
}

function Guias({ empresaId, refresh, onMudou }: { empresaId: string; refresh: number; onMudou: () => void }) {
  const { pode } = useContabil();
  const [st, setSt] = useState("");
  const { data: d, loading, err, reload } = useApi<any>(`${C}/guias?empresaId=${empresaId}&pageSize=100${st ? `&status=${st}` : ""}`, [empresaId, st, refresh]);
  const [sel, setSel] = useState<any | null>(null);
  const [pagar, setPagar] = useState<any | null>(null);
  const [pagoEm, setPagoEm] = useState(isoDia());
  const { rodar, aviso, ocupado } = useAcao();
  return (
    <Cartao titulo="Guias geradas (SIMULAÇÃO)" acao={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}><Button variant="outlined" onClick={() => void rodar(() => abrirImprimivel(`/guias-relatorio?empresaId=${empresaId}`))}>Relatório imprimível</Button></Box>}>
      {aviso}
      <TextField select size="small" label="Situação" value={st} onChange={(e) => setSt(e.target.value)} sx={{ mb: 1.5, minWidth: 160 }} slotProps={{ inputLabel: { shrink: true }, select: { native: true } }}>
        <option value="">Todas</option><option value="PENDENTE">Pendentes</option><option value="ATRASADA">Atrasadas</option><option value="PAGA">Pagas</option><option value="CANCELADA">Canceladas</option>
      </TextField>
      <Estado loading={loading} err={err} onRetry={reload} vazio={!!d && !d.items.length} textoVazio="Nenhuma guia gerada. Use “Gerar guias do mês” para calcular a partir dos lançamentos.">
        {d ? (
          <TableContainer sx={tabelaSx}>
            <Table size="small"><TableHead><TableRow><TableCell>Vencimento</TableCell><TableCell>Tributo</TableCell><TableCell>Competência</TableCell><TableCell align="right">Principal</TableCell><TableCell align="right">Multa+juros</TableCell><TableCell align="right">Total</TableCell><TableCell>Situação</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>{d.items.map((g: any) => (
                <TableRow key={g.id} hover>
                  <TableCell>{data(g.vencimento)}</TableCell><TableCell><strong>{g.tributo.replace(/_/g, " ")}</strong> <Typography component="span" variant="caption" color="text.secondary">{g.tipoGuia}</Typography></TableCell><TableCell>{g.competencia}</TableCell>
                  <TableCell align="right">{brl(g.valorPrincipal)}</TableCell><TableCell align="right">{brl(g.multa + g.juros)}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{brl(g.valorTotal)}</TableCell>
                  <TableCell><Situacao v={g.situacao} /></TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    <Button size="small" onClick={() => setSel(g)}>Memória</Button>
                    <Button size="small" onClick={() => void rodar(() => abrirImprimivel(`/guias/${g.id}/imprimir`))}>Imprimir</Button>
                    {pode("guia.pagar") && g.status === "PENDENTE" ? <Button size="small" onClick={() => { setPagar(g); setPagoEm(isoDia()); }}>Marcar paga</Button> : null}
                    {pode("guia.gerar") && g.status === "PENDENTE" ? <Button size="small" color="error" onClick={async () => { const m = window.prompt("Motivo do cancelamento da guia (mínimo 10 caracteres):"); if (m && m.trim().length >= 10 && (await rodar(() => api.post(`${C}/guias/${g.id}/cancelar`, { motivo: m }), "Guia cancelada."))) { reload(); onMudou(); } }}>Cancelar</Button> : null}
                  </TableCell>
                </TableRow>
              ))}</TableBody></Table>
          </TableContainer>
        ) : null}
      </Estado>
      <Dialog open={!!sel} onClose={() => setSel(null)} fullWidth maxWidth="md">
        <DialogTitle>{sel?.tributo.replace(/_/g, " ")} — {sel?.competencia} <SimulacaoChip /></DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1.5 }}>Guia <strong>simulada</strong>: o código abaixo é fictício e não é aceito por nenhum banco. Versão das tabelas: {sel?.versaoTabelas} (referência — conferir).</Alert>
          <Typography variant="caption" color="text.secondary">Linha digitável (fictícia)</Typography>
          <Typography sx={{ fontFamily: "monospace", wordBreak: "break-all", mb: 1.5 }}>{sel?.linhaDigitavel}</Typography>
          <Typography variant="subtitle2">Memória de cálculo</Typography>
          <Box component="ol" sx={{ m: 0, pl: 3 }}>{(sel?.memoria?.passos ?? []).map((p: string, i: number) => <li key={i}><Typography variant="body2">{p}</Typography></li>)}</Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setSel(null)}>Fechar</Button></DialogActions>
      </Dialog>
      <Dialog open={!!pagar} onClose={() => setPagar(null)} fullWidth maxWidth="xs">
        <DialogTitle>Marcar guia como paga</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" sx={{ mb: 1.5 }}>Registra que a guia real foi paga (fora do sistema). Em atraso, multa e juros são recalculados como estimativa.</Typography>
          <TextField type="date" fullWidth label="Data do pagamento" value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </DialogContent>
        <DialogActions><Button onClick={() => setPagar(null)}>Cancelar</Button><Button variant="contained" disabled={ocupado} onClick={async () => { if (await rodar(() => api.post(`${C}/guias/${pagar.id}/pagar`, { pagoEm }), "Guia marcada como paga.")) { setPagar(null); reload(); onMudou(); } }}>Confirmar</Button></DialogActions>
      </Dialog>
    </Cartao>
  );
}

export default function GuiasTab() {
  const { pode } = useContabil();
  const [sub, setSub] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [gerar, setGerar] = useState<string | null>(null);
  const { rodar, aviso, ocupado } = useAcao();
  const [resultado, setResultado] = useState<any | null>(null);
  const bump = () => setRefresh((x) => x + 1);
  return (
    <ExigeEmpresa>
      {(id) => (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <Alert severity="info" icon={false} sx={{ py: 0.25 }}>Todas as guias são <strong>simulações</strong> calculadas a partir dos lançamentos (DARF de IRPJ, CSLL, PIS, <strong>COFINS</strong>, IRRF e carnê-leão, DAS, GPS/INSS, FGTS e ISS). Gere a guia oficial no sistema do órgão, com seu contador.</Alert>
          {aviso}
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
            <Tabs value={sub} onChange={(_, v) => setSub(v)} sx={{ flex: 1, minWidth: 220 }}><Tab label="Calendário" /><Tab label="Guias" /></Tabs>
            {pode("guia.gerar") ? <Button variant="contained" onClick={() => setGerar(comp(-1))}>Gerar guias do mês</Button> : null}
          </Box>
          {sub === 0 ? <Calendario key={refresh} empresaId={id} onGerar={(c) => setGerar(c)} /> : <Guias empresaId={id} refresh={refresh} onMudou={bump} />}
          <Dialog open={!!gerar} onClose={() => { setGerar(null); setResultado(null); }} fullWidth maxWidth="sm">
            <DialogTitle>Gerar guias (simulação)</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
              <TextField fullWidth label="Competência (AAAA-MM)" value={gerar ?? ""} onChange={(e) => setGerar(e.target.value)} error={!!gerar && !/^\d{4}-(0[1-9]|1[0-2])$/.test(gerar)} helperText="Calcula com o histórico e os lançamentos da competência. Guias já geradas são mantidas; use “recalcular” para atualizar as pendentes." />
              {resultado ? (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2">Resultado</Typography>
                  {[...resultado.criadas, ...resultado.atualizadas].map((g: any) => <Fragment key={g.id}><Typography variant="body2">{g.tributo.replace(/_/g, " ")}: <strong>{brl(g.valorTotal)}</strong> — vence {data(g.vencimento)}</Typography></Fragment>)}
                  {resultado.mantidas.length ? <Typography variant="caption" color="text.secondary">{resultado.mantidas.length} guia(s) já existente(s) mantida(s).</Typography> : null}
                  {!resultado.criadas.length && !resultado.atualizadas.length && !resultado.mantidas.length ? <Typography variant="body2" color="text.secondary">Nenhuma obrigação com valor nesta competência.</Typography> : null}
                </Box>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => { setGerar(null); setResultado(null); }}>Fechar</Button>
              <Button disabled={ocupado || !/^\d{4}-(0[1-9]|1[0-2])$/.test(gerar ?? "")} onClick={async () => { const r = await rodar(() => api.post(`${C}/guias/gerar`, { empresaId: id, competencia: gerar, recalcular: true }), "Cálculo concluído."); if (r) { setResultado(r); bump(); } }} variant="contained">Gerar / recalcular</Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
    </ExigeEmpresa>
  );
}
