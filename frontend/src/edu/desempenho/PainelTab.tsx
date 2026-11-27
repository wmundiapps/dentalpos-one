import { Box, Button, Chip, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, COLORS, Kpi, KpiRow, LoadBox, Pick, Section, Sparkline, Status, call, fmtNum, fmtPct, openHtml, semaforo, useApi, useCursos, useExames, useRunner, useToast, useTurmas } from "./kit";

function Calor({ exameId, programId }: { exameId: string; programId: string }) {
  const m = useApi<any>(`/desempenho/painel/mapa-calor?exameId=${exameId}${programId ? `&programId=${programId}` : ""}`);
  const eixos: any[] = m.data?.eixos || [];
  return (
    <Section title="Mapa de calor — turmas × eixos">
      <LoadBox loading={m.loading} error={m.error} empty={!eixos.length} emptyText={m.data?.observacao || "Sem simulados concluídos para montar o mapa."} onRetry={m.reload}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Turma</TableCell>{eixos.map((e) => <TableCell key={e.id} align="center"><Tooltip title={e.nome}><span>{e.codigo}</span></Tooltip></TableCell>)}</TableRow></TableHead>
            <TableBody>
              {(m.data?.linhas || []).map((l: any) => (
                <TableRow key={l.linha}>
                  <TableCell>{l.linha}</TableCell>
                  {eixos.map((e) => {
                    const v = l.celulas?.[e.id];
                    return <TableCell key={e.id} align="center" sx={{ bgcolor: v == null ? "action.hover" : semaforo(v, 60, 40), color: v == null ? "text.secondary" : "#fff", fontWeight: 700 }}>{v == null ? "—" : Math.round(v)}</TableCell>;
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <Typography variant="caption" color="text.secondary">Vermelho &lt; 40% · Amarelo 40–60% · Verde &gt; 60%</Typography>
      </LoadBox>
    </Section>
  );
}

function Risco({ exameId, programId, turmaId }: { exameId: string; programId: string; turmaId: string }) {
  const r = useApi<any>(programId || turmaId ? `/desempenho/painel/risco?exameId=${exameId}&${turmaId ? `classSectionId=${turmaId}` : `programId=${programId}`}&limite=15` : null);
  return (
    <Section title="Alunos em risco para o exame">
      {!programId && !turmaId ? <Typography color="text.secondary">Selecione um curso ou turma.</Typography> : (
        <LoadBox loading={r.loading} error={r.error} empty={!r.data?.ranking?.length} emptyText="Sem alunos no escopo." onRetry={r.reload}>
          <KpiRow>{["CRITICO", "ALTO", "MEDIO", "BAIXO"].map((n) => <Kpi key={n} title={n} value={r.data?.porNivel?.[n] ?? 0} color={n === "CRITICO" ? COLORS.bad : n === "ALTO" ? "#e07a00" : n === "MEDIO" ? COLORS.warn : COLORS.ok} />)}</KpiRow>
          <Table size="small">
            <TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>Último simulado</TableCell><TableCell>Risco</TableCell><TableCell>Motivos</TableCell></TableRow></TableHead>
            <TableBody>
              {(r.data?.ranking || []).map((a: any) => (
                <TableRow key={a.studentId} hover>
                  <TableCell>{a.aluno?.nome ?? a.studentId}</TableCell><TableCell>{fmtPct(a.ultimoPercentual, 0)} ({a.simulados} simulado(s))</TableCell>
                  <TableCell><Status value={a.nivel} /> {a.score}</TableCell><TableCell>{(a.motivos || []).join("; ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </LoadBox>
      )}
    </Section>
  );
}

export default function PainelTab() {
  const exames = useExames(), cursos = useCursos(), turmas = useTurmas();
  const [exame, setExame] = useState(""), [curso, setCurso] = useState(""), [turma, setTurma] = useState("");
  const { toast, node } = useToast();
  const run = useRunner(toast);
  const path = !exame ? null : turma ? `/desempenho/painel/turma/${turma}?exameId=${exame}` : curso ? `/desempenho/painel/curso/${curso}?exameId=${exame}` : null;
  const p = useApi<any>(path);
  const d = p.data;
  const sc = `exameId=${exame}${curso ? `&programId=${curso}` : ""}`;
  return (
    <Box>
      {node}
      <Section title="Painel analítico de desempenho" actions={<>
        <Pick label="Exame" value={exame} onChange={setExame} options={exames} />
        <Pick label="Curso" value={curso} all="—" onChange={(v) => { setCurso(v); setTurma(""); }} options={cursos} />
        <Pick label="ou Turma" value={turma} all="—" onChange={setTurma} options={turmas} minWidth={220} />
      </>}>
        {!exame || (!curso && !turma) ? <Typography color="text.secondary">Escolha o exame e um curso (ou turma) para ver indicadores, lacunas por eixo, evolução e projeção.</Typography> : (
          <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
            <KpiRow>
              <Kpi title="Alunos no escopo" value={d?.alunosNoEscopo ?? "—"} hint={`${d?.comSimulado ?? 0} com simulado`} />
              <Kpi title="Participação" value={fmtPct(d?.participacaoPercentual, 0)} color={semaforo(d?.participacaoPercentual, 70, 40)} />
              <Kpi title="Média de acertos" value={fmtPct(d?.mediaPercentual)} color={semaforo(d?.mediaPercentual)} />
              <Kpi title="Acima do corte" value={fmtPct(d?.acimaDoCortePercentual, 0)} />
              {d?.meta && <Kpi title="Meta do curso" value={fmtPct(d.meta.metaAcerto, 0)} hint={d.meta.distanciaPontos != null ? `${d.meta.distanciaPontos > 0 ? "+" : ""}${fmtNum(d.meta.distanciaPontos)} p.p.` : undefined} color={d.meta.distanciaPontos >= 0 ? COLORS.ok : COLORS.bad} />}
              {d?.projecao && <Kpi title="Projeção (estimativa)" value={d.projecao.conceito != null ? `Conceito ${d.projecao.conceito}` : d.projecao.aprovadoProvavel ? "Aprovação provável" : "Aprovação incerta"} hint={d.projecao.risco ? `Risco ${d.projecao.risco}` : "Estimativa interna"} />}
            </KpiRow>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Desempenho por eixo (traço = meta)</Typography>
                {(d?.eixos || []).length ? d.eixos.map((e: any) => <Bar key={e.eixoId} label={e.nome} value={e.atual} meta={e.meta} color={semaforo(e.atual, e.meta, e.meta - 20)} right={`${fmtPct(e.atual, 0)} / meta ${fmtPct(e.meta, 0)}`} />) : <Typography color="text.secondary">Sem dados por eixo.</Typography>}
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Distribuição das notas</Typography>
                {Object.entries(d?.distribuicao || {}).map(([k, v]) => <Bar key={k} label={`${k}%`} value={Number(v)} max={Math.max(1, d?.comSimulado || 1)} right={`${v} aluno(s)`} color={k === "0-30" ? COLORS.bad : k === "30-50" ? COLORS.warn : COLORS.ok} />)}
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Evolução por simulado {d?.tendencia != null && <Chip size="small" sx={{ ml: 1 }} label={`próximo: ~${fmtPct(d.tendencia, 0)} (estim.)`} />}</Typography>
                <Sparkline values={(d?.historico || []).map((h: any) => h.media)} labels={(d?.historico || []).map((h: any) => h.titulo)} />
              </Box>
            </Box>
            {(d?.lacunas || []).length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Lacunas prioritárias</Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 0.5 }}>{d.lacunas.map((l: any) => <Chip key={l.eixoId} color="error" variant="outlined" label={`${l.nome ?? l.eixoId}: -${fmtNum(l.gap, 0)} p.p.`} />)}</Box>
              </Box>
            )}
            {d?.atividades && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Atividades da turma</Typography>
                {(d.atividades as any[]).map((a) => <Typography key={a.status} variant="body2">{a.status}: {a.quantidade} (nota média {fmtNum(a.notaMedia)})</Typography>)}
              </Box>
            )}
            <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
              <Button variant="outlined" onClick={() => run(() => call("POST", "/desempenho/painel/alertas/disparar", { exameId: exame, ...(curso ? { programId: curso } : {}) }), "Alertas disparados para coordenação e docentes.", "Disparar alertas de desempenho?")}>Disparar alertas</Button>
              <Button variant="outlined" onClick={() => run(() => openHtml(`/desempenho/relatorios/regulatorio?${sc}`), "Relatório aberto em nova aba.")}>Relatório regulatório</Button>
            </Box>
          </LoadBox>
        )}
      </Section>
      {exame && (curso || turma) && <Calor exameId={exame} programId={curso} />}
      {exame && <Risco exameId={exame} programId={curso} turmaId={turma} />}
    </Box>
  );
}
