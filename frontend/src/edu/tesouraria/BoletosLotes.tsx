import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import ExportMenu from "../../components/ExportMenu";
import { eduApi } from "../../services/EduApi";
import { Async, Cartao, Empty, Panel, Stat, StatGrid, Sub, brl, comReauth, erroCompleto, fmtDate, fmtDateTime, label, useApi, useToast } from "./tes";
import { AVISO_INTERNO, BOL, Motivos, OrigemChip, ResultadoChip, StatusChip, fmtDoc, fmtLinha, hojeISO } from "./boletosKit";

/** Lote do dia: relatório imprimível (DDA + e-mail), envio para aprovação e decisão total, parcial ou reprovar tudo. */
export default function BoletosLotes({ onChanged }: { onChanged: () => void }) {
  const [params, setParams] = useSearchParams();
  const loteId = params.get("lote");
  const dataRel = params.get("dia");
  const [k, setK] = useState(0);
  const lista = useApi<any>(`${BOL}/lotes?pageSize=30&_=${k}`);
  const [novo, setNovo] = useState(false);
  const [dia, setDia] = useState(hojeISO());
  const toast = useToast();
  const abrir = (p: Record<string, string | null>) => { const n = new URLSearchParams(params); Object.entries(p).forEach(([a, b]) => (b ? n.set(a, b) : n.delete(a))); setParams(n); };
  const reload = () => { setK((x) => x + 1); onChanged(); };

  if (loteId || dataRel) return <Relatorio loteId={loteId} data={dataRel} onVoltar={() => abrir({ lote: null, dia: null })} onChanged={reload} />;

  async function criar() {
    try { const l = await eduApi.post(`${BOL}/lotes`, { data: dia }); toast.ok(`Lote ${l.numero} criado.`); setNovo(false); reload(); abrir({ lote: l.id }); } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Panel title="Lote do dia" subtitle="Agrupa os boletos recebidos (DDA + e-mail + manuais) com todos os dados do check-up, para imprimir e levar à aprovação."
        actions={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <TextField size="small" type="date" label="Dia" value={dia} onChange={(e) => setDia(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => abrir({ dia })}>Relatório do dia</Button>
            <Button variant="contained" onClick={() => setNovo(true)}>Montar lote deste dia</Button>
          </Box>
        }>
        <Async state={lista}>
          {(d) => d.items.length === 0 ? <Empty text="Nenhum lote ainda. “Montar lote deste dia” reúne os boletos em aberto recebidos na data." /> : (
            <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
              {d.items.map((l: any) => (
                <Cartao key={l.id} destaque={l.status === "ENVIADO_APROVACAO" ? "warning" : l.status === "APROVADO" ? "success" : l.status === "REPROVADO" ? "error" : undefined}>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Typography sx={{ fontWeight: 800 }}>{l.numero}</Typography><StatusChip value={l.status} />
                  </Box>
                  <Typography variant="body2">{fmtDate(l.data)} · {l.itens} boleto(s) · {brl(l.valorTotal)}</Typography>
                  {l.decididoEm && <Sub>Decidido em {fmtDateTime(l.decididoEm)} ({label(l.decisao)})</Sub>}
                  <Button size="small" sx={{ mt: 0.5 }} onClick={() => abrir({ lote: l.id })}>Abrir relatório / decidir</Button>
                </Cartao>
              ))}
            </Box>
          )}
        </Async>
      </Panel>
      <Dialog open={novo} onClose={() => setNovo(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800 }}>Montar lote do dia</DialogTitle>
        <DialogContent dividers>
          <TextField fullWidth size="small" type="date" label="Dia dos boletos" value={dia} onChange={(e) => setDia(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>Entram os boletos recebidos nesse dia que ainda estão em aberto e fora de outro lote.</Typography>
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(false)}>Cancelar</Button><Button variant="contained" onClick={criar}>Montar lote</Button></DialogActions>
      </Dialog>
      {toast.node}
    </Box>
  );
}

function Relatorio({ loteId, data, onVoltar, onChanged }: { loteId: string | null; data: string | null; onVoltar: () => void; onChanged: () => void }) {
  const [k, setK] = useState(0);
  const st = useApi<any>(`${BOL}/lotes/relatorio${loteId ? `?loteId=${loteId}` : `?data=${data}`}&_=${k}`);
  const toast = useToast();
  const [decisao, setDecisao] = useState<"TOTAL" | "PARCIAL" | "REPROVAR">("TOTAL");
  const [marcados, setMarcados] = useState<string[]>([]);
  const [motivo, setMotivo] = useState("");
  const [risco, setRisco] = useState(false);
  const [restantes, setRestantes] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const reload = () => { setK((x) => x + 1); onChanged(); };

  async function enviar() {
    try { await eduApi.post(`${BOL}/lotes/${loteId}/enviar`, {}); toast.ok("Lote enviado para aprovação."); reload(); } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  async function decidir(r: any) {
    const corpo: any = { decisao, motivo: motivo || undefined, observacao: motivo || undefined, confirmarRisco: risco || undefined };
    if (decisao === "PARCIAL") { corpo.itens = marcados; corpo.refutarRestantes = restantes || undefined; }
    if (!window.confirm(decisao === "TOTAL" ? `Aprovar TODOS os ${r.boletos.length} boleto(s) do lote? Cada um passa pelas regras de alçada e segregação.` : decisao === "PARCIAL" ? `Aprovar apenas os ${marcados.length} boleto(s) marcados?` : "REPROVAR todo o lote? Todos os boletos serão refutados.")) return;
    try {
      const out = await comReauth((x) => eduApi.post(`${BOL}/lotes/${loteId}/decidir`, { ...corpo, ...x }));
      setResultado(out); toast.ok(`Decisão registrada: ${label(out.lote.status)}.`); reload();
    } catch (e: any) { toast.err(erroCompleto(e)); }
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box className="no-print" sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Button onClick={onVoltar}>← Lotes</Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>Imprimir relatório</Button>
        {st.data && <ExportMenu label="Baixar PDF / planilha" build={() => tabela(st.data)} />}
      </Box>
      <Async state={st}>
        {(r) => {
          const aprovacao = r.lote?.status === "ENVIADO_APROVACAO";
          const abertos = r.boletos.filter((b: any) => ["RECEBIDO", "A_CONFERIR", "EM_APROVACAO"].includes(b.status));
          const suspeitos = abertos.filter((b: any) => b.resultado === "SUSPEITO");
          const duplicados = abertos.filter((b: any) => b.resultado === "DUPLICADO");
          return (
            <Box sx={{ display: "grid", gap: 2 }} className="boletos-relatorio">
              <Panel title={r.lote ? `Lote ${r.lote.numero}` : "Relatório do dia (sem lote)"} subtitle={`Boletos recebidos em ${fmtDate(r.data)} · gerado em ${fmtDateTime(r.gerado.em)}`}
                actions={r.lote ? <StatusChip value={r.lote.status} /> : undefined}>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>{AVISO_INTERNO}</Typography>
                <StatGrid min={140}>
                  <Stat label="Boletos" value={r.totais.quantidade} />
                  <Stat label="Valor total" value={brl(r.totais.valorTotal)} />
                  <Stat label="DDA" value={r.totais.porOrigem.DDA?.quantidade ?? 0} hint={brl(r.totais.porOrigem.DDA?.valor ?? 0)} />
                  <Stat label="E-mail" value={r.totais.porOrigem.EMAIL?.quantidade ?? 0} hint={brl(r.totais.porOrigem.EMAIL?.valor ?? 0)} />
                  <Stat label="Manual" value={r.totais.porOrigem.MANUAL?.quantidade ?? 0} hint={brl(r.totais.porOrigem.MANUAL?.valor ?? 0)} />
                </StatGrid>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                  {(["OK", "ATENCAO", "SUSPEITO", "DUPLICADO"] as const).map((x) => <Chip key={x} label={`${x === "ATENCAO" ? "ATENÇÃO" : x}: ${r.totais.porResultado[x] ?? 0} · ${brl(r.totais.valorPorResultado[x] ?? 0)}`} color={x === "OK" ? "success" : x === "ATENCAO" ? "warning" : "error"} variant="outlined" />)}
                </Box>
                {r.lote && (
                  <Typography variant="body2">
                    Criado por {r.lote.criadoPor || "—"}{r.lote.enviadoPor ? ` · enviado para aprovação por ${r.lote.enviadoPor} em ${fmtDateTime(r.lote.enviadoEm)}` : ""}
                    {r.lote.decididoPor ? ` · ${label(r.lote.decisao)} por ${r.lote.decididoPor} em ${fmtDateTime(r.lote.decididoEm)}${r.lote.decisaoMotivo ? ` (${r.lote.decisaoMotivo})` : ""}` : ""}
                  </Typography>
                )}
              </Panel>

              <Panel title="Boletos do lote" subtitle="Todos os dados do check-up de autenticidade">
                <Box sx={{ overflowX: "auto", "@media print": { overflow: "visible" } }}>
                  <Table size="small" sx={{ minWidth: 980, "@media print": { minWidth: 0, fontSize: 10 }, "& td, & th": { verticalAlign: "top" } }}>
                    <TableHead>
                      <TableRow>
                        {aprovacao && decisao === "PARCIAL" && <TableCell className="no-print" />}
                        {["Nº / origem", "Fornecedor", "Documento", "Valor", "Vencimento", "Linha digitável", "Resultado", "Motivos do check-up", "Nota fiscal", "Situação"].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {r.boletos.map((b: any) => (
                        <TableRow key={b.id} hover>
                          {aprovacao && decisao === "PARCIAL" && <TableCell className="no-print" padding="checkbox"><Checkbox size="small" checked={marcados.includes(b.id)} disabled={b.resultado === "DUPLICADO"} onChange={(e) => setMarcados(e.target.checked ? [...marcados, b.id] : marcados.filter((x) => x !== b.id))} /></TableCell>}
                          <TableCell><b>{b.numero}</b><br /><OrigemChip value={b.origem} /></TableCell>
                          <TableCell sx={{ maxWidth: 190, overflowWrap: "anywhere" }}>{b.fornecedor || "—"}<br /><Sub>{fmtDoc(b.beneficiarioDocumento)}</Sub></TableCell>
                          <TableCell>{b.numeroDocumento || "—"}</TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap", fontWeight: 700 }}>{brl(b.valor)}</TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(b.vencimento)}</TableCell>
                          <TableCell sx={{ maxWidth: 170, wordBreak: "break-all", fontSize: 11 }}>{fmtLinha(b.linhaDigitavel) || "—"}</TableCell>
                          <TableCell><ResultadoChip value={b.resultado} score={b.score} /></TableCell>
                          <TableCell sx={{ minWidth: 260 }}><Motivos motivos={b.motivos.filter((m: any) => m.gravidade !== "OK")} dense />{b.duplicadoDeId && <Sub>ligado ao boleto original</Sub>}</TableCell>
                          <TableCell>{b.notaFiscal?.numero ? `nº ${b.notaFiscal.numero}` : <Typography variant="caption" color="warning.main">sem nota</Typography>}</TableCell>
                          <TableCell><StatusChip value={b.status} />{b.decididoPor && <Sub>{b.decididoPor}<br />{fmtDateTime(b.decididoEm)}</Sub>}{b.titulo && <Sub>{b.titulo.numero}</Sub>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
                {r.boletos.length === 0 && <Empty text="Nenhum boleto neste relatório." />}
              </Panel>

              <Panel title="Contas recorrentes não lançadas (planilha do dia)">
                {r.recorrentesNaoLancados.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma conta recorrente pendente.</Typography> : (
                  <Table size="small">
                    <TableHead><TableRow>{["Fornecedor", "Esperado para", "Valor estimado", "Atraso"].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
                    <TableBody>{r.recorrentesNaoLancados.map((x: any) => <TableRow key={x.id}><TableCell>{x.fornecedor}</TableCell><TableCell>{fmtDate(x.dataEsperada)}</TableCell><TableCell>{brl(x.valorEstimado)}</TableCell><TableCell>{x.diasAtraso} dia(s)</TableCell></TableRow>)}</TableBody>
                  </Table>
                )}
              </Panel>

              <Box className="print-only" sx={{ mt: 4, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <Box sx={{ borderTop: "1px solid #000", pt: 0.5 }}><Typography variant="caption">Responsável pelo financeiro</Typography></Box>
                <Box sx={{ borderTop: "1px solid #000", pt: 0.5 }}><Typography variant="caption">Aprovação (diretoria/coordenação)</Typography></Box>
              </Box>

              {loteId && r.lote?.status === "ABERTO" && (
                <Box className="no-print"><Button variant="contained" onClick={enviar}>Enviar lote para aprovação</Button></Box>
              )}
              {aprovacao && (
                <Panel title="Decisão do lote" subtitle="Quem enviou o lote não pode decidi-lo. Cada boleto aprovado passa pela alçada e pela segregação de funções." sx={{ "@media print": { display: "none" } }}>
                  <RadioGroup row value={decisao} onChange={(e) => setDecisao(e.target.value as any)}>
                    <FormControlLabel value="TOTAL" control={<Radio />} label="Aprovação total" />
                    <FormControlLabel value="PARCIAL" control={<Radio />} label="Aprovação parcial (marcar itens)" />
                    <FormControlLabel value="REPROVAR" control={<Radio />} label="Reprovar tudo" />
                  </RadioGroup>
                  {decisao === "PARCIAL" && <Alert severity="info" sx={{ my: 1, py: 0 }}>Marque na tabela os boletos aprovados ({marcados.length} marcado(s)). Os demais voltam para conferência{restantes ? " — ou serão refutados, se marcar a opção abaixo" : ""}.</Alert>}
                  {decisao === "PARCIAL" && <FormControlLabel control={<Switch checked={restantes} onChange={(e) => setRestantes(e.target.checked)} />} label="Refutar os não marcados (em vez de devolver à conferência)" />}
                  {decisao === "TOTAL" && duplicados.length > 0 && <Alert severity="warning" sx={{ my: 1, py: 0 }}>O lote tem {duplicados.length} boleto(s) DUPLICADO(S): a aprovação total não é permitida. Use a aprovação parcial desmarcando-os.</Alert>}
                  {decisao !== "REPROVAR" && suspeitos.length > 0 && (
                    <Alert severity="error" sx={{ my: 1 }}>
                      Há {suspeitos.length} boleto(s) SUSPEITO(S) no lote. Para aprová-los, confirme o risco e justifique abaixo.
                      <FormControlLabel control={<Checkbox checked={risco} onChange={(e) => setRisco(e.target.checked)} />} label="Confirmo o risco e a conferência feita fora do sistema" />
                    </Alert>
                  )}
                  <TextField fullWidth multiline minRows={2} size="small" label={decisao === "REPROVAR" ? "Motivo da reprovação (obrigatório)" : "Observação / justificativa"} value={motivo} onChange={(e) => setMotivo(e.target.value)} sx={{ my: 1 }} />
                  <Button variant="contained" color={decisao === "REPROVAR" ? "error" : "success"} onClick={() => decidir(r)} disabled={(decisao === "PARCIAL" && !marcados.length) || (decisao === "REPROVAR" && motivo.trim().length < 5)}>Registrar decisão</Button>
                </Panel>
              )}
              {resultado && (
                <Alert severity={resultado.resumo.falhas ? "warning" : "success"} className="no-print">
                  {resultado.resumo.autorizados} autorizado(s), {resultado.resumo.refutados} refutado(s), {resultado.resumo.falhas} com problema.
                  {resultado.resultados.filter((x: any) => !x.ok).map((x: any) => <div key={x.id}>{x.numero}: {x.erro}</div>)}
                </Alert>
              )}
            </Box>
          );
        }}
      </Async>
      {toast.node}
    </Box>
  );
}

function tabela(r: any) {
  return {
    title: r.lote ? `Lote de boletos ${r.lote.numero} — ${r.data}` : `Boletos recebidos em ${r.data}`,
    fileBase: r.lote ? `lote-boletos-${r.lote.numero}` : `boletos-${r.data}`,
    headers: ["Nº", "Origem", "Fornecedor", "CNPJ/CPF", "Doc.", "Valor", "Vencimento", "Linha digitável", "Resultado", "Score", "Motivos", "Nota fiscal", "Situação", "Decidido por"],
    rows: r.boletos.map((b: any) => [
      b.numero, b.origem, b.fornecedor, fmtDoc(b.beneficiarioDocumento), b.numeroDocumento, Number(b.valor ?? 0).toFixed(2).replace(".", ","), fmtDate(b.vencimento), fmtLinha(b.linhaDigitavel), b.resultado, b.score,
      b.motivos.filter((m: any) => m.gravidade !== "OK").map((m: any) => m.texto).join(" | "), b.notaFiscal?.numero ?? "sem nota", b.status, b.decididoPor ?? "",
    ]),
  };
}
