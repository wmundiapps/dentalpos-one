# BLOCO 4 — Laboratório + DentalPos Design

## Objetivo
Transformar Laboratório e DentalPos Design em um fluxo único, evitando redigitação e mantendo retorno do paciente, ficha protética e arquivos CAD vinculados ao mesmo caso.

## Laboratório
- Cadastro e edição de trabalho.
- Tipo de moldagem analógica/digital.
- Conferência dos itens recebidos conforme o tipo de moldagem.
- Cor obrigatória do dente, sistema de cor e observações de caracterização.
- Dentes envolvidos, material, técnico, prioridade, prazo e retorno do paciente.
- Idade, sexo, biotipo facial, formato facial e descrição.
- Histórico de alterações por trabalho.
- Envio direto para DentalPos Design.
- Status do Design visível na fila.
- Agenda continua podendo criar trabalhos protéticos automaticamente; alterações de retorno permanecem sincronizadas.

## DentalPos Design
- Caso do laboratório é aberto como contexto clínico no Design.
- Importação independente do modelo principal, antagonista e registro de mordida.
- Visualização simultânea do antagonista e registro de mordida, com transparências distintas.
- Comando Alpha de posicionamento intermaxilar utilizando o registro de mordida como referência geométrica inicial.
- Banco procedural Alpha para os 32 dentes FDI, com dimensões/variações por grupo dental.
- Caracterizações: jovem, adulto, idoso, natural suave e marcado.
- Ferramentas Alpha interativas sobre a malha: delimitar término, acrescentar, remover, suavizar e esculpir.
- Delimitação do término cria marcadores visuais na superfície.
- Ferramentas de acréscimo/remoção/esculpir deformam a malha localmente por pincel com intensidade configurável.
- Suavização atua localmente na área clicada.
- Guia oclusal baseado nas seis chaves de Andrews e nas regras de forma de arco definidas para o projeto.

## Backend preparado
- Modelos Prisma LaboratoryWork, LaboratoryWorkHistory e DentalDesignCase.
- Multi-tenant por clínica/tenant.
- Endpoints de listagem, criação, edição e envio do laboratório ao Design.
- Endpoints de listagem/edição de casos do Design.
- Auditoria de criação/edição laboratorial.

## Observação clínica
As rotinas CAD de geração procedural, escultura e posicionamento pelo registro de mordida são ALPHA. Elas são apropriadas para desenvolvimento/teste da interface e do motor geométrico, mas não devem ser usadas para fabricação clínica sem validação geométrica, dimensional e oclusal.
