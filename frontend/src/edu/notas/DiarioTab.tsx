import { Box, Chip, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { qsOf } from "../../services/EduApi";
import { Empty, Feedback, Status, fmtDate, itemsOf, useLoad } from "../secretaria/util";
import GradeNotas from "./GradeNotas";

export default function DiarioTab() {
  const [q, setQ] = useState("");
  const [st, setSt] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const lista = useLoad<any>(`/notas/turmas${qsOf({ pageSize: 60, q, diarioStatus: st })}`);
  if (sel) return <GradeNotas turmaId={sel} onBack={() => { setSel(null); lista.reload(); }} />;
  const rows = itemsOf(lista.data);
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
      <Box sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Box sx={{ flex: 1 }}><Typography variant="h6" sx={{ fontWeight: 800 }}>Diário de classe</Typography><Typography variant="body2" color="text.secondary">Escolha a turma para lançar notas na grade, conferir frequência e fechar o diário.</Typography></Box>
        <TextField size="small" placeholder="Buscar turma…" value={q} onChange={(e) => setQ(e.target.value)} />
        <TextField select size="small" label="Diário" sx={{ minWidth: 130 }} value={st} onChange={(e) => setSt(e.target.value)}><MenuItem value="">Todos</MenuItem><MenuItem value="ABERTO">Aberto</MenuItem><MenuItem value="FECHADO">Fechado</MenuItem></TextField>
      </Box>
      <Feedback loading={lista.loading} error={lista.error} onRetry={lista.reload} />
      {!lista.loading && !lista.error && !rows.length && <Empty>Nenhuma turma encontrada para o seu perfil.</Empty>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 1.5 }}>
        {rows.map((t) => (
          <Paper key={t.id} variant="outlined" onClick={() => setSel(t.id)} sx={{ p: 1.5, borderRadius: 3, cursor: "pointer", "&:hover": { boxShadow: 3 } }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}><Typography sx={{ fontWeight: 800 }}>{t.disciplina}</Typography><Status value={t.diarioStatus} /></Box>
            <Typography variant="caption" color="text.secondary">{t.nome} · {t.periodoLetivo}</Typography>
            <Box sx={{ mt: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              <Chip size="small" label={`${t.alunos} aluno(s)`} />
              <Chip size="small" color={t.componentes ? "default" : "warning"} label={t.componentes ? `${t.componentes} componente(s)` : "sem componentes"} />
              {t.prazoLancamento && <Chip size="small" variant="outlined" label={`prazo ${fmtDate(t.prazoLancamento)}`} />}
            </Box>
          </Paper>
        ))}
      </Box>
    </Paper>
  );
}
