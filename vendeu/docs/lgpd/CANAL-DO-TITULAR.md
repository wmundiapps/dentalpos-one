# Canal do Titular — Fluxo Interno dos Pedidos (art. 18 da LGPD) (Vendeu)

> MINUTA — aguardando aprovação do Robson e revisão da Dra. Roberta antes de entrar em vigor.

Documento interno. Versão 2026-10-26.

**Prazo:** responder em até **15 dias** do pedido (art. 19, II, da LGPD). Confirmação de recebimento: em até **2 dias úteis**.

## 1. Por onde chegam

- No aplicativo: exportação em JSON (inclui pedidos e meio de recebimento); pedidos de correção, informação e revogação; eliminação de conta (com senha).
- E-mail: privacidade@vendeu.app (e suporte@vendeu.app, que encaminha no mesmo dia).
- Responsável: [ENCARREGADO(A) PELO TRATAMENTO DE DADOS].

## 2. Passo a passo

1. **Registrar** o pedido (data, canal, tipo, titular).
2. **Confirmar a identidade**: pedido feito de dentro da conta logada vale; por e-mail, responder só para o e-mail cadastrado e, se houver dúvida, pedir confirmação por código. **Não pedir documento a mais do que o necessário.**
3. **Classificar** o pedido (tabela abaixo).
4. **Executar** e **responder** em linguagem simples.
5. **Registrar** a resposta e guardar por 5 anos.

## 3. Tipos de pedido

| Direito (art. 18) | O que fazer | Limites e atenção |
|---|---|---|
| Confirmação de tratamento | Confirmar que existe tratamento e resumir | — |
| Acesso | Entregar os dados em formato legível (exportação JSON no aplicativo) | Não entregar dados de **outros** titulares (mensagens: apenas a parte do titular, ocultando dados de terceiros; pedidos: o contato do outro lado só se já foi liberado ao titular). **Nunca** entregar os *tokens* da conta Mercado Pago nem o código de retirada de outro pedido. Não entregar segredos de segurança (regras de triagem antifraude e de ocultação de contatos). O endereço de entrega, se ainda existir, é entregue só ao próprio comprador |
| Correção | Corrigir dado incompleto, inexato ou desatualizado | Mudança de nome/CPF/data de nascimento exige comprovação; reverifica identidade. Registros de origem **não são editados** (são imutáveis); anotar a correção ao lado. **Pedido em andamento:** o endereço de entrega só pode ser corrigido antes do envio, pelo suporte, com registro no histórico do pedido |
| Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos | Avaliar caso a caso | Mantêm-se os dados necessários à obrigação legal e ao exercício regular de direitos |
| Portabilidade | Exportação JSON | — |
| Eliminação (dados tratados com consentimento / eliminação da conta) | Eliminar a conta: dados de cadastro apagados; documentos de verificação eliminados; *tokens* da conta Mercado Pago apagados; endereço de entrega apagado; mensagens anonimizadas | **Mantêm-se**, com acesso restrito e pelo prazo legal: registros de origem (5 anos; mínimo de 6 meses pelo Marco Civil), aceites e declarações (5 anos), **pedidos, histórico do pedido, pagamentos, repasses e devoluções (5 anos, fiscal e defesa de direitos)**, registros de denúncias, disputas e bloqueios. Informar isso ao titular. Taxa de retirada pendente não é extinta. **A conta não pode ser eliminada com pedido em andamento** (aguardar o fim ou a decisão da disputa) |
| Informação sobre compartilhamento | Informar suboperadores (Vercel, Supabase, Mercado Pago, e-mail/SMS), **o outro lado de cada pedido depois do recebimento** (nome, telefone e e-mail) e autoridades, se houve atendimento (salvo sigilo) | **Não** divulgar pedido sigiloso de autoridade |
| Informação sobre a possibilidade de não consentir | Explicar consequências | — |
| Revogação do consentimento | Cessar o tratamento baseado em consentimento (ex.: marketing) | Não afeta tratamentos com outra base legal |
| Revisão de decisão automatizada (art. 20) | Encaminhar a revisão humana pela moderação e explicar critérios gerais. Inclui: recebimento automático (10 dias sem resposta após o envio), devolução automática por falta de envio, liberação automática do repasse após os 7 dias, ocultação de contatos e bloqueios por atraso de taxa | Segredo comercial/antifraude pode limitar detalhes. Decisão de **disputa** é humana; reabrir só com fato novo |
| Oposição a tratamento por legítimo interesse (art. 18, § 2º) | Avaliar; se prevalecer o interesse legítimo, explicar o motivo | — |

