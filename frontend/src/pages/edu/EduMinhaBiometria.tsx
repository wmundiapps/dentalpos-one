import EduShell from "../../edu/EduShell";
import MinhaBiometria from "../../edu/presenca/MinhaBiometria";

/** Cadastro facial com consentimento (LGPD) e carteirinha QR — para alunos, docentes e colaboradores. */
export default function EduMinhaBiometria() {
  return (
    <EduShell title="Minha biometria e carteirinha" subtitle="Consentimento, cadastro e revogação do reconhecimento facial; carteirinha digital como alternativa." hero={false}>
      <MinhaBiometria />
    </EduShell>
  );
}
