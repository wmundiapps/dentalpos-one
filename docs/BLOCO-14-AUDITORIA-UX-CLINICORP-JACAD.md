# Bloco 14 — Auditoria UX Clinicorp/JACAD

Data da auditoria: 2026-08-24/25

## Objetivo

Usar Clinicorp e JACAD como referências funcionais e de organização de fluxo, sem copiar identidade visual, código, textos proprietários ou interface. O foco deste bloco é reduzir cliques, tornar o sistema mais previsível para cada setor e identificar lacunas antes da homologação.

## Referências públicas consultadas

- Clinicorp — site institucional e páginas públicas de funcionalidades/planos: https://www.clinicorp.com/
- Clinicorp — ferramentas: https://www.clinicorp.com/ferramentas
- JACAD — gestão educacional: https://www.jacad.com.br/
- JACAD — ensino superior: https://www.jacad.com.br/ensino-superior
- JACAD — base pública de conhecimento: https://ajuda.jacad.com.br/support/solutions

## Diagnóstico do DentalPos One antes deste bloco

### Pontos já fortes

- Menu setorial por Recepção, Sala de Atendimento, Marketing, Administrativo, Gestão, Laboratório, Comercial, Acadêmico e Configurações.
- Agenda com visão por dia/semana/mês, profissional, remarcação, status e lembretes.
- Cadastro central de pacientes conectado a prontuário, agenda, orçamento e financeiro.
- Prontuário, documentos clínicos, odontograma, tratamentos e DentalPos Design já possuem rotas próprias.
- Financeiro com contas a pagar/receber, vencimentos, baixa, cobranças REVAH e preparação para provedores.
- CRM, REVAH, Leads, Chatbot, Marketing, RH, Contábil/Fiscal, Backoffice e gestão executiva já estruturados.
- Academy já possuía catálogo, marketplace, teasers, certificados e pagamentos internacionais.

## Referência Clinicorp — comparação funcional

| Área | Referência observada | DentalPos One | Situação |
| --- | --- | --- | --- |
| Agenda | Agenda inteligente, confirmações, faltas/desmarcações, agendamento online | Agenda dia/semana/mês, lembretes, status, alertas | Forte, refinada neste bloco |
| Paciente | Cadastro, prontuário e histórico central | Cadastro central e atalhos clínicos | Forte, refinado neste bloco |
| Tratamento | Prontuário, especialidades, odontograma, orçamento | Prontuário, documentos, odontograma, orçamento por cenários | Forte |
| Financeiro | Receitas, pagamentos, contas a pagar, conciliação, cobrança | Pagar/receber, caixa, cobrança REVAH e provedores preparados | Parcial avançado |
| CRM/relacionamento | CRM, retorno, confirmação e campanhas | REVAH, CRM, Leads, Chatbot, Recall, Jornada | Forte |
| Indicadores | Dashboard, relatórios e gestão estratégica | Dashboard, BI, Centro de Comando, Painel Executivo | Forte |
| Estoque | Controle de estoque | Estoque já possui módulo próprio | Implementado |
| Assinaturas | Anamnese/assinatura digital e eletrônica | Documentos clínicos existem; assinatura precisa homologação específica | Pendente de homologação |
| Conciliação bancária | Fluxo financeiro e conciliação | Estrutura financeira preparada; integração bancária real depende de credenciais | Parcial |
| Crédito/SPC | Consulta/controle de inadimplência | Inadimplência própria existe; integração externa de crédito não é necessária para o piloto | Opcional futuro |

## Referência JACAD — comparação funcional

| Área | Referência observada | DentalPos One | Situação |
| --- | --- | --- | --- |
| Jornada do aluno | Matrícula até conclusão/diplomação | Academy estava concentrada em cursos/marketplace | Lacuna de UX corrigida parcialmente |
| Alunos | Cadastro, matrícula, situação acadêmica | Nova navegação e área operacional estruturada | Estrutura pronta; backend acadêmico avançado futuro |
| Cursos | Cursos, matrizes e organização acadêmica | Catálogo e cursos já existentes | Parcial |
| Professores | Cadastro e documentos | Nova área operacional estruturada | Estrutura pronta |
| Turmas | Turmas, horários e períodos | Nova área operacional estruturada | Estrutura pronta |
| Frequência | Registro/acompanhamento acadêmico | Nova área de frequência/documentos | Estrutura pronta; regras futuras |
| Financeiro acadêmico | Financeiro integrado | Nova área conectada conceitualmente ao financeiro central | Estrutura pronta; integração futura |
| Documentos | Gestão documental acadêmica | Área preparada | Parcial |
| Regulação/MEC | Fluxos regulatórios e diploma digital | Não homologado | Roadmap obrigatório antes de uso regulatório |
| Portal do aluno | Autoatendimento e serviços | Não existe portal acadêmico dedicado | Roadmap |

## Mudanças aplicadas no Bloco 14

1. Busca global funcional no cabeçalho, com atalho `/`, pesquisa de módulos e navegação por Enter/clique.
2. Sidebar agora reconhece corretamente itens com parâmetros de URL, como Contas a Pagar, Contas a Receber e seções acadêmicas.
3. Estado dos grupos abertos do menu é preservado localmente.
4. Agendamento online foi corrigido para funcionar com a base `/dentalposone/` e sem exigir login.
5. Link copiado pela Agenda agora respeita a URL base do deploy.
6. Agenda ganhou filtros rápidos de status e contadores operacionais para confirmação, espera, atendimento e faltas.
7. A janela da consulta ganhou atalhos para Prontuário e Financeiro do paciente.
8. Cadastro de pacientes ganhou atalhos diretos para Financeiro e Jornada do Paciente.
9. Financeiro aceita filtro por paciente vindo de outras telas.
10. Acadêmico foi reorganizado em Visão Geral, Alunos, Cursos, Professores, Turmas, Financeiro Acadêmico e Frequência/Documentos.
11. O módulo acadêmico diferencia claramente o que já funciona do que ainda depende de homologação regulatória ou backend específico.

## Itens que NÃO devem ser declarados como concluídos ainda

- Integração real com assinatura eletrônica/digital em produção.
- Conciliação bancária real sem credenciais e homologação do provedor.
- SPC/Serasa ou equivalente.
- Diploma Digital/MEC e demais obrigações regulatórias acadêmicas.
- Portal completo do aluno.
- Regras acadêmicas completas de matriz curricular, equivalências, dispensas e histórico.
- Integração real dos canais REVAH sem credenciais de cada provedor.

## Próxima etapa recomendada

Após validar visualmente o Bloco 14, seguir para homologação dos fluxos críticos: login/permissões, agenda → paciente → prontuário → orçamento → financeiro, contas a pagar/receber → contábil, RH → financeiro, REVAH/CRM e agendamento online. Só depois conectar credenciais reais e publicar a homologação online.
