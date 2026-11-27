import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Pagination, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDateTime, fmtPct, itemsOf, semaforo, useApi, useCursos, useExames, useRunner, useToast, useTurmas } from "./kit";

function Resultados({ id, onClose }: { id: string; onClose: () => void }) {
  const r = useApi<any>(`/desempenho/simulados/${id}/resultados`);
  const d = r.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Resultados — {d?.simulado?.titulo ?? "Simulado"}</DialogTitle>
      <DialogContent dividers>
        <LoadBox loading={r.loading} error={r.error} onRetry={r.reload}>
          <KpiRow>
            <Kpi title="Alunos-alvo" value={d?.alvoTotal ?? "—"} />
            <Kpi title="Realizaram" value={d?.realizaram ?? "—"} hint={`Participação ${fmtPct(d?.participacaoPercentual)}`} />
            <Kpi title="Média geral" value={fmtPct(d?.mediaPercentual)} color={semaforo(d?.mediaPercentual)} />
          </KpiRow>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Desempenho por eixo (traço = meta)</Typography>
          {(d?.porEixo || []).length ? (d.porEixo as any[]).map((e) => <Bar key={e.eixoId} label={e.nome ?? e.eixoId} value={e.percentual} meta={e.meta} color={semaforo(e.percentual, e.meta ?? 60, (e.meta ?? 60) - 20)} right={fmtPct(e.percentual)} />) : <Typography color="text.secondary">Sem respostas ainda.</Typography>}
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Ranking</Typography>
          <Table size="small">
            <TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>Acertos</TableCell><TableCell>Percentual</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
            <TableBody>
              {(d?.alunos || []).map((a: any) => <TableRow key={a.studentId}><TableCell>{a.aluno?.nome ?? a.studentId}</TableCell><TableCell>{a.acertos}/{a.total}</TableCell><TableCell>{fmtPct(a.percentual)}</TableCell><TableCell><Status value={a.status} /></TableCell></TableRow>)}
            </TableBody>
          </Table>
          {(d?.ausentes || []).length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Ausentes ({d.ausentes.length})</Typography>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>{d.ausentes.map((a: any) => <Chip key={a.studentId} size="small" label={a.aluno?.nome ?? a.studentId} />)}</Box>
            </Box>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function SimuladosTab() {
  const exames = useExames(), cursos = useCursos(), turmas = useTurmas();
  const [exame, setExame] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [rev, setRev] = useState(0);
  const [montar, setMontar] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [res, setRes] = useState<string | null>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const qs = new URLSearchParams({ page: String(page), pageSize: "15", ...(exame ? { exameId: exame } : {}), ...(status ? { status } : {}) }).toString();
  const list = useApi<any>(`/desempenho/simulados?${qs}`, [rev]);
  const total = list.data?.total ?? 0;
  const nomeExame = (id: string) => exames.find((e) => e.value === id)?.label ?? "—";

  return (
    <Box>
      {node}
      <Section title="Simulados" actions={<Button variant="contained" onClick={() => setMontar(true)}>Montar simulado</Button>}>
        <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
          <Pick label="Exame" value={exame} all="Todos" options={exames} onChange={(v) => { setPage(1); setExame(v); }} />
          <Pick label="Status" value={status} all="Todos" minWidth={150} options={["RASCUNHO", "PUBLICADO", "ENCERRADO"].map((s) => ({ value: s, label: s }))} onChange={(v) => { setPage(1); setStatus(v); }} />
        </Box>
        <LoadBox loading={list.loading} error={list.error} empty={!itemsOf(list.data).length} emptyText="Nenhum simulado. Monte um a partir do banco de questões publicadas." onRetry={list.reload}>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Título</TableCell><TableCell>Exame</TableCell><TableCell>Questões</TableCell><TableCell>Janela</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {itemsOf(list.data).map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell>{s.titulo}</TableCell><TableCell>{nomeExame(s.exameId)}</TableCell><TableCell>{s._count?.questoes ?? "—"}</TableCell>
                    <TableCell>{s.abreEm ? `${fmtDateTime(s.abreEm)} → ${fmtDateTime(s.fechaEm)}` : "Sem janela"} · {s.duracaoMin} min</TableCell>
                    <TableCell><Status value={s.status} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {s.status === "RASCUNHO" && <Button size="small" onClick={() => setEdit(s)}>Editar</Button>}
                      {s.status === "RASCUNHO" && <Button size="small" color="success" onClick={() => run(() => call("POST", `/desempenho/simulados/${s.id}/publicar`), "Simulado publicado e alunos notificados.", "Publicar e notificar os alunos-alvo?")}>Publicar</Button>}
                      {s.status === "PUBLICADO" && <Button size="small" color="warning" onClick={() => run(() => call("POST", `/desempenho/simulados/${s.id}/encerrar`), "Simulado encerrado.", "Encerrar o simulado? Tentativas em andamento serão expiradas.")}>Encerrar</Button>}
                      {s.status !== "RASCUNHO" && <Button size="small" onClick={() => setRes(s.id)}>Resultados</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {total > 15 && <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / 15)} page={page} onChange={(_, v) => setPage(v)} /></Box>}
        </LoadBox>
      </Section>
      <FormDialog open={montar} onClose={() => setMontar(false)} title="Montar simulado pela matriz do exame" submitLabel="Montar"
        fields={[
          { key: "exameId", label: "Exame", type: "select", options: exames, required: true }, { key: "titulo", label: "Título", required: true },
          { key: "total", label: "Nº de questões", type: "number", helper: "Distribuído pelos pesos dos eixos" }, { key: "duracaoMin", label: "Duração (min)", type: "number" },
          { key: "abreEm", label: "Abre em", type: "datetime" }, { key: "fechaEm", label: "Fecha em", type: "datetime" },
          { key: "turmaId", label: "Turma-alvo", type: "select", options: turmas }, { key: "programId", label: "Curso-alvo", type: "select", options: cursos },
          { key: "descricao", label: "Descrição", type: "textarea" }, { key: "dryRun", label: "Apenas simular (não salva; mostra faltantes por eixo)", type: "bool" },
        ]}
        onSubmit={async (b) => {
          const { turmaId, programId, ...rest } = b;
          const alvos = [turmaId ? { classSectionId: turmaId } : null, programId ? { programId } : null].filter(Boolean);
          const r = await call("POST", "/desempenho/simulados/montar", { ...rest, ...(alvos.length ? { alvos } : {}) });
          const falt = (r.faltantes || []).length ? `\nFaltam questões publicadas em ${(r.faltantes as any[]).length} eixo(s).` : "";
          toast({ type: r.dryRun ? "info" : "success", text: r.dryRun ? `Simulação: ${r.selecionadas} questões selecionadas.${falt}` : `Simulado criado como rascunho.${falt}` });
          setRev((x) => x + 1);
        }} />
      <FormDialog open={!!edit} onClose={() => setEdit(null)} title="Editar simulado" maxWidth="sm"
        fields={[{ key: "titulo", label: "Título", required: true }, { key: "duracaoMin", label: "Duração (min)", type: "number" }, { key: "abreEm", label: "Abre em", type: "datetime" }, { key: "fechaEm", label: "Fecha em", type: "datetime" }, { key: "descricao", label: "Descrição", type: "textarea" }]}
        initial={edit ? { titulo: edit.titulo, duracaoMin: edit.duracaoMin, descricao: edit.descricao ?? "", abreEm: edit.abreEm ? String(edit.abreEm).slice(0, 16) : "", fechaEm: edit.fechaEm ? String(edit.fechaEm).slice(0, 16) : "" } : {}}
        onSubmit={async (b) => { await call("PATCH", `/desempenho/simulados/${edit.id}`, b); setRev((x) => x + 1); }} />
      {res && <Resultados id={res} onClose={() => setRes(null)} />}
    </Box>
  );
}
