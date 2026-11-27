import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, COLORS, FormDialog, Kanban, Kpi, KpiRow, LoadBox, Pick, Section, Sparkline, Status, call, fmtDate, fmtNum, fmtPct, itemsOf, useApi, useRunner, useToast } from "../desempenho/kit";

const COR_NIVEL: Record<string, string> = { CRITICO: COLORS.bad, ALTO: "#e07a00", MEDIO: COLORS.warn, BAIXO: COLORS.ok };
const COLS = ["ABERTO", "EM_ACOMPANHAMENTO", "SEM_CONTATO", "RESOLVIDO", "EVADIU", "CANCELADO"];
const COLC: Record<string, string> = { ABERTO: COLORS.info, EM_ACOMPANHAMENTO: COLORS.warn, SEM_CONTATO: COLORS.bad, RESOLVIDO: COLORS.ok, EVADIU: "#7a1f1f", CANCELADO: COLORS.mute };

function Aluno({ id, onClose }: { id: string; onClose: () => void }) {
  const r = useApi<any>(`/apoio/risco/alunos/${id}`);
  const d = r.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Risco de evasão — {d?.aluno?.nomeCompleto ?? "Aluno"}</DialogTitle>
      <DialogContent dividers>
        <LoadBox loading={r.loading} error={r.error} onRetry={r.reload}>
          <KpiRow>
            <Kpi title="Score" value={d?.score ?? "—"} color={COR_NIVEL[d?.nivel]} hint={d?.nivel} />
            <Kpi title="Confiança dos dados" value={fmtPct((d?.confianca ?? 0) * 100, 0)} hint="fontes disponíveis" />
          </KpiRow>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Fatores</Typography>
          {(d?.fatores || []).map((f: any) => <Bar key={f.chave} label={f.rotulo} value={f.disponivel ? f.pontos : 0} max={f.peso} color={f.disponivel ? COR_NIVEL[f.pontos / f.peso >= 0.6 ? "CRITICO" : f.pontos / f.peso >= 0.3 ? "MEDIO" : "BAIXO"] : COLORS.mute} right={f.disponivel ? `${fmtNum(f.pontos)}/${f.peso}${f.detalhe ? ` — ${f.detalhe}` : ""}` : "sem dados"} />)}
          {(d?.acoesSugeridas || []).length > 0 && <><Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Ações sugeridas</Typography>{d.acoesSugeridas.map((a: string) => <Typography key={a} variant="body2">• {a}</Typography>)}</>}
          {(d?.historico || []).length > 1 && <><Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Evolução do score</Typography><Sparkline values={[...d.historico].reverse().map((h: any) => h.score)} color={COLORS.bad} /></>}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function RiscoTab() {
  const [rev, setRev] = useState(0);
  const [nivel, setNivel] = useState("MEDIO");
  const [aluno, setAluno] = useState<string | null>(null);
  const [contato, setContato] = useState<any | null>(null);
  const [enc, setEnc] = useState<any | null>(null);
  const [novoPlano, setNovoPlano] = useState(false);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const lista = useApi<any>(`/apoio/risco/lista?nivelMinimo=${nivel}&pageSize=50`, [rev]);
  const planos = useApi<any>("/apoio/risco/planos?pageSize=100", [rev]);
  const efet = useApi<any>("/apoio/risco/efetividade", [rev]);
  const rows = itemsOf(lista.data);
  const pl = itemsOf(planos.data);
  const r = lista.data?.resumo;
  return (
    <Box>
      {node}
      <KpiRow>
        <Kpi title="Críticos" value={r?.CRITICO ?? 0} color={COLORS.bad} /><Kpi title="Altos" value={r?.ALTO ?? 0} color="#e07a00" /><Kpi title="Médios" value={r?.MEDIO ?? 0} color={COLORS.warn} />
        <Kpi title="Taxa de retenção (busca ativa)" value={fmtPct(efet.data?.taxaRetencao, 0)} hint={efet.data?.reducaoMediaScore != null ? `redução média de ${fmtNum(efet.data.reducaoMediaScore)} pontos` : "planos resolvidos × evasões"} color={COLORS.ok} />
      </KpiRow>
      <Section title="Alunos em risco de evasão (semáforo)" actions={<>
        <Pick label="Nível mínimo" value={nivel} onChange={setNivel} minWidth={150} options={["BAIXO", "MEDIO", "ALTO", "CRITICO"].map((s) => ({ value: s, label: s }))} />
        <Button variant="outlined" onClick={() => run(() => call("POST", "/apoio/risco/recalcular", { limite: 500 }), "Risco recalculado para os alunos ativos.", "Recalcular o risco de todos os alunos ativos? Planos de ação podem ser criados automaticamente.")}>Recalcular todos</Button>
      </>}>
        <LoadBox loading={lista.loading} error={lista.error} empty={!rows.length} emptyText="Nenhum aluno neste nível. Use “Recalcular todos” para gerar a primeira avaliação." onRetry={lista.reload}>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>Risco</TableCell><TableCell>Principais fatores</TableCell><TableCell>Plano de ação</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {rows.map((x) => (
                  <TableRow key={x.studentId} hover>
                    <TableCell>{x.aluno?.nome ?? x.studentId}<Typography variant="caption" color="text.secondary" component="div">RA {x.aluno?.ra ?? "—"}</Typography></TableCell>
                    <TableCell sx={{ minWidth: 150 }}><Bar value={x.score} color={COR_NIVEL[x.nivel]} right={`${x.score} · ${x.nivel}`} /></TableCell>
                    <TableCell>{(x.fatores || []).map((f: any) => <Chip key={f.chave} size="small" sx={{ mr: 0.5 }} label={f.rotulo} />)}</TableCell>
                    <TableCell>{x.plano ? <><Status value={x.plano.status} /> <Typography variant="caption" component="span">próx. contato {fmtDate(x.plano.proximoContatoEm)}</Typography></> : <Chip size="small" variant="outlined" label="sem plano" />}</TableCell>
                    <TableCell align="right"><Button size="small" onClick={() => setAluno(x.studentId)}>Detalhar</Button><Button size="small" color="success" onClick={() => run(() => call("POST", `/apoio/risco/alunos/${x.studentId}/avaliar`, { criarPlano: true }), "Aluno reavaliado.")}>Reavaliar</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </LoadBox>
      </Section>
      <Section title="Planos de ação de permanência (busca ativa)" actions={<Button variant="contained" onClick={() => setNovoPlano(true)}>Novo plano</Button>}>
        <LoadBox loading={planos.loading} error={planos.error} empty={!pl.length} emptyText="Nenhum plano de ação aberto." onRetry={planos.reload}>
          <Kanban columns={COLS} items={pl} getCol={(p) => p.status} colors={COLC} title={(p) => p.aluno?.nome ?? p.studentId} subtitle={(p) => `Risco inicial ${p.nivelInicial} (${p.scoreInicial})`}
            meta={(p) => (
              <Box>
                {p.proximoContatoEm && <Chip size="small" color={new Date(p.proximoContatoEm) < new Date() && ["ABERTO", "EM_ACOMPANHAMENTO"].includes(p.status) ? "error" : "default"} label={`contato ${fmtDate(p.proximoContatoEm)}`} />}
                {["ABERTO", "EM_ACOMPANHAMENTO", "SEM_CONTATO"].includes(p.status) && (
                  <Box sx={{ mt: 0.5 }}>
                    {["ABERTO", "EM_ACOMPANHAMENTO"].includes(p.status) && <Button size="small" onClick={(e) => { e.stopPropagation(); setContato(p); }}>Registrar contato</Button>}
                    <Button size="small" color="warning" onClick={(e) => { e.stopPropagation(); setEnc(p); }}>Encerrar</Button>
                  </Box>
                )}
              </Box>
            )} />
        </LoadBox>
      </Section>
      <FormDialog open={!!contato} onClose={() => setContato(null)} maxWidth="sm" title={`Contato com ${contato?.aluno?.nome ?? "o aluno"}`} initial={{ canal: "TELEFONE", resultado: "CONTATO_REALIZADO" }}
        fields={[{ key: "canal", label: "Canal", type: "select", options: ["TELEFONE", "WHATSAPP", "EMAIL", "PRESENCIAL", "VISITA"], required: true }, { key: "resultado", label: "Resultado", type: "select", options: ["CONTATO_REALIZADO", "SEM_RESPOSTA", "COMPROMISSO", "RECUSOU"], required: true },
          { key: "resumo", label: "Resumo do contato", type: "textarea", required: true }, { key: "proximoPasso", label: "Próximo passo" }, { key: "proximoContatoEm", label: "Próximo contato em", type: "date" }]}
        onSubmit={async (b) => { const r = await call("POST", `/apoio/risco/planos/${contato.id}/contatos`, b); toast({ type: r.status === "SEM_CONTATO" ? "info" : "success", text: r.status === "SEM_CONTATO" ? "4 tentativas sem resposta: plano marcado SEM CONTATO; coordenação alertada." : "Contato registrado." }); setRev((x) => x + 1); }} />
      <FormDialog open={!!enc} onClose={() => setEnc(null)} maxWidth="sm" title="Encerrar plano de ação" initial={{ status: "RESOLVIDO" }}
        fields={[{ key: "status", label: "Desfecho", type: "select", options: ["RESOLVIDO", "EVADIU", "CANCELADO"], required: true }, { key: "resultado", label: "Resultado / observações", type: "textarea", required: true }]}
        onSubmit={async (b) => { await call("POST", `/apoio/risco/planos/${enc.id}/encerrar`, b); setRev((x) => x + 1); }} />
      <FormDialog open={novoPlano} onClose={() => setNovoPlano(false)} maxWidth="sm" title="Novo plano de permanência" intro={<Alert severity="info" sx={{ mb: 2 }}>Planos para riscos ALTO/CRÍTICO são criados automaticamente na reavaliação.</Alert>}
        fields={[{ key: "studentId", label: "Aluno", type: "student", required: true }, { key: "proximoContatoEm", label: "Primeiro contato em", type: "date" }, { key: "acoes", label: "Ações previstas", type: "list", helper: "Separe por vírgulas" }]}
        onSubmit={async (b) => { const { acoes, ...rest } = b; await call("POST", "/apoio/risco/planos", { ...rest, ...(acoes ? { acoesSugeridas: acoes } : {}) }); setRev((x) => x + 1); }} />
      {aluno && <Aluno id={aluno} onClose={() => setAluno(null)} />}
    </Box>
  );
}
