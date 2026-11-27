import EduShell from "../../edu/EduShell";
import CriarAcessos from "../../edu/academico/CriarAcessos";

export default function EduCriarAcessos() {
  return (
    <EduShell title="Criar acessos" subtitle="Login de aluno por RA, professor e gestor de polo por nome — senha inicial é a data de nascimento, com troca obrigatória no 1º acesso.">
      <CriarAcessos />
    </EduShell>
  );
}
