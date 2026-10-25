# Atendimento a Autoridades — Ordens Judiciais e Requisições de Dados (Vendeu)

> MINUTA — aguardando aprovação do Robson e revisão da Dra. Roberta antes de entrar em vigor.

Documento interno. Versão 2026-10-25.

Objetivo: responder com rapidez e segurança a pedidos de dados sobre quem publicou um anúncio (por exemplo, produto furtado ou golpe), **sem entregar mais do que a lei exige** e **sem recusar o que a lei manda entregar**.

## 1. Onde chega

Pedidos podem chegar por ofício, e-mail (suporte@vendeu.app, privacidade@vendeu.app), correio ou sistema judicial. Quem receber encaminha **no mesmo dia** ao(à) Encarregado(a) e ao jurídico. Ninguém da equipe responde sozinho.

## 2. Passo a passo

1. **Registrar** o recebimento: data, hora, órgão, nº do processo/inquérito, prazo.
2. **Verificar a autenticidade**: conferir o órgão, o magistrado/delegado, contato oficial, assinatura e, se houver dúvida, ligar para o número oficial do órgão. Desconfie de e-mails de domínio estranho e de urgência extrema (há golpes que fingem ser autoridade).
3. **Verificar o tipo de pedido e a base legal** (seção 3).
4. **Verificar se o pedido é específico**: identifica o anúncio, a URL, a conta ou o período.
5. **Autorização** (seção 4).
6. **Levantar os dados** (seção 5), com extração dos registros.
7. **Responder** no prazo, por canal seguro, com o ofício de resposta (modelo na seção 8).
8. **Registrar** o atendimento (seção 7).

## 3. Quando fornecer

| Pedido | Pode fornecer? |
|---|---|
| **Ordem judicial** específica (inclusive para fornecimento de registros de conexão e de acesso a aplicações, art. 22 do Marco Civil) | Sim, no que a ordem determinar |
| **Requisição legal** de autoridade com poder próprio (por exemplo, Ministério Público ou delegado de polícia, nos limites da lei) para **dados cadastrais** | Sim, dados cadastrais (nome, qualificação, filiação, endereço), nos termos da lei aplicável (ex.: Lei 12.850/2013, art. 15; Lei 9.613/1998, art. 17-B; Código de Processo Penal, art. 13-A) |
| Pedido de **particular**, advogado ou vítima sem ordem judicial | **Não.** Orientar a registrar boletim de ocorrência ou ajuizar medida judicial (inclusive pedido de fornecimento de registros, art. 22 do Marco Civil) |
| Pedido de autoridade estrangeira | Não diretamente; encaminhar ao jurídico (cooperação internacional) |
| Pedido genérico, sem identificar anúncio, conta ou período | Pedir esclarecimento à autoridade |
| Preservação de dados (guarda cautelar) | Sim: preservar os dados pelo prazo pedido, sem entregar, até haver ordem |

Em dúvida, o jurídico decide. **Não** entregar dados por simples e-mail de "delegado" ou "advogado" não verificado.

## 4. Quem autoriza

| Etapa | Responsável |
|---|---|
| Triagem e verificação | Encarregado(a) |
| Análise jurídica | Dra. Roberta (ou advogado indicado) |
| Autorização final de entrega | Encarregado(a) + jurídico; Robson, em casos de maior impacto (sigilo, volume grande, mensagens, mídia) |
| Extração e envio | Responsável técnico, sob orientação do(a) Encarregado(a) |

## 5. O que fornecer

Apenas o que o pedido ou a lei especifica. Em regra:

**Dados de origem do anúncio:**
- IP (e cadeia de proxies) da criação e da publicação do anúncio, com **data, hora e fuso horário** (preferencialmente UTC e UTC-3);
- IP de login(s) associados, quando pedido;
- e-mail e telefone cadastrados e verificados;
- navegador (*user-agent*), idioma e identificador de dispositivo (*hash*);
- declaração de origem assinada (texto, *hash*, nome, IP, data/hora, versão).

**Dados cadastrais:** nome, CPF/CNPJ, endereço, data de nascimento.

**Conteúdo do anúncio:** texto, fotos, preço, categoria, data de criação e retirada.

Preservar a integridade: exportar em arquivo, gerar *hash* do arquivo (SHA-256) e informar na resposta.

## 6. O que NÃO fornecer sem ordem judicial

