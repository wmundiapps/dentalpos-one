import PublicShell, { H, P, useInstituicao } from "./PublicShell";

export default function TermosDeUso() {
  const { dados } = useInstituicao("/dpo");
  const nome = dados?.instituicao?.nomeFantasia || dados?.instituicao?.nome || "a Instituição";
  return (
    <PublicShell titulo="Termos de Uso" subtitulo="Regras para utilização dos portais e sistemas acadêmicos e administrativos." instituicao={dados?.instituicao?.nome}>
      <H>1. Aceitação</H>
      <P>Ao acessar os portais e sistemas de {nome} (o “Sistema”), você declara ter lido estes Termos e a <a href="/privacidade">Política de Privacidade</a>. Se você for menor de 18 anos, o uso deve ser acompanhado pelo responsável legal.</P>
      <H>2. Conta e segurança</H>
      <P>Sua conta é pessoal e intransferível. Mantenha sua senha em sigilo, ative a autenticação em duas etapas quando disponível e avise imediatamente a instituição em caso de suspeita de acesso indevido. Atividades realizadas com sua conta são registradas para sua segurança e para auditoria.</P>
      <H>3. Uso adequado</H>
      <P>É proibido: tentar acessar dados de terceiros; enviar arquivos com vírus ou conteúdo ilícito, ofensivo ou pornográfico; contornar mecanismos de segurança; usar o Sistema para spam ou fraude; e copiar conteúdos protegidos por direitos autorais sem autorização. Arquivos enviados passam por verificação automática e podem ser recusados.</P>
      <H>4. Conteúdos e propriedade intelectual</H>
      <P>Materiais didáticos, marcas e o próprio Sistema pertencem à instituição, a seus autores ou aos licenciantes. O uso é pessoal e para fins acadêmicos.</P>
      <H>5. Dados pessoais</H>
      <P>O tratamento de dados pessoais segue a Política de Privacidade e a LGPD. Você pode exercer seus direitos no <a href="/portal-titular">Portal do Titular</a>.</P>
      <H>6. Disponibilidade</H>
      <P>Empenhamo-nos para manter o Sistema disponível, mas podem ocorrer interrupções para manutenção ou por falhas fora do nosso controle.</P>
      <H>7. Penalidades</H>
      <P>O descumprimento destes Termos pode levar à suspensão do acesso e às medidas previstas no regimento da instituição e na lei.</P>
      <H>8. Alterações e foro</H>
      <P>Os Termos podem ser atualizados, com aviso no Sistema. Fica eleito o foro do domicílio da instituição, ressalvados os direitos do consumidor. [Completar com os dados da instituição e validar com advogado.]</P>
    </PublicShell>
  );
}
