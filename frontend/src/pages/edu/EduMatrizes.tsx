import EduShell from "../../edu/EduShell";
import MatrizesPage from "../../edu/academico2/MatrizesPage";

export default function EduMatrizes() {
  return (
    <EduShell title="Matrizes e fluxograma" subtitle="Matriz curricular por módulos, bimestres, semestres ou anos; pré-requisitos, equivalências, fluxograma e simulador de integralização.">
      <MatrizesPage />
    </EduShell>
  );
}
