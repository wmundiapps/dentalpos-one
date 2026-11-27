// Visão do coordenador: prontidão do curso, alunos em risco, obrigados ao ENADE, calendário e lembretes.
import { Alert, Box, Button, Chip, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, COLORS, Kpi, KpiRow, LoadBox, Pick, Section, call, fmtDate, fmtPct, semaforo, useApi, useCursos, useRunner, useToast } from "../desempenho/kit";
import { ehGestao, X } from "./comum";

const FAIXA: Record<string, { cor: string; rotulo: string }> = {
  PRONTO: { cor: COLORS.ok, rotulo: "Pronto" }, ATENCAO: { cor: COLORS.warn, rotulo: "Atenção" }, CRITICO: { cor: COLORS.bad, rotulo: "Crítico" }, SEM_DADOS: { cor: COLORS.mute, rotulo: "Sem dados" },
};

export default function Coordenacao({ exames }: { exames: Array<{ id: string; nome: string; tipo: string }> }) {
  const cursos = useCursos();
  const [programId, setProgramId] = useState("");
  const [exameId, setExameId] = useState("");
  const p = useApi<any>(programId ? `${X}/coordenacao/painel?programId=${programId}${exameId ? `&exameId=${exameId}` : ""}` : null);
  const alunos = useApi<any>(programId ? `${X}/coordenacao/alunos?programId=${programId}${exameId ? `&exameId=${exameId}` : ""}` : null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => p.reload());
  const [publico, setPublico] = useState("risco");
  const d = p.data;
  const f = FAIXA[d?.prontidao?.faixa || "SEM_DADOS"];
  return (
    <Box>
      {node}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <Pick label="Curso" value={programId} onChange={setProgramId} options={cursos} minWidth={260} all="Escolha o curso" />
        <Pick label="Exame" value={exameId} onChange={setExameId} options={exames.map((e) => ({ value: e.id, label: e.nome }))} minWidth={260} all="Todos os ENADE" />
      </Box>
      {!programId && <Alert severity="info">Escolha um curso para ver o índice de prontidão, os alunos em risco e o calendário.</Alert>}
      <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
        {d && (
          <>
            <KpiRow>
              <Kpi title="Índice de prontidão" value={`${d.prontidao.indice}/100`} hint={f.rotulo} color={f.cor} />
              <Kpi title="Participação" value={fmtPct(d.prontidao.participacaoPct, 0)} hint={`${d.prontidao.comSimulado} de ${d.prontidao.alunos} alunos`} color={semaforo(d.prontidao.participacaoPct, 70, 40)} />
              <Kpi title="Média (últimas 3)" value={fmtPct(d.prontidao.mediaPct, 0)} hint={`Meta ${fmtPct(d.config.metaProntidaoPct, 0)}`} color={semaforo(d.prontidao.mediaPct, d.config.metaProntidaoPct, d.config.limiteRiscoPct)} />
              <Kpi title="Alunos em risco" value={d.prontidao.emRisco} hint={`abaixo de ${fmtPct(d.config.limiteRiscoPct, 0)}`} color={d.prontidao.emRisco ? COLORS.bad : COLORS.ok} />
            </KpiRow>
            <Alert severity="info" icon={false} sx={{ mb: 2 }}>{d.aviso}</Alert>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "repeat(2, minmax(0,1fr))" } }}>
              <Section title="Eixos / áreas do curso (menor desempenho primeiro)">
                {d.eixos.length ? d.eixos.map((e: any) => <Bar key={e.eixoId} value={e.percentual} color={semaforo(e.percentual, d.config.metaProntidaoPct, d.config.limiteRiscoPct)} meta={d.config.metaProntidaoPct} label={e.nome} right={`${e.acertos}/${e.total} · ${fmtPct(e.percentual, 0)}`} />) : <Typography color="text.secondary">Sem simulados concluídos pelos alunos do curso.</Typography>}
              </Section>
              <Section title="Temas críticos">
                {d.temasCriticos.length ? d.temasCriticos.map((t: any) => <Bar key={t.tema} value={t.percentual} color={semaforo(t.percentual)} label={t.tema} right={`${t.acertos}/${t.total}`} />) : <Typography color="text.secondary">Ainda sem volume de respostas por tema.</Typography>}
              </Section>
            </Box>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "repeat(2, minmax(0,1fr))" } }}>
              <Section title="Calendário e prazos">
                {d.calendario.length ? d.calendario.map((c: any) => (
                  <Paper key={c.id} variant="outlined" sx={{ p: 1.25, mb: 1, borderRadius: 2 }}>
                    <Typography sx={{ fontWeight: 700 }}>{c.exame}{c.titulo ? ` — ${c.titulo}` : ""}</Typography>
                    <Typography variant="body2" color="text.secondary">Prova: {fmtDate(c.dataProva)}{c.diasParaProva != null ? ` (${c.diasParaProva} dia(s))` : ""} · inscrições até {fmtDate(c.inscricaoFim)} · {c.status.replace(/_/g, " ").toLowerCase()}</Typography>
                  </Paper>
                )) : <Typography color="text.secondary">Nenhuma edição cadastrada. Cadastre em ENADE, OAB e desempenho → Exames e inscrições.</Typography>}
                {ehGestao() && (
                  <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                    <TextField select size="small" label="Enviar lembrete para" value={publico} onChange={(e) => setPublico(e.target.value)} sx={{ minWidth: 220 }}>
                      <MenuItem value="risco">Alunos em risco</MenuItem><MenuItem value="sem_simulado">Quem ainda não fez simulado</MenuItem>
                      <MenuItem value="obrigados" disabled={!d.obrigados}>Obrigados com inscrição pendente</MenuItem><MenuItem value="todos">Todos os alunos do curso</MenuItem>
                    </TextField>
                    <Button variant="contained" onClick={() => run(() => call("POST", `${X}/coordenacao/lembretes`, { programId, publico, ...(exameId ? { exameId } : {}), ...(d.obrigados ? { edicaoId: d.obrigados.edicaoId } : {}) }).then((r) => { toast({ type: "success", text: `${r.enviados} lembrete(s) enviado(s) pelo app.` }); return r; }), "Lembretes enviados.", "Enviar o lembrete agora?")}>Enviar lembrete</Button>
                  </Box>
                )}
              </Section>
              <Section title="Inscritos e concluintes obrigados ao exame">
                {d.obrigados ? (
                  <>
                    <Typography variant="body2" sx={{ mb: 1 }}>{d.obrigados.edicao}: {d.obrigados.total} inscrição(ões) · {d.obrigados.concluintes} concluinte(s) · {d.obrigados.ingressantes} ingressante(s)</Typography>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1 }}>{Object.entries(d.obrigados.porSituacao).filter(([, n]) => Number(n) > 0).map(([k, n]) => <Chip key={k} size="small" label={`${k.toLowerCase()}: ${n}`} />)}</Box>
                    <Alert severity={d.obrigados.concluintesSemSimulado ? "warning" : "success"} icon={false}>{d.obrigados.concluintesSemSimulado} concluinte(s) ainda sem nenhum simulado.</Alert>
                  </>
                ) : <Typography color="text.secondary">Sem edição com inscritos para este curso. Gere os inscritos na edição (módulo Desempenho).</Typography>}
              </Section>
            </Box>

            <Section title="Alunos em risco">
              {d.alunosEmRisco.length ? (
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small"><TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>RA</TableCell><TableCell align="right">Média</TableCell><TableCell align="right">Provas</TableCell></TableRow></TableHead>
                    <TableBody>{d.alunosEmRisco.map((a: any) => <TableRow key={a.studentId}><TableCell>{a.aluno}</TableCell><TableCell>{a.ra}</TableCell><TableCell align="right"><Chip size="small" sx={{ bgcolor: COLORS.bad, color: "#fff" }} label={fmtPct(a.media, 0)} /></TableCell><TableCell align="right">{a.sessoes}</TableCell></TableRow>)}</TableBody></Table>
                </Box>
              ) : <Typography color="text.secondary">Nenhum aluno abaixo do limite de risco.</Typography>}
            </Section>
            <Section title="Evolução mensal do curso">
              {d.evolucao.length ? d.evolucao.map((e: any) => <Bar key={e.mes} value={e.media} color={semaforo(e.media)} label={e.mes} right={`${fmtPct(e.media, 0)} · ${e.sessoes} prova(s)`} />) : <Typography color="text.secondary">Sem provas concluídas.</Typography>}
            </Section>
            <Section title="Todos os alunos do curso">
              <LoadBox loading={alunos.loading} error={alunos.error} empty={!(alunos.data?.items || []).length} onRetry={alunos.reload}>
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small"><TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>RA</TableCell><TableCell align="right">Média</TableCell><TableCell align="right">Provas</TableCell><TableCell>Situação</TableCell></TableRow></TableHead>
                    <TableBody>{(alunos.data?.items || []).map((a: any) => <TableRow key={a.studentId}><TableCell>{a.aluno}</TableCell><TableCell>{a.ra}</TableCell><TableCell align="right">{fmtPct(a.media, 0)}</TableCell><TableCell align="right">{a.sessoes}</TableCell><TableCell><Chip size="small" label={a.situacao.replace("_", " ").toLowerCase()} color={a.situacao === "RISCO" ? "error" : a.situacao === "NA_META" ? "success" : a.situacao === "ATENCAO" ? "warning" : "default"} /></TableCell></TableRow>)}</TableBody></Table>
                </Box>
              </LoadBox>
            </Section>
          </>
        )}
      </LoadBox>
    </Box>
  );
}
