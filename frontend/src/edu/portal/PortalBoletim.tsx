import { Alert, Box, Button, Chip, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Empty, Feedback, Progress, fmtNum, useLoad } from "../secretaria/util";
import { SituacaoChip } from "../notas/GradeNotas";
import { Kpi } from "./PortalSecoes";

/** Boletim completo (por período), consulta de notas por componente e histórico escolar. */
export default function PortalBoletim({ studentId, podeAgir, onRevisao }: { studentId?: string | null; podeAgir: boolean; onRevisao: (a: { classSectionId: string; componenteId: string; titulo: string }) => void }) {
  const base = studentId ? `/notas/alunos/${studentId}` : "/notas/meu";
  const hist = useLoad<any>(`${base}/historico`);
  const [termId, setTermId] = useState("");
  const bol = useLoad<any>(`${base}/boletim${termId ? `?termId=${termId}` : ""}`);
  const periodos: any[] = hist.data?.periodos || [];
  const termos = [...new Map((bol.data?.disciplinas || []).concat(periodos.flatMap((p) => p.disciplinas)).filter((d: any) => d.termId).map((d: any) => [d.termId, d.periodoLetivo])).entries()];
  const discs: any[] = bol.data?.disciplinas || [];
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", md: "repeat(4, minmax(0,1fr))" } }}>
        <Kpi title="CR geral" value={fmtNum(hist.data?.crGeral, 2)} color="#0F5FDB" />
        <Kpi title="CR do período" value={fmtNum(bol.data?.crPeriodo, 2)} color="#7C3AED" />
        <Kpi title="Carga horária" value={hist.data?.cargaHoraria ? `${hist.data.cargaHoraria.percentual ?? 0}%` : "—"} hint={hist.data?.cargaHoraria ? `${hist.data.cargaHoraria.integralizada}h de ${hist.data.cargaHoraria.matriz}h` : undefined} color="#2E7D32" />
        <Kpi title="Aprovações" value={hist.data?.disciplinasAprovadas ?? "—"} hint={`${(hist.data?.obrigatoriasPendentes || []).length} obrigatória(s) pendente(s)`} color="#ED6C02" />
      </Box>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Boletim e consulta de notas</Typography>
          <TextField select size="small" label="Período letivo" value={termId} onChange={(e) => setTermId(e.target.value)} sx={{ minWidth: 190 }}>
            <MenuItem value="">Todos os períodos</MenuItem>
            {termos.map(([id, cod]) => <MenuItem key={id as string} value={id as string}>{cod as string}</MenuItem>)}
          </TextField>
          <Button size="small" variant="outlined" onClick={() => window.print()}>Imprimir</Button>
        </Box>
        <Feedback loading={bol.loading} error={bol.error} onRetry={bol.reload} />
        {!bol.loading && !discs.length && !bol.error && <Empty>Sem disciplinas neste período.</Empty>}
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {discs.map((d) => (
            <Paper key={d.classSectionId} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Box sx={{ flex: 1, minWidth: 180 }}>
                  <Typography sx={{ fontWeight: 800 }}>{d.disciplina}</Typography>
                  <Typography variant="caption" color="text.secondary">{d.periodoLetivo} · {d.professor || "Professor a definir"} · {d.cargaHoraria}h · mín. {d.regra?.mediaAprovacao} / freq. {d.regra?.frequenciaMinima}%</Typography>
                </Box>
                <SituacaoChip v={d.situacao} />
              </Box>
              <Box sx={{ overflowX: "auto", mt: 1 }}>
                <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", fontSize: 13, "& td, & th": { border: "1px solid", borderColor: "divider", px: 1, py: 0.5, textAlign: "left", whiteSpace: "nowrap" } }}>
                  <thead><tr><th>Avaliação</th><th>Peso</th><th>Data prevista</th><th>Nota</th>{podeAgir && <th />}</tr></thead>
                  <tbody>
                    {(d.componentes || []).map((c: any) => (
                      <tr key={c.id}>
                        <td>{c.codigo} — {c.nome}</td><td>{c.peso}</td><td>{c.dataPrevista ? new Date(c.dataPrevista).toLocaleDateString("pt-BR") : "—"}</td>
                        <td><b>{c.ausente ? "Ausente" : c.valor != null ? fmtNum(c.valor) : "—"}</b> / {c.notaMaxima}</td>
                        {podeAgir && <td>{c.valor != null && <Button size="small" onClick={() => onRevisao({ classSectionId: d.classSectionId, componenteId: c.id, titulo: `${d.disciplina} — ${c.nome} (${fmtNum(c.valor)})` })}>Pedir revisão</Button>}</td>}
                      </tr>
                    ))}
                  </tbody>
                </Box>
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mt: 1 }}>
                <Box><Typography variant="caption">Média parcial <b>{fmtNum(d.mediaParcial)}</b>{d.mediaFinal != null ? ` · final ${fmtNum(d.mediaFinal)}` : ""}</Typography><Progress value={((d.mediaParcial ?? 0) / 10) * 100} color={d.mediaParcial == null ? "primary" : d.mediaParcial >= 7 ? "success" : d.mediaParcial >= 5 ? "warning" : "error"} /></Box>
                <Box><Typography variant="caption">Frequência <b>{d.frequenciaPct != null ? `${fmtNum(d.frequenciaPct, 0)}%` : "—"}</b> · {d.faltas ?? 0} falta(s)</Typography><Progress value={d.frequenciaPct ?? 0} color={d.frequenciaPct == null ? "primary" : d.frequenciaPct < 75 ? "error" : "success"} /></Box>
              </Box>
              {d.risco?.nivel && d.risco.nivel !== "NENHUM" && <Alert severity={d.risco.nivel === "ALTO" ? "error" : "warning"} sx={{ mt: 1, py: 0 }}>{(d.risco.motivos || []).join(" · ")}</Alert>}
            </Paper>
          ))}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Histórico escolar</Typography>
          {studentId && <Button size="small" href={`${import.meta.env.VITE_API_URL || "http://localhost:3000/api"}/edu/notas/alunos/${studentId}/historico.html`} target="_blank" rel="noreferrer">Versão para impressão</Button>}
        </Box>
        <Feedback loading={hist.loading} error={hist.error} onRetry={hist.reload} />
        {periodos.map((p) => (
          <Box key={p.periodoLetivo} sx={{ mb: 1.5 }}>
            <Typography sx={{ fontWeight: 800 }}>{p.periodoLetivo} <Chip size="small" label={`CR ${fmtNum(p.cr, 2)}`} sx={{ ml: 1 }} /></Typography>
            <Box sx={{ overflowX: "auto" }}>
              <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", fontSize: 13, "& td, & th": { border: "1px solid", borderColor: "divider", px: 1, py: 0.5, textAlign: "left", whiteSpace: "nowrap" } }}>
                <thead><tr><th>Disciplina</th><th>CH</th><th>Média final</th><th>Freq.</th><th>Situação</th></tr></thead>
                <tbody>{p.disciplinas.map((l: any) => <tr key={l.disciplineId}><td>{l.disciplina}</td><td>{l.cargaHoraria}h</td><td>{fmtNum(l.mediaFinal)}</td><td>{l.frequenciaPct != null ? `${fmtNum(l.frequenciaPct, 0)}%` : "—"}</td><td><SituacaoChip v={l.situacao} /></td></tr>)}</tbody>
              </Box>
            </Box>
          </Box>
        ))}
        {!hist.loading && !periodos.length && <Empty>Sem histórico ainda.</Empty>}
        {(hist.data?.obrigatoriasPendentes || []).length > 0 && (
          <Alert severity="info" sx={{ mt: 1 }}>Disciplinas obrigatórias pendentes: {(hist.data.obrigatoriasPendentes as any[]).map((x) => `${x.disciplina} (${x.periodo}º)`).join(", ")}.</Alert>
        )}
      </Paper>
    </Box>
  );
}
