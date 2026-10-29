import EduShell from "../../edu/EduShell";
import AlunosPage from "../../edu/academico2/AlunosPage";

export default function EduAlunos() {
  return (
    <EduShell title="Alunos" subtitle="Secretaria acadêmica: busca e filtros, ficha completa, contratos, documentos, relatórios e exportação para Excel.">
      <AlunosPage />
    </EduShell>
  );
}
