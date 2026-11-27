import { Box, Chip, MenuItem, Paper, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { qsOf } from "../../services/EduApi";
import { Empty, Feedback, Progress, StatCard, StatGrid, fmtDate, fmtNum, itemsOf, label, useLoad } from "../secretaria/util";
import { Semaforo } from "./GradeNotas";

function Risco({ termId }: { termId: string }) {
  const [nivel, setNivel] = useState("");
  const { data, loading, error, reload } = useLoad<any>(`/notas/gestao/risco${qsOf({ termId, nivel })}`);
  const rows = itemsOf(data);
  const alto = rows.filter((r) => r.nivel === "ALTO").length;
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Box sx={{ flex: 1 }}><Typography variant="h6" sx={{ fontWeight: 800 }}>Alunos em risco acadêmico</Typography><Typography variant="body2" color="text.secondary">Semáforo por nota projetada e frequência — priorize o acompanhamento.</Typography></Box>
        <TextField select size="small" label="Nível" sx={{ minWidth: 150 }} value={nivel} onChange={(e) => setNivel(e.target.value)}><MenuItem value="">Atenção e alto</MenuItem><MenuItem value="ALTO">Somente alto</MenuItem></TextField>
      </Box>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {data && <StatGrid><StatCard title="Em risco alto" value={alto} color="#D32F2F" /><StatCard title="Em atenção" value={rows.length - alto} color="#ED6C02" /><StatCard title="Turmas analisadas" value={data.turmasAnalisadas ?? 0} /></StatGrid>}
      {!loading && !error && !rows.length && <Empty>Nenhum aluno em risco no período.</Empty>}
      {rows.length > 0 && (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow>{["", "Aluno", "Turma", "Média parcial", "Frequência", "Nota necessária", "Motivos"].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.studentId}${r.classSectionId}${i}`} hover>
                  <TableCell><Semaforo nivel={r.nivel} /></TableCell><TableCell><b>{r.nome}</b><Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>RA {r.ra}</Typography></TableCell><TableCell>{r.turma}</TableCell>
                  <TableCell>{fmtNum(r.mediaParcial)}</TableCell><TableCell>{r.frequenciaPct != null ? `${fmtNum(r.frequenciaPct, 0)}%` : "—"}</TableCell><TableCell>{fmtNum(r.notaNecessaria)}</TableCell>
                  <TableCell sx={{ maxWidth: 320 }}>{(r.motivos || []).join(" · ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}

function Pendencias({ termId }: { termId: string }) {
  const { data, loading, error, reload } = useLoad<any>(`/notas/gestao/pendencias${qsOf({ termId })}`);
  const rows = itemsOf(data);
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, display: "grid", gap: 1.5 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>Pendências de lançamento</Typography>
      <Typography variant="body2" color="text.secondary">Diários abertos com avaliações já realizadas sem nota para algum aluno, ou sem componentes definidos.</Typography>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {!loading && !error && !rows.length && <Empty>Nenhuma pendência. Bom trabalho!</Empty>}
      {rows.map((r) => (
        <Paper key={r.classSectionId} variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderLeft: `5px solid ${r.vencidas ? "#D32F2F" : "#ED6C02"}` }}>
          <Typography sx={{ fontWeight: 800 }}>{r.turma}</Typography>
          {r.semComponentes && <Chip size="small" color="warning" label="sem componentes de avaliação" />}
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
            {(r.pendencias || []).map((p: any) => <Chip key={p.codigo} size="small" color={p.vencida ? "error" : "default"} label={`${p.codigo}: faltam ${p.faltam}${p.dataPrevista ? ` · ${fmtDate(p.dataPrevista)}` : ""}`} />)}
          </Box>
        </Paper>
      ))}
    </Paper>
  );
}

function Ranking({ termId }: { termId: string }) {
  const [programId, setProgramId] = useState("");
  const cursos = useLoad<any[]>("/academico/programs");
  const { data, loading, error, reload } = useLoad<any>(`/notas/gestao/ranking${qsOf({ termId, programId, limit: 30 })}`);
  const rows = itemsOf(data);
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Ranking por coeficiente de rendimento (CR)</Typography>
        <TextField select size="small" label="Curso" sx={{ minWidth: 240 }} value={programId} onChange={(e) => setProgramId(e.target.value)}><MenuItem value="">Todos</MenuItem>{(cursos.data || []).map((c: any) => <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>)}</TextField>
      </Box>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {!loading && !error && !rows.length && <Empty>Sem dados de CR.</Empty>}
      {rows.map((r) => (
        <Box key={r.studentId} sx={{ display: "grid", gridTemplateColumns: "40px 1fr 140px 60px", gap: 1, alignItems: "center" }}>
          <Typography sx={{ fontWeight: 800 }}>{r.posicao}º</Typography>
          <Typography variant="body2"><b>{r.nome}</b> <span style={{ opacity: .6 }}>RA {r.ra}</span></Typography>
          <Progress value={(Number(r.cr ?? 0) / 10) * 100} color="success" />
          <Typography variant="body2" sx={{ fontWeight: 800 }}>{fmtNum(r.cr, 2)}</Typography>
        </Box>
      ))}
    </Paper>
  );
}

function Curso({ termId }: { termId: string }) {
  const [programId, setProgramId] = useState("");
  const cursos = useLoad<any[]>("/academico/programs");
  const { data, loading, error, reload } = useLoad<any>(programId ? `/notas/gestao/cursos/${programId}/visao${qsOf({ termId })}` : null);
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Visão do curso — aprovação por turma</Typography>
        <TextField select size="small" label="Curso" sx={{ minWidth: 260 }} value={programId} onChange={(e) => setProgramId(e.target.value)}>{(cursos.data || []).map((c: any) => <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>)}</TextField>
      </Box>
      {!programId && <Empty>Escolha um curso.</Empty>}
      <Feedback loading={loading} error={error} onRetry={reload} />
      {data && (
        <>
          <StatGrid>
            <StatCard title="Turmas" value={data.totais?.turmas ?? 0} /><StatCard title="Diários fechados" value={data.totais?.diariosFechados ?? 0} color="#607D8B" />
            <StatCard title="Taxa de aprovação" value={data.totais?.taxaAprovacao != null ? `${fmtNum(data.totais.taxaAprovacao)}%` : "—"} color="#2E7D32" /><StatCard title="Resultados" value={data.totais?.resultados ?? 0} />
          </StatGrid>
          {(data.turmas || []).map((t: any) => (
            <Box key={t.classSectionId} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr 80px 120px" }, gap: 1, alignItems: "center" }}>
              <Typography variant="body2"><b>{t.disciplina}</b> <span style={{ opacity: .6 }}>{t.turma}</span></Typography>
              <Box><Progress value={t.taxaAprovacao ?? 0} color={t.taxaAprovacao == null ? "primary" : t.taxaAprovacao < 60 ? "error" : t.taxaAprovacao < 80 ? "warning" : "success"} /></Box>
              <Typography variant="caption">{t.taxaAprovacao != null ? `${fmtNum(t.taxaAprovacao, 0)}%` : "em curso"}</Typography>
              <Typography variant="caption">média {fmtNum(t.mediaFinal)} · {t.alunos} alunos · {label(t.diarioStatus)}</Typography>
            </Box>
          ))}
        </>
      )}
    </Paper>
  );
}

export default function GestaoTab() {
  const [tab, setTab] = useState(0);
  const [termId, setTermId] = useState("");
  const terms = useLoad<any[]>("/academico/terms");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ flex: 1 }}>{["Risco acadêmico", "Pendências", "Ranking (CR)", "Visão do curso"].map((t) => <Tab key={t} label={t} />)}</Tabs>
        <TextField select size="small" label="Período letivo" sx={{ minWidth: 200 }} value={termId} onChange={(e) => setTermId(e.target.value)} helperText={terms.error ? "Lista de períodos indisponível" : undefined}>
          <MenuItem value="">Período atual</MenuItem>{(terms.data || []).map((t: any) => <MenuItem key={t.id} value={t.id}>{t.codigo}</MenuItem>)}
        </TextField>
      </Box>
      {tab === 0 && <Risco termId={termId} />}{tab === 1 && <Pendencias termId={termId} />}{tab === 2 && <Ranking termId={termId} />}{tab === 3 && <Curso termId={termId} />}
    </Box>
  );
}
