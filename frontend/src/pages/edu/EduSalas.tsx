import EduShell from "../../edu/EduShell";
import SalasPage from "../../edu/academico2/SalasPage";

export default function EduSalas() {
  return (
    <EduShell title="Salas e horários" subtitle="Cronograma por sala, turma e professor, turnos (manhã, tarde, noite e finais de semana), sugestão de alocação e detecção de conflitos.">
      <SalasPage />
    </EduShell>
  );
}
