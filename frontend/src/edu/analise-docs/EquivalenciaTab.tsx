import { Alert, Box, Button, Chip, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { StudentPicker } from "../desempenho/kit";
import { AD, AVISO_AGENTE, Section, call, errMsg, itemsOf, label, useApi, useConfigAD } from "./kit";

const EXEMPLO = "Anatomia Humana | 80 | 8,5 | Aprovado | 2024\nHistologia | 40 | 7 | Aprovado | 2024\nBioquímica Básica | 60 | 4 | Reprovado | 2023\nFisiologia Geral | 80 | 8 | Aprovado | 2010";

/** Simulação avulsa de equivalência: disciplinas do histórico de origem x matriz vigente do curso (sem criar caso). */
export default function EquivalenciaTab() {
  const cursos = useApi<any>("/academico/programs");
  const cfg = useConfigAD();
  const [programId, setProgramId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [texto, setTexto] = useState(EXEMPLO);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function simular() {
    setErr(null); setRes(null); setBusy(true);
    try { setRes(await call("POST", `${AD}/equivalencias/simular`, { programId, studentId: studentId || undefined, texto })); } catch (e: any) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Section title="Avisos de equivalência de disciplinas">
      <Alert severity="info" sx={{ mb: 2 }}>
        Compara o histórico de origem com a matriz vigente do curso (nome, ementa e carga horária) e sugere equivalência ou dispensa, avisando sobre reprovação, prazo de validade, pré-requisito e conflitos com o histórico do aluno já cadastrado.
        {cfg ? ` Aproveitamento mínimo: ${cfg.percentualAproveitamento}% da carga · similaridade mínima: ${cfg.similaridadeMinima}% · validade: ${cfg.validadeAproveitamentoAnos} anos (configurável por administração).` : ""} {AVISO_AGENTE}
      </Alert>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 2 }}>
        <TextField size="small" select label="Curso de destino" value={programId} onChange={(e) => setProgramId(e.target.value)} required>
          {itemsOf(cursos.data).map((c: any) => <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>)}
        </TextField>
        <StudentPicker value={studentId} onChange={setStudentId} label="Aluno (opcional — checa o histórico local)" />
        <TextField size="small" multiline minRows={6} label="Disciplinas do histórico de origem" value={texto} onChange={(e) => setTexto(e.target.value)} sx={{ gridColumn: { md: "1 / -1" } }}
          helperText="Uma por linha: Disciplina | Carga horária | Nota | Situação | Ano. Para melhor resultado inclua linhas “Ementa (Disciplina): texto”." />
      </Box>
      <Button variant="contained" onClick={simular} disabled={!programId || !texto.trim() || busy}>{busy ? "Simulando…" : "Simular equivalências"}</Button>
      {err && <Alert severity="error" sx={{ mt: 2 }}>{err}</Alert>}
      {res && (
        <Box sx={{ mt: 2, display: "grid", gap: 1.2 }}>
          {res.matrizComDisciplinas === 0 && <Alert severity="warning">O curso não tem matriz vigente nem disciplinas cadastradas (Acadêmico › Matrizes).</Alert>}
          {res.sugestoes.map((s: any, i: number) => (
            <Paper key={i} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                <Typography sx={{ fontWeight: 800, flex: 1, minWidth: 200, overflowWrap: "anywhere" }}>{s.origem} <small>({s.origemCargaHoraria ?? "—"} h)</small></Typography>
                <Chip size="small" color={s.sugestao === "EQUIVALENCIA" ? "success" : s.sugestao === "DISPENSA_PARCIAL" ? "warning" : "default"} label={label(s.sugestao)} />
              </Box>
              <Typography variant="body2">{s.destino ? <>→ <b>{s.destino}</b> ({s.cargaDestino} h) · similaridade {s.similaridade}% · carga coberta {s.razaoCarga}%</> : "Sem correspondente na matriz."}</Typography>
              {s.avisos.map((a: any, k: number) => <Alert key={k} severity={a.gravidade === "ALTA" ? "error" : a.gravidade === "MEDIA" ? "warning" : "info"} sx={{ mt: 0.7, py: 0 }}>{a.texto}</Alert>)}
            </Paper>
          ))}
        </Box>
      )}
    </Section>
  );
}
