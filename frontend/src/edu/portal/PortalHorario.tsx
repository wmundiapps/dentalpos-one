import { Box, Chip, Paper, Typography } from "@mui/material";
import { Empty, Feedback, fmtDateTime, useLoad } from "../secretaria/util";
import { DIAS, hhmm, sid } from "./comum";

/** Calendário/horário da turma: grade semanal, próximas aulas, avaliações e encontros/prazos da sala virtual. */
export default function PortalHorario({ studentId }: { studentId?: string | null }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/aluno/horario${sid(studentId)}`);
  const grade: any[] = data?.gradeSemanal || [];
  const agenda = [
    ...(data?.aulas || []).map((a: any) => ({ quando: a.inicio, tipo: "Aula", titulo: `${a.disciplina}: ${a.titulo}`, onde: a.local })),
    ...(data?.avaliacoes || []).map((a: any) => ({ quando: a.data, tipo: "Avaliação", titulo: `${a.disciplina}: ${a.titulo}`, onde: null })),
    ...(data?.virtuais || []).map((a: any) => ({ quando: a.data, tipo: a.tipo === "AULA_AO_VIVO" ? "Ao vivo" : "Prazo", titulo: `${a.disciplina}: ${a.titulo}`, onde: a.url })),
  ].filter((x) => x.quando).sort((a, b) => +new Date(a.quando) - +new Date(b.quando));
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Horário semanal</Typography>
        {!grade.length && !loading && <Empty>A grade semanal ainda não foi publicada. Veja abaixo as próximas aulas.</Empty>}
        <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2, minmax(0,1fr))", lg: "repeat(3, minmax(0,1fr))" } }}>
          {DIAS.map((nome, d) => {
            const doDia = grade.filter((g) => g.diaSemana === d);
            if (!doDia.length) return null;
            return (
              <Paper key={d} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                <Typography sx={{ fontWeight: 800 }}>{nome}</Typography>
                {doDia.map((g, i) => <Typography key={i} variant="body2">{hhmm(g.inicioMin)}–{hhmm(g.fimMin)} · {g.disciplina}{g.tipoAula && g.tipoAula !== "TEORICA" ? ` (${g.tipoAula.toLowerCase()})` : ""}</Typography>)}
              </Paper>
            );
          })}
        </Box>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Próximos compromissos</Typography>
        {!agenda.length && !loading && <Empty>Nada agendado para os próximos dias.</Empty>}
        <Box sx={{ display: "grid", gap: 0.75 }}>
          {agenda.slice(0, 40).map((a, i) => (
            <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.5, borderBottom: "1px dashed", borderColor: "divider", flexWrap: "wrap" }}>
              <Typography variant="body2" sx={{ minWidth: 130, fontWeight: 700 }}>{fmtDateTime(a.quando)}</Typography>
              <Chip size="small" color={a.tipo === "Avaliação" ? "error" : a.tipo === "Prazo" ? "warning" : a.tipo === "Ao vivo" ? "secondary" : "default"} label={a.tipo} />
              <Typography variant="body2" sx={{ flex: 1, minWidth: 160 }}>{a.titulo}</Typography>
              {a.onde && !String(a.onde).startsWith("http") && <Typography variant="caption" color="text.secondary">{a.onde}</Typography>}
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}
