import { Box, Chip, Paper, Typography } from "@mui/material";
import type { ReactNode } from "react";

function LegalShell({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", py: { xs: 4, md: 8 }, px: 3 }}>
      <Box sx={{ maxWidth: 760, mx: "auto" }}>
        <Chip
          color="warning"
          variant="outlined"
          label="Rascunho — pendente de revisão por advogado antes de valer como documento oficial"
          sx={{ mb: 3 }}
        />
        <Typography variant="h3" sx={{ fontWeight: 900, mb: 1 }}>{title}</Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>Última atualização: {updatedAt}</Typography>
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, borderRadius: 3 }}>
          <Box sx={{ "& h2": { fontWeight: 800, fontSize: "1.15rem", mt: 4, mb: 1.5 }, "& p": { mb: 2, lineHeight: 1.7 }, "& ul": { mb: 2, pl: 3, lineHeight: 1.7 }, "& li": { mb: 0.5 } }}>
            {children}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}

export function TermsOfUse() {
  return (
    <LegalShell title="Termos de Uso" updatedAt="2026">
      <p>
        Estes Termos de Uso regulam a utilização do EduMaster Pro ("Plataforma"), sistema de gestão
        educacional oferecido pela WMundi Apps ("Fornecedora") às instituições de ensino contratantes
        ("Instituição") e aos usuários autorizados pela Instituição (administradores, coordenadores,
        professores, alunos e responsáveis legais).
      </p>

      <h2>1. Objeto</h2>
      <p>
        A Plataforma oferece módulos de gestão acadêmica, financeira, de conteúdo, avaliação, secretaria,
        infraestrutura, suprimentos, governança, captação, pesquisa e jurídico, conforme contratado pela
        Instituição em proposta comercial específica.
      </p>

      <h2>2. Cadastro e acesso</h2>
      <p>
        O acesso é individual e intransferível, vinculado a um papel (perfil) definido pela Instituição.
        Cada usuário é responsável por manter a confidencialidade de sua senha e por toda atividade realizada
        com suas credenciais. A Instituição é responsável por conceder, revisar e revogar acessos de acordo
        com o vínculo de cada usuário.
      </p>

      <h2>3. Responsabilidades da Instituição</h2>
      <ul>
        <li>Garantir a veracidade dos dados inseridos na Plataforma;</li>
        <li>Obter as bases legais e consentimentos necessários para o tratamento de dados de alunos, incluindo menores de idade, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD);</li>
        <li>Definir e manter atualizada a matriz de permissões de seus usuários;</li>
        <li>Comunicar à Fornecedora qualquer uso indevido ou suspeita de violação de segurança.</li>
      </ul>

      <h2>4. Responsabilidades da Fornecedora</h2>
      <ul>
        <li>Manter a Plataforma disponível, ressalvadas manutenções programadas e eventos fora de seu controle razoável;</li>
        <li>Adotar medidas técnicas e administrativas de segurança da informação compatíveis com a natureza dos dados tratados;</li>
        <li>Atuar como operadora de dados pessoais nos termos definidos na Política de Privacidade.</li>
      </ul>

      <h2>5. Uso de inteligência artificial</h2>
      <p>
        Alguns módulos (geração e correção de questões, resumo de conteúdo, triagem de atos regulatórios)
        utilizam modelos de inteligência artificial de terceiros para processar o conteúdo fornecido pela
        Instituição. O resultado gerado por IA é uma sugestão e não substitui a revisão humana, especialmente
        em decisões que afetam a avaliação, aprovação ou situação acadêmica do aluno.
      </p>

      <h2>6. Pagamento e vigência</h2>
      <p>
        As condições comerciais (plano, valores, forma de pagamento e vigência) constam da proposta
        comercial aceita pela Instituição. O não pagamento pode resultar em suspensão do acesso, mediante
        aviso prévio.
      </p>

      <h2>7. Propriedade intelectual</h2>
      <p>
        O software, sua estrutura, design e marca EduMaster Pro são de propriedade da Fornecedora. Os dados
        acadêmicos, financeiros e administrativos inseridos pela Instituição permanecem de sua propriedade,
        sendo a Fornecedora mera operadora/processadora.
      </p>

      <h2>8. Limitação de responsabilidade</h2>
      <p>
        A Plataforma é uma ferramenta de apoio à gestão. A Fornecedora não se responsabiliza por decisões
        acadêmicas, financeiras, jurídicas ou regulatórias tomadas pela Instituição com base nas informações
        processadas, nem por conteúdo gerado por inteligência artificial sem revisão humana prévia.
      </p>

      <h2>9. Rescisão e exportação de dados</h2>
      <p>
        Encerrado o contrato, a Instituição poderá solicitar a exportação de seus dados em formato
        estruturado, dentro do prazo definido na proposta comercial, após o qual os dados poderão ser
        eliminados nos termos da Política de Privacidade.
      </p>

      <h2>10. Alterações</h2>
      <p>
        Estes Termos podem ser atualizados para refletir evolução da Plataforma ou da legislação aplicável.
        Alterações relevantes serão comunicadas à Instituição com antecedência razoável.
      </p>

      <h2>11. Legislação aplicável</h2>
      <p>
        Estes Termos são regidos pela legislação brasileira, com foro eleito na proposta comercial para
        dirimir eventuais controvérsias.
      </p>
    </LegalShell>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalShell title="Política de Privacidade" updatedAt="2026">
      <p>
        Esta Política de Privacidade descreve como o EduMaster Pro trata dados pessoais de alunos,
        responsáveis legais, professores e demais usuários, em conformidade com a Lei Geral de Proteção de
        Dados Pessoais (Lei 13.709/2018 — LGPD).
      </p>

      <h2>1. Papéis no tratamento de dados</h2>
      <p>
        A Instituição de ensino contratante é a <strong>controladora</strong> dos dados pessoais de seus
        alunos, responsáveis e colaboradores. A WMundi Apps, como fornecedora da Plataforma, atua como
        <strong> operadora</strong>, tratando os dados estritamente conforme as instruções e finalidades
        definidas pela Instituição.
      </p>

      <h2>2. Dados tratados</h2>
      <ul>
        <li><strong>Identificação:</strong> nome, e-mail, telefone, documento, data de nascimento;</li>
        <li><strong>Acadêmicos:</strong> matrícula, notas, frequência, histórico, documentos escolares;</li>
        <li><strong>Financeiros:</strong> mensalidades, pagamentos, dados de cobrança;</li>
        <li><strong>Conteúdo gerado pelo uso:</strong> submissões em fóruns, formulários, candidaturas e solicitações;</li>
        <li><strong>Técnicos:</strong> registros de acesso e auditoria, para segurança e rastreabilidade.</li>
      </ul>

      <h2>3. Dados de crianças e adolescentes</h2>
      <p>
        Por cobrir desde a educação infantil, a Plataforma pode tratar dados de menores de idade. Nesses
        casos, o tratamento é feito no melhor interesse do titular, com a Instituição responsável por obter
        o consentimento específico e em destaque de ao menos um dos pais ou do responsável legal, nos termos
        do art. 14 da LGPD, exceto quando a coleta for necessária para a própria prestação do serviço
        educacional.
      </p>

      <h2>4. Base legal</h2>
      <p>
        O tratamento ocorre, conforme o caso, com base na execução de contrato educacional, cumprimento de
        obrigação legal ou regulatória (ex.: registros exigidos pelo MEC), consentimento do titular ou de
        seu responsável, e legítimo interesse da Instituição na gestão de sua atividade-fim.
      </p>

      <h2>5. Compartilhamento</h2>
      <p>
        Dados podem ser compartilhados com prestadores de serviço necessários à operação da Plataforma —
        provedor de nuvem/armazenamento, provedor de inteligência artificial (para geração/correção de
        conteúdo), provedor de pagamentos e canais de comunicação (e-mail, WhatsApp) — sempre sob obrigação
        contratual de confidencialidade e limitação de uso à finalidade contratada.
      </p>

      <h2>6. Inteligência artificial</h2>
      <p>
        Textos submetidos aos módulos de IA (geração/correção de provas, resumo de conteúdo, triagem
        regulatória) são enviados a um provedor terceirizado de modelos de linguagem para processamento.
        Recomenda-se à Instituição evitar a inclusão de dados sensíveis desnecessários nesses textos.
      </p>

      <h2>7. Retenção e eliminação</h2>
      <p>
        Os dados são mantidos pelo período de vigência contratual e, após seu encerramento, pelo prazo
        necessário ao cumprimento de obrigações legais e regulatórias da área educacional, findo o qual
        serão eliminados ou anonimizados, salvo determinação legal em contrário.
      </p>

      <h2>8. Direitos do titular</h2>
      <p>
        Nos termos da LGPD, o titular (ou seu responsável legal) pode solicitar confirmação de tratamento,
        acesso, correção, anonimização, portabilidade, eliminação e informação sobre compartilhamento de seus
        dados, mediante solicitação à Instituição, controladora dos dados.
      </p>

      <h2>9. Segurança</h2>
      <p>
        A Plataforma adota controles de autenticação, controle de acesso por perfil (RBAC) multi-institucional,
        registro de auditoria e criptografia em trânsito. Nenhum sistema é absolutamente livre de risco; em
        caso de incidente de segurança relevante, a Instituição será notificada nos termos da LGPD.
      </p>

      <h2>10. Contato</h2>
      <p>
        Solicitações relacionadas a dados pessoais devem ser direcionadas à Instituição de ensino, como
        controladora. Para questões sobre o funcionamento da Plataforma como operadora, utilize os canais de
        suporte informados pela Instituição.
      </p>
    </LegalShell>
  );
}