- **Conteúdo das mensagens** entre usuários (comunicações privadas): só por ordem judicial (art. 22 e art. 7º, II e III, do Marco Civil; Constituição, art. 5º, XII).
- **Registros de acesso a aplicações e de conexão**, quando o pedido vier sem ordem judicial e a autoridade não tiver poder legal para requisitar (IP é registro: tratar com ordem judicial).
- **Documentos de verificação** (RG/CNH, selfie, comprovante de endereço, cartão CNPJ) e outros dados pessoais além do pedido: somente com ordem judicial específica; entregar o mínimo.
- Dados de **outros usuários** não indicados na ordem.
- Dados que a ordem não menciona. Em caso de ordem ampla, pedir delimitação.

Se a ordem for desproporcional, contrária à lei ou impossível de cumprir, o jurídico avalia manifestação, esclarecimento ou recurso **dentro do prazo**.

## 7. Registro do atendimento

Guardar por 5 anos, em pasta restrita:

| Campo | Preenchimento |
|---|---|
| Nº interno / data e hora de recebimento | |
| Órgão / autoridade / nº do processo | |
| Tipo (ordem judicial, requisição, preservação) | |
| Base legal invocada | |
| Anúncio / conta / período | |
| Quem verificou a autenticidade | |
| Quem autorizou / data | |
| Dados entregues (lista) e *hash* do arquivo | |
| Dados negados e motivo | |
| Canal e data de envio | |
| Prazo cumprido? | |
| Titular notificado? (ver abaixo) | |

**Aviso ao titular:** em regra, não avisar quando houver sigilo ou ordem de não divulgação, ou risco à investigação. Sem sigilo, o jurídico decide se avisa o titular.

**Relatório de transparência:** [avaliar] resumo anual com o número de pedidos, sem dados pessoais.

## 8. Modelo de ofício de resposta

**[RAZÃO SOCIAL DA OPERADORA]** — CNPJ [CNPJ] — [ENDEREÇO]

[Cidade], [data].

A(o) Ilmo(a). Sr(a). [autoridade]
[Órgão / Vara / Delegacia]
Ref.: Processo/Inquérito nº [número] — Ofício/Ordem nº [número] de [data]

Assunto: Resposta à [ordem judicial / requisição] — plataforma Vendeu

Prezado(a) Senhor(a),

A [RAZÃO SOCIAL DA OPERADORA], operadora da plataforma de anúncios Vendeu, em resposta ao ofício em referência, recebido em [data], informa:

1. **Natureza do serviço.** O Vendeu é plataforma de anúncios; não participa da negociação, não recebe nem repassa o valor do negócio e não entrega bens.

2. **Anúncio/conta.** Em relação ao anúncio [identificador/URL] e à conta [identificador], foram localizados os dados abaixo, fornecidos nos limites da [ordem / requisição legal / art. __ da Lei __]:

| Informação | Dado |
|---|---|
| Nome / CPF ou CNPJ (cadastro) | [ ] |
| E-mail e telefone verificados | [ ] |
| IP de criação/publicação do anúncio | [IP], em [data/hora], UTC-3 |
| IP de login(s), se solicitado | [ ] |
| Navegador / idioma / dispositivo (*hash*) | [ ] |
| Declaração de origem (versão, data/hora, IP) | [ ] |

3. **Integridade.** Os dados constam do arquivo anexo, cujo *hash* SHA-256 é [hash].

4. **Dados não fornecidos.** [Conteúdo de mensagens, documentos de verificação e demais dados não abrangidos] não foram fornecidos por não constarem na ordem / dependerem de ordem judicial específica (art. 22 da Lei 12.965/2014). Colocamo-nos à disposição para cumprir nova determinação.

5. **Preservação.** Os dados do anúncio e da conta foram preservados pelo prazo de [__] dias, a contar desta data.

6. **Contato.** Para esclarecimentos: [nome do responsável], privacidade@vendeu.app, [telefone].

Atenciosamente,

[Nome], [cargo]
[RAZÃO SOCIAL DA OPERADORA]

Anexo: arquivo [nome], hash SHA-256 [ ].

## 9. Prazos

- Cumprir o prazo da ordem (em geral, 5 a 15 dias).
- Se não for possível, pedir dilatação **antes** do vencimento, com justificativa.
- Em pedidos de urgência (risco à vida, sequestro), acionar o jurídico imediatamente.
