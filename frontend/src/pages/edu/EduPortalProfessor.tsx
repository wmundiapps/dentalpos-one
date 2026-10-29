import { Alert, Box, Tab, Tabs, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import DiarioTab from "../../edu/notas/DiarioTab";
import RevisoesTab from "../../edu/notas/RevisoesTab";
import ProfTurmas from "../../edu/professor/ProfTurmas";
import { ProfAlertas, ProfAvaliacoes, ProfDisponibilidade, ProfHorario, ProfJustificativas, ProfPainel, ProfProvas } from "../../edu/professor/ProfOutros";

const ABAS: Array<[string, string]> = [
  ["painel", "Painel"], ["turmas", "Minhas turmas e diário"], ["horarios", "Horários"], ["notas", "Notas e avaliações"], ["provas", "Provas e banco de questões"],
  ["revisoes", "Revisões recebidas"], ["justificativas", "Justificativas de faltas"], ["alertas", "Risco de evasão"], ["avaliacoes", "Minhas avaliações"], ["disponibilidade", "Disponibilidade e carga"],
];

/** Portal do professor: turmas, diário (chamada por lista/manual/QR), notas, materiais, provas, revisões, desempenho e carga horária. */
export default function EduPortalProfessor() {
  const [params, setParams] = useSearchParams();
  const aba = params.get("aba") || "painel";
  const ir = (k: string) => setParams((p) => { const n = new URLSearchParams(p); n.set("aba", k); return n; }, { replace: true });
  return (
    <EduShell title="Portal do Professor" subtitle="Turmas, diário de classe, notas, materiais, provas, revisões e acompanhamento dos alunos.">
      <Tabs value={aba} onChange={(_, v) => ir(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2 }} aria-label="Seções do portal do professor">
        {ABAS.map(([k, l]) => <Tab key={k} value={k} label={l} />)}
      </Tabs>
      <Box>
        {aba === "painel" && <ProfPainel onIr={ir} />}
        {aba === "turmas" && <ProfTurmas />}
        {aba === "horarios" && <ProfHorario />}
        {aba === "notas" && (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            <Alert severity="info">Lance notas respeitando a regra de avaliação de cada disciplina (pesos, médias, recuperação e prazo de lançamento). Atividades da sala virtual podem alimentar o diário automaticamente.</Alert>
            <DiarioTab />
          </Box>
        )}
        {aba === "provas" && <ProfProvas />}
        {aba === "revisoes" && <Box sx={{ display: "grid", gap: 1 }}><Typography color="text.secondary">Pedidos de revisão de nota feitos pelos alunos das suas turmas: emita o parecer dentro do prazo.</Typography><RevisoesTab /></Box>}
        {aba === "justificativas" && <ProfJustificativas />}
        {aba === "alertas" && <ProfAlertas />}
        {aba === "avaliacoes" && <ProfAvaliacoes />}
        {aba === "disponibilidade" && <ProfDisponibilidade />}
      </Box>
    </EduShell>
  );
}
