import { Alert, Box, Button, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";
import { Empty, Feedback, Progress, StatCard, StatGrid, StudentSearch, fetchHtml, fmtNum, useHtmlPreview, useLoad } from "../secretaria/util";
import { Semaforo, SituacaoChip } from "./GradeNotas";

function Boletim({ id }: { id: string }) {
  const { data, loading, error, reload } = useLoad<any>(`/notas/alunos/${id}/boletim`);
  const ds: any[] = data?.disciplinas || [];
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {data && (
        <>
          <StatGrid>
            <StatCard title="CR do período" value={fmtNum(data.crPeriodo, 2)} color="#0F5FDB" />
            <StatCard title="Disciplinas" value={ds.length} />
            <StatCard title="Aprovadas" value={ds.filter((d) => d.situacao === "APROVADO").length} color="#2E7D32" />
            <StatCard title="Em risco" value={ds.filter((d) => d.risco?.nivel && d.risco.nivel !== "NENHUM").length} color="#D32F2F" />
          </StatGrid>
          {!ds.length && <Empty>Sem disciplinas cursadas.</Empty>}
          {ds.length > 0 && (
            <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "auto" }}>
              <Table size="small">
                <TableHead><TableRow><TableCell sx={{ fontWeight: 800 }}>Disciplina</TableCell><TableCell sx={{ fontWeight: 800 }}>Notas</TableCell><TableCell sx={{ fontWeight: 800 }}>Parcial</TableCell><TableCell sx={{ fontWeight: 800 }}>Final</TableCell><TableCell sx={{ fontWeight: 800, minWidth: 140 }}>Frequência</TableCell><TableCell sx={{ fontWeight: 800 }}>Situação</TableCell><TableCell sx={{ fontWeight: 800 }}>Risco</TableCell></TableRow></TableHead>
                <TableBody>
                  {ds.map((d) => (
                    <TableRow key={d.classSectionId} hover>
                      <TableCell><b>{d.disciplina}</b><Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{d.periodoLetivo} · {d.professor || "—"}</Typography></TableCell>
                      <TableCell>{(d.componentes || []).map((c: any) => <Chip key={c.id} size="small" sx={{ mr: 0.5, mb: 0.5 }} variant="outlined" label={`${c.codigo}: ${c.ausente ? "Aus." : c.valor != null ? fmtNum(c.valor) : "—"}`} />)}</TableCell>
                      <TableCell>{fmtNum(d.mediaParcial)}</TableCell><TableCell><b>{fmtNum(d.mediaFinal)}</b></TableCell>
                      <TableCell>{d.frequenciaPct != null ? <><Typography variant="caption">{fmtNum(d.frequenciaPct, 0)}% · {d.faltas} falta(s)</Typography><Progress value={d.frequenciaPct} color={d.frequenciaPct < (d.regra?.frequenciaMinima ?? 75) ? "error" : "success"} /></> : "—"}</TableCell>
                      <TableCell><SituacaoChip v={d.situacao} />{d.notaNecessaria?.necessaria != null && d.situacao === "EM_CURSO" && <Typography variant="caption" sx={{ display: "block" }}>Precisa de {fmtNum(d.notaNecessaria.necessaria)} na próxima</Typography>}</TableCell>
                      <TableCell><Semaforo nivel={d.risco?.nivel} motivos={d.risco?.motivos} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}

function Historico({ id, show }: { id: string; show: ReturnType<typeof useHtmlPreview>["show"] }) {
  const { data, loading, error, reload } = useLoad<any>(`/notas/alunos/${id}/historico`);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {data && (
        <>
          <StatGrid>
            <StatCard title="CR geral" value={fmtNum(data.crGeral, 2)} color="#0F5FDB" />
            <StatCard title="Carga horária" value={`${data.cargaHoraria?.integralizada ?? 0}h`} hint={data.cargaHoraria?.matriz ? `de ${data.cargaHoraria.matriz}h (${fmtNum(data.cargaHoraria.percentual, 0)}%)` : undefined} />
            <StatCard title="Aprovadas" value={data.disciplinasAprovadas} color="#2E7D32" />
            <StatCard title="Obrigatórias pendentes" value={(data.obrigatoriasPendentes || []).length} color="#ED6C02" />
          </StatGrid>
          {data.cargaHoraria?.percentual != null && <Box><Typography variant="caption">Integralização do curso</Typography><Progress value={data.cargaHoraria.percentual} color="success" /></Box>}
          <Button sx={{ justifySelf: "start" }} variant="outlined" onClick={() => show("Histórico escolar", () => fetchHtml(`/notas/alunos/${id}/historico.html`))}>Histórico para impressão</Button>
          {(data.periodos || []).map((p: any) => (
            <Paper key={p.periodoLetivo} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography sx={{ fontWeight: 800 }}>{p.periodoLetivo} <Chip size="small" label={`CR ${fmtNum(p.cr, 2)}`} /></Typography>
              {(p.disciplinas || []).map((d: any) => (
                <Box key={d.disciplineId} sx={{ display: "flex", gap: 1, py: 0.25, alignItems: "center" }}>
                  <Typography variant="body2" sx={{ flex: 1 }}>{d.disciplina} <span style={{ opacity: .6 }}>({d.cargaHoraria}h)</span></Typography>
                  <Typography variant="body2" sx={{ width: 50 }}>{fmtNum(d.mediaFinal)}</Typography><Typography variant="body2" sx={{ width: 50 }}>{d.frequenciaPct != null ? `${fmtNum(d.frequenciaPct, 0)}%` : "—"}</Typography><SituacaoChip v={d.situacao} />
                </Box>
              ))}
            </Paper>
          ))}
          {(data.obrigatoriasPendentes || []).length > 0 && (
            <Alert severity="warning"><b>Disciplinas obrigatórias pendentes:</b> {data.obrigatoriasPendentes.map((d: any) => d.disciplina).join(", ")}</Alert>
          )}
        </>
      )}
    </Box>
  );
}

export default function AlunoTab() {
  const [aluno, setAluno] = useState<any>(null);
  const [tab, setTab] = useState(0);
  const { show, dialog } = useHtmlPreview();
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, display: "grid", gap: 2 }}>
      <Box><Typography variant="h6" sx={{ fontWeight: 800 }}>Boletim e histórico do aluno</Typography><Typography variant="body2" color="text.secondary">Busque o aluno por nome, RA ou CPF.</Typography></Box>
      <StudentSearch value={aluno} onChange={setAluno} />
      {aluno && (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}><Tab label="Boletim" /><Tab label="Histórico" /></Tabs>
          {tab === 0 ? <Boletim id={aluno.id} /> : <Historico id={aluno.id} show={show} />}
        </>
      )}
      {dialog}
    </Paper>
  );
}
