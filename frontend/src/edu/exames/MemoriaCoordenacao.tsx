// Coordenação: quantos alunos jogam o jogo da memória e a média por curso e disciplina (visão da instituição).
import { Table, TableBody, TableCell, TableHead, TableRow, Typography, Box } from "@mui/material";
import { COLORS, Kpi, KpiRow, LoadBox, Section, semaforo, useApi } from "../desempenho/kit";
import { X } from "./comum";

type Linha = { nome: string; alunos: number; series: number; media: number | null; tentativas: number; tacas: number; ouro: number; prata: number; bronze: number };
type Resumo = { alunos: number; series: number; media: number | null; tentativas: number; tacas: number; ouro: number; prata: number; bronze: number; disciplinas: Linha[] };

const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toFixed(1).replace(".", ","));

export default function MemoriaCoordenacao() {
  const r = useApi<Resumo>(`${X}/memoria/resumo`);
  const d = r.data;
  return (
    <Section title="Jogo da memória (treino para ENADE, ENAMED e OAB)">
      <LoadBox loading={r.loading} error={r.error} onRetry={r.reload}>
        {d && (d.series === 0 ? (
          <Typography color="text.secondary">Nenhum aluno jogou ainda. Quando jogarem, a média por curso e disciplina aparece aqui.</Typography>
        ) : (
          <>
            <KpiRow>
              <Kpi title="Alunos que jogaram" value={d.alunos} hint={`${d.tentativas} tentativa(s)`} color={COLORS.ok} />
              <Kpi title="Séries concluídas" value={d.series} hint="melhor resultado de cada aluno por série" color={COLORS.ok} />
              <Kpi title="Média das notas" value={num(d.media)} hint="de 0 a 10" color={semaforo((d.media ?? 0) * 10, 70, 50)} />
              <Kpi title="Taças de ouro" value={d.tacas} hint={`${d.ouro} ouro · ${d.prata} prata · ${d.bronze} bronze`} color={COLORS.warn} />
            </KpiRow>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Curso · disciplina</TableCell><TableCell align="right">Alunos</TableCell><TableCell align="right">Séries</TableCell><TableCell align="right">Média</TableCell><TableCell align="right">Taças</TableCell></TableRow></TableHead>
                <TableBody>
                  {d.disciplinas.map((l) => (
                    <TableRow key={l.nome}><TableCell>{l.nome}</TableCell><TableCell align="right">{l.alunos}</TableCell><TableCell align="right">{l.series}</TableCell><TableCell align="right">{num(l.media)}</TableCell><TableCell align="right">{l.tacas}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>É um jogo de treino: as notas são calculadas no navegador do aluno e não valem como avaliação.</Typography>
          </>
        ))}
      </LoadBox>
    </Section>
  );
}
