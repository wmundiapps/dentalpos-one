import { Alert, Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import PublicShell, { H, P, useInstituicao } from "./PublicShell";
import { ROTULO_BASE } from "./publicApi";

export default function PoliticaPrivacidade() {
  const { dados, erro } = useInstituicao("/politica");
  const inst = dados?.instituicao;
  const dpo = dados?.encarregado;
  const nome = inst?.nomeFantasia || inst?.nome || "a Instituição";
  return (
    <PublicShell titulo="Política de Privacidade" subtitulo="Como tratamos os dados pessoais de alunos, candidatos, egressos, responsáveis e usuários (Lei nº 13.709/2018 — LGPD)." instituicao={inst?.nome}>
      {erro && <Alert severity="info" sx={{ mb: 2 }}>{erro} A parte geral desta política continua válida.</Alert>}
      <H>1. Quem somos (controlador)</H>
      <P>{nome}{inst?.cnpj ? `, CNPJ ${inst.cnpj}` : ""}{inst?.endereco ? `, ${inst.endereco}` : ""}, é a controladora dos dados pessoais tratados neste sistema. A plataforma de gestão é fornecida pela WMundi (DentalPos One / EduMaster Pro), que atua como <b>operadora</b>, tratando os dados apenas conforme as instruções da instituição.</P>
      <H>2. Encarregado pelo tratamento de dados (DPO)</H>
      {dpo ? (
        <P><b>{dpo.nome}</b>{dpo.cargo ? ` — ${dpo.cargo}` : ""}. E-mail: <b>{dpo.email}</b>{dpo.telefone ? ` · Telefone: ${dpo.telefone}` : ""}{dpo.horarioAtendimento ? ` · Atendimento: ${dpo.horarioAtendimento}` : ""}.</P>
      ) : (
        <P>{dados?.aviso || "O encarregado será divulgado aqui. Enquanto isso, utilize o Portal do Titular."}</P>
      )}
      <H>3. Quais dados tratamos e para quê</H>
      <P>Tratamos somente os dados necessários para cada finalidade, com a base legal indicada. O quadro abaixo é gerado a partir do inventário de tratamento (art. 37 da LGPD) mantido pela instituição.</P>
      {(dados?.atividades ?? []).length > 0 ? (
        <Box sx={{ overflowX: "auto", mb: 2 }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Atividade</TableCell><TableCell>Dados</TableCell><TableCell>Base legal</TableCell><TableCell>Guarda</TableCell><TableCell>Compartilhamento</TableCell></TableRow></TableHead>
            <TableBody>
              {dados!.atividades.map((a: any) => (
                <TableRow key={a.atividade}>
                  <TableCell sx={{ minWidth: 180 }}><b>{a.atividade}</b><Typography variant="caption" component="div" color="text.secondary">{a.finalidade}</Typography>
                    {a.dadosSensiveis && <Chip size="small" color="warning" label="dado sensível" sx={{ mr: 0.5 }} />}{a.dadosMenores && <Chip size="small" label="menores" />}</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>{(a.categoriasDados ?? []).join(", ")}</TableCell>
                  <TableCell>{ROTULO_BASE[a.baseLegal] ?? a.baseLegal}</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>{a.retencao ?? "—"}</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>{(a.compartilhamento ?? []).join("; ") || "Não há"}{a.transferenciaInternacional ? " (pode envolver transferência internacional)" : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ) : <P>O inventário detalhado será publicado pela instituição.</P>}
      <H>4. Compartilhamento</H>
      <P>Compartilhamos dados apenas quando necessário: com órgãos reguladores (por exemplo, MEC/INEP), com prestadores que nos ajudam a operar o sistema (operadores, sob contrato de proteção de dados), com instituições financeiras para cobrança e com empresas concedentes de estágio quando você participa do programa. Não vendemos dados pessoais.</P>
      <H>5. Seus direitos (art. 18)</H>
      <P>Você pode, a qualquer momento e gratuitamente: confirmar a existência de tratamento; acessar seus dados; corrigir dados; pedir anonimização, bloqueio ou eliminação de dados desnecessários ou tratados com consentimento; solicitar portabilidade; saber com quem compartilhamos; revogar consentimentos; opor-se a tratamentos; e pedir revisão de decisões automatizadas. Responderemos em até <b>{dados?.prazoRespostaDias ?? 15} dias</b>. Faça seu pedido no <a href="/portal-titular">Portal do Titular</a> ou fale com o encarregado.</P>
      <H>6. Quanto tempo guardamos</H>
      <P>Guardamos os dados pelo tempo necessário à finalidade e às obrigações legais. <b>O histórico escolar, diplomas, notas, frequência e registros fiscais são de guarda obrigatória</b> (art. 16, I da LGPD) e não são eliminados a pedido; ficam com acesso restrito. Dados de candidatos não matriculados, mensagens e perfis de risco são eliminados ou anonimizados após prazos definidos pela instituição.</P>
      <H>7. Crianças, adolescentes e dados sensíveis</H>
      <P>Para menores de 18 anos, pedimos o consentimento de um dos pais ou do responsável legal quando a finalidade depende de consentimento (art. 14). Dados sensíveis (como saúde e deficiência, usados para apoio e acessibilidade) têm base legal específica, acesso restrito às equipes autorizadas e <b>registro de quem os acessou</b>.</P>
      <H>8. Segurança</H>
      <P>Adotamos medidas como controle de acesso por perfil, autenticação em duas etapas, criptografia em trânsito, varredura de arquivos enviados, registro de eventos de segurança e backups. Em caso de incidente com risco ou dano relevante, comunicaremos você e a ANPD em até 3 dias úteis.</P>
      <H>9. Cookies</H>
      <P>Usamos cookies estritamente necessários (sem consentimento) e, apenas se você permitir, cookies de preferências, estatísticas e campanhas. Você controla isso pelo botão “Cookies” no rodapé desta página.</P>
      <H>10. Alterações e contato</H>
      <P>Esta política pode ser atualizada; a data da última revisão do inventário é {dados?.revisadoEm ? new Date(dados.revisadoEm).toLocaleDateString("pt-BR") : "informada pela instituição"}. Em caso de dúvida ou reclamação, fale com o encarregado; você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</P>
    </PublicShell>
  );
}
