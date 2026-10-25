# Plano de Resposta a Incidentes de Segurança (Vendeu)

> MINUTA — aguardando aprovação do Robson e revisão da Dra. Roberta antes de entrar em vigor.

Documento interno. Versão 2026-10-25.

**Incidente** = qualquer evento que possa causar acesso não autorizado, perda, alteração, divulgação ou destruição de dados pessoais (vazamento de documentos, banco acessado, conta de moderador invadida, chave exposta, e-mail enviado ao destinatário errado etc.).

**Prazo de referência:** comunicar a ANPD e os titulares afetados em até **3 dias úteis** do conhecimento do incidente, quando houver risco ou dano relevante (art. 48 da LGPD; Resolução CD/ANPD nº 15/2024).

## Papéis

| Papel | Quem | O que faz |
|---|---|---|
| Líder do incidente | [Responsável técnico] | Conduz contenção e correção |
| Encarregado(a) | [ENCARREGADO(A) PELO TRATAMENTO DE DADOS] | Avalia risco, comunica ANPD e titulares |
| Jurídico | Dra. Roberta | Revisa comunicados e obrigações |
| Decisor | Robson | Aprova comunicações e medidas de maior impacto |

## Passo 1 — Detectar e avisar (na hora)

1. Quem perceber algo estranho avisa **imediatamente** o líder e o(a) Encarregado(a): privacidade@vendeu.app.
2. Anotar: quando, como foi notado, o que foi visto. Não apagar nada.
3. Abrir o registro do incidente (modelo na seção "Registro").

## Passo 2 — Conter (primeiras horas)

1. Isolar a causa: desativar conta/credencial comprometida, trocar chaves e segredos (sem enviar segredos por chat), bloquear acesso, tirar a função do ar se preciso.
2. Preservar evidências (logs, horários, prints).
3. Acionar o suboperador afetado (Vercel, Supabase, Mercado Pago, provedor de e-mail/SMS), se for o caso.
4. Se documentos de verificação puderam ser acessados, verificar se a chave de cifra está segura; se a chave vazou, trocá-la e recifrar.

## Passo 3 — Avaliar (até 24 horas)

Responder:
- Quais dados? (documentos, selfie = sensível; registros de origem; mensagens; cadastro)
- Quantos titulares? Quais (anunciantes, compradores)?
- Os dados estavam cifrados? A chave foi exposta?
- Houve acesso, cópia, alteração ou perda?
- Qual o risco aos titulares (fraude de identidade, golpe, constrangimento, discriminação)?

| Nível | Critério | Ação |
|---|---|---|
| Baixo | Sem dado pessoal ou dado cifrado sem chave exposta | Registrar; sem comunicação externa |
| Médio | Dado pessoal comum, poucos titulares, risco limitado | Decidir com o(a) Encarregado(a) e o jurídico; registrar |
| Alto | Documento, selfie, muitos titulares, risco de fraude | **Comunicar ANPD e titulares** |

## Passo 4 — Comunicar (até 3 dias úteis)

1. **ANPD:** o(a) Encarregado(a), com o jurídico, preenche o formulário de comunicação de incidente no site da ANPD (gov.br/anpd). Conteúdo mínimo: natureza do incidente; dados e titulares afetados; medidas técnicas e de segurança; riscos; medidas adotadas; motivos de eventual atraso; contato do(a) Encarregado(a).
2. **Titulares:** e-mail e aviso no aplicativo, em linguagem simples (modelo abaixo).
3. **Outros:** se houver crime, boletim de ocorrência; avisar parceiros/suboperadores conforme o caso.
4. Se os dados informados ainda estiverem sendo apurados, fazer uma **comunicação preliminar** e complementar depois.

## Passo 5 — Corrigir e prevenir

1. Corrigir a causa (atualização, configuração, treinamento).
2. Reforçar o monitoramento.
3. Revisar o RIPD e o ROPA se algo mudou.
4. Reunião de lições aprendidas em até 15 dias.

## Passo 6 — Registrar

Manter o registro por **5 anos**.

| Campo | Preenchimento |
|---|---|
| Nº / data e hora da detecção | |
| Quem detectou / como | |
| Descrição | |
| Dados e titulares afetados (nº estimado) | |
| Dados cifrados? Chave exposta? | |
| Nível (baixo/médio/alto) | |
| Medidas de contenção (hora) | |
| Comunicou a ANPD? Data / protocolo | |
| Comunicou titulares? Data / canal | |
| Causa raiz | |
| Medidas preventivas | |
| Encerrado em / por | |

## Modelo de comunicado ao titular

**Assunto:** Aviso de segurança do Vendeu

Olá, [nome].

Informamos que, em [data], identificamos um incidente de segurança que pode ter afetado alguns dos seus dados pessoais no Vendeu.

**O que aconteceu:** [descrição simples].

**Quais dados foram envolvidos:** [ex.: nome, e-mail, telefone; documentos de verificação].

**O que já fizemos:** [ex.: bloqueamos o acesso, trocamos chaves de segurança, estamos investigando com apoio dos nossos fornecedores].

**O que recomendamos que você faça:** [ex.: desconfie de mensagens pedindo códigos ou Pix; troque sua senha; ative a verificação em duas etapas]. O Vendeu nunca pede sua senha, códigos ou Pix antecipado.

**Riscos possíveis:** [ex.: tentativas de golpe usando seus dados].

Comunicamos o fato à Autoridade Nacional de Proteção de Dados (ANPD).

Para dúvidas: privacidade@vendeu.app. Encarregado(a): [ENCARREGADO(A) PELO TRATAMENTO DE DADOS].

[RAZÃO SOCIAL DA OPERADORA] — CNPJ [CNPJ]

## Contatos de emergência

| O quê | Contato |
|---|---|
| Líder técnico | [preencher] |
| Encarregado(a) | privacidade@vendeu.app / [telefone] |
| Jurídico | [preencher] |
| ANPD | gov.br/anpd |