### 3.1. Pedidos específicos do novo fluxo

| Situação | O que fazer |
|---|---|
| "Quero que apaguem meu telefone/e-mail do contato do outro lado" | Explicar que, depois do recebimento, o contato foi liberado para devolução e garantia (execução de contrato). Pode pedir ocultação após o fim do prazo de devolução e da garantia, a avaliar caso a caso [definir regra com a Dra. Roberta]. Se houver uso abusivo pela outra parte, tratar como denúncia (MODERACAO-E-DENUNCIAS.md) |
| "Quero meu endereço de volta/apagado" | Se o pedido terminou, já foi apagado: confirmar. Se está em andamento, explicar que é necessário ao envio; orientar a cancelar o pedido (se ainda possível) |
| "Quero desconectar minha conta Mercado Pago" | Orientar a desconexão no aplicativo; só é possível sem anúncio no ar, pedido em andamento ou taxa pendente. Os *tokens* são apagados |
| "Quero ver as provas da disputa" | Entregar o que o titular enviou e o que a outra parte juntou, ocultando dados pessoais do outro que não sejam necessários; a justificativa da decisão é entregue em resumo |
| "Quero apagar mensagens do pedido" | Mensagens de pedido concluído ou em disputa são mantidas pelo prazo de defesa de direitos (5 anos); anonimizar o nome do titular apenas na eliminação da conta |

## 4. Quando negar ou limitar

Negar ou limitar apenas com motivo claro: identidade não confirmada; obrigação legal de guarda; exercício regular de direitos (disputa em curso); dados de terceiros; pedido manifestamente abusivo ou repetitivo. A resposta sempre diz o motivo e informa que o titular pode reclamar à ANPD.

## 5. Eliminação de conta — checagens antes de executar

1. **Pedido em andamento** (proposta, aguardando pagamento, pago, enviado, recebido dentro dos 7 dias, devolução ou disputa)? A eliminação **não** pode ser executada; informar o titular e a data prevista. Taxa de retirada pendente ou contestação em análise? Informar; o débito permanece.
2. Conta em apuração por fraude ou com ordem de preservação de autoridade? **Não eliminar registros** sob preservação; informar o titular, salvo sigilo.
3. Executar: apagar cadastro e documentos de verificação, apagar *tokens* da conta Mercado Pago e endereço de entrega, anonimizar mensagens, retirar anúncios, encerrar sessões. Manter os registros previstos na seção 3.
4. Enviar confirmação por e-mail.

## 6. Modelo de resposta

**Assunto:** Sobre o seu pedido — Vendeu

Olá, [nome].

Recebemos em [data] o seu pedido de [tipo]. Ele foi analisado e [atendido / atendido em parte / não pôde ser atendido].

[Resultado: o que foi feito / anexo da exportação / explicação.]

[Se houve limite: "Mantivemos [dado] porque [motivo legal], pelo prazo de [prazo]."]

Se não concordar, você pode escrever de novo para privacidade@vendeu.app ou reclamar à ANPD (gov.br/anpd).

[Nome] — Atendimento de Privacidade, Vendeu
[RAZÃO SOCIAL DA OPERADORA]

## 7. Registro

| Campo | Preenchimento |
|---|---|
| Nº / data do pedido / canal | |
| Titular (ID da conta) / identidade confirmada? | |
| Tipo | |
| Ações / Data da resposta (≤ 15 dias) | |
| Limites aplicados e fundamento | |
| Responsável | |

## 8. Indicadores

Medir mensalmente: pedidos recebidos, prazo médio, pedidos fora do prazo (meta zero), negativas e motivos.
