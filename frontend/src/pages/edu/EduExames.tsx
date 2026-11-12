import EduShell from "../../edu/EduShell";
import ExamesHub from "../../edu/exames/ExamesHub";

/** ENADE · ENAMED · OAB: preparação com trilhas, simulados comentados, flashcards e painel do coordenador. */
export default function EduExames() {
  return (
    <EduShell title="ENADE · ENAMED · OAB" subtitle="Trilhas de estudo, simulados com gabarito comentado, flashcards e acompanhamento da prontidão do curso. Questões autorais, sem garantia sobre a prova real.">
      <ExamesHub />
    </EduShell>
  );
}
