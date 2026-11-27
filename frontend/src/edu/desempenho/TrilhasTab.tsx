import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Sparkline, Status, call, fmtDate, fmtNum, fmtPct, itemsOf, useApi, useExames, useRunner, useToast } from "./kit";

const SIT: Record<string, { txt: string; cor: "success" | "warning" | "error" | "default" }> = {
  META_ATINGIDA: { txt: "Meta atingida", cor: "success" }, EM_ANDAMENTO: { txt: "Em andamento", cor: "warning" }, PLANO_ATRASADO: { txt: "Plano atrasado", cor: "error" }, SEM_DIAGNOSTICO: { txt: "Sem diagnóstico", cor: "default" },
};

function Detalhe({ id, onClose, toast }: { id: string; onClose: () => void; toast: any }) {
  const [rev, setRev] = useState(0);
  const t = useApi<any>(`/desempenho/trilhas/${id}`, [rev]);
  const p = useApi<any>(`/desempenho/trilhas/${id}/progresso`, [rev]);
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const semanas: Record<string, any[]> = t.data?.semanas || {};
  const sit = SIT[p.data?.situacao] || SIT.SEM_DIAGNOSTICO;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Trilha de preparação</DialogTitle>
      <DialogContent dividers>
        <LoadBox loading={t.loading} error={t.error} onRetry={t.reload}>
          <KpiRow>
            <Kpi title="Progresso do plano" value={fmtPct(p.data?.progressoPlano, 0)} />
            <Kpi title="Itens" value={`${p.data?.concluidos ?? 0}/${p.data?.itensTotal ?? 0}`} hint={`${p.data?.atrasados ?? 0} atrasado(s)`} color={p.data?.atrasados ? "#d64545" : undefined} />
            <Kpi title="Horas estudadas" value={fmtNum((p.data?.minutosEstudados ?? 0) / 60)} />
            <Kpi title="Situação" value={<Chip size="small" color={sit.cor} label={sit.txt} />} hint={p.data?.faltamPontos != null ? `Faltam ${fmtNum(p.data.faltamPontos)} p.p. para a meta de ${p.data.meta}%` : undefined} />
          </KpiRow>
          <Bar label="Progresso" value={p.data?.progressoPlano ?? 0} right={fmtPct(p.data?.progressoPlano, 0)} color="#2e9e5b" />
          {(p.data?.serie || []).length > 0 && (
            <Box sx={{ my: 1 }}><Typography variant="caption" color="text.secondary">Evolução nos simulados (estimativa de próximo: {fmtPct(p.data?.projecaoProximoSimulado)})</Typography><Sparkline values={p.data.serie} /></Box>
          )}
          {Object.keys(semanas).length === 0 && <Typography color="text.secondary">Sem itens no plano.</Typography>}
          {Object.entries(semanas).map(([sem, itens]) => (
            <Box key={sem} sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Semana {sem}</Typography>
              <Table size="small">
                <TableBody>
                  {itens.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell padding="checkbox"><Checkbox checked={i.status === "CONCLUIDO"} disabled={i.status === "CONCLUIDO"} onChange={() => run(() => call("POST", `/desempenho/trilhas/itens/${i.id}/concluir`), "Item concluído.")} /></TableCell>
                      <TableCell sx={{ textDecoration: i.status === "CONCLUIDO" ? "line-through" : undefined }}>{i.titulo}{i.revisaoN > 0 && <Chip size="small" sx={{ ml: 1 }} label={`revisão ${i.revisaoN}`} />}</TableCell>
                      <TableCell>{i.minutos} min</TableCell><TableCell>{fmtDate(i.dataPrevista)}</TableCell><TableCell><Status value={i.status} /></TableCell>
                      <TableCell align="right">{i.status !== "CONCLUIDO" && <Button size="small" onClick={() => run(() => call("POST", `/desempenho/trilhas/itens/${i.id}/adiar`, { dias: 2 }), "Item adiado em 2 dias.")}>Adiar</Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ))}
        </LoadBox>
      </DialogContent>
      <DialogActions>
        <Button color="warning" onClick={() => run(() => call("POST", `/desempenho/trilhas/${id}/regenerar`), "Plano regenerado com os dados mais recentes.", "Regenerar o plano? Itens pendentes serão recalculados.")}>Regenerar plano</Button>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function TrilhasTab() {
  const exames = useExames();
  const [exame, setExame] = useState("");
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [det, setDet] = useState<string | null>(null);
  const { toast, node } = useToast();
  const list = useApi<any>(`/desempenho/trilhas${exame ? `?exameId=${exame}` : ""}`, [rev]);
  return (
    <Section title="Trilhas de preparação personalizadas" actions={<><Pick label="Exame" value={exame} all="Todos" options={exames} onChange={setExame} /><Button variant="contained" onClick={() => setNovo(true)}>Nova trilha</Button></>}>
      {node}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>O plano semanal é montado pelas lacunas do aluno nos simulados, com revisões espaçadas. Metas e projeções são estimativas internas.</Typography>
      <LoadBox loading={list.loading} error={list.error} empty={!itemsOf(list.data).length} emptyText="Nenhuma trilha criada." onRetry={list.reload}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>Exame</TableCell><TableCell>Meta</TableCell><TableCell>Progresso</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {itemsOf(list.data).map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.aluno?.nome ?? "Eu"}</TableCell><TableCell>{exames.find((e) => e.value === r.exameId)?.label ?? "—"}</TableCell>
                  <TableCell>{r.metaPercentual}%{r.metaData ? ` até ${fmtDate(r.metaData)}` : ""}</TableCell>
                  <TableCell sx={{ minWidth: 140 }}><Bar value={r.progresso} color="#2e9e5b" right={fmtPct(r.progresso, 0)} /></TableCell>
                  <TableCell><Status value={r.status} /></TableCell>
                  <TableCell align="right"><Button size="small" onClick={() => setDet(r.id)}>Abrir plano</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </LoadBox>
      <FormDialog open={novo} onClose={() => setNovo(false)} title="Nova trilha de preparação" maxWidth="sm" submitLabel="Gerar trilha"
        fields={[
          { key: "studentId", label: "Aluno", type: "student", helper: "Deixe em branco se você é o aluno" }, { key: "exameId", label: "Exame", type: "select", options: exames, required: true },
          { key: "metaPercentual", label: "Meta de acerto (%)", type: "number" }, { key: "metaData", label: "Data-alvo", type: "date", helper: "Pelo menos 7 dias à frente" }, { key: "horasSemana", label: "Horas de estudo por semana", type: "number" },
        ]} initial={{ metaPercentual: 60, horasSemana: 6 }}
        onSubmit={async (b) => { const r = await call("POST", "/desempenho/trilhas", b); toast({ type: r.diagnosticoPendente ? "info" : "success", text: r.recomendacao || "Trilha criada." }); setRev((x) => x + 1); }} />
      {det && <Detalhe id={det} toast={toast} onClose={() => { setDet(null); setRev((x) => x + 1); }} />}
    </Section>
  );
}
