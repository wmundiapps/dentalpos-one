# Site Wmundi — decisões, auditoria e plano de lançamento

Arquivo do site: `docs/wmundi/site/index.html` (HTML único, sem framework). Prévia para publicar como página: `docs/wmundi/demos/site-previa.html`.
Este documento aplica ao site os 7 prompts do carrossel do Instagram que o Robson enviou (planta, primeira dobra, movimento, texto, plano de construção, auditoria de conversão, plano de lançamento), cruzados com o que ele pediu. **Regra seguida: analisar antes de mudar; o que ele pediu manda, os prompts entram quando ajudam.**

## 1. O que o Robson pediu (manda)
Site que **venda** e **encha os olhos**; sete áreas (apps, marketing digital, educação, saúde, serviços, automação e IA); marca grande, empolgante, com IA; **amostras grátis para testar no próprio site** (resposta de WhatsApp, criação de reels, agendamento automático).

## 2. Decisão por prompt
| # | Prompt do carrossel | Decisão | Por quê |
|---|---|---|---|
| 1 | Planta do site de luxo | **Adaptado** | Luxo não combina com "empolgante como RD Station" nem com PME. Identidade: marinho + cobalto + coral + menta, tipografia grande e viva. Estrutura e ordem de construção entram como pedido |
| 2 | Primeira dobra (promessa, prova, ação em 10 s) | **Aplicado** | Título com a promessa, celular com conversa real de robô na primeira tela, botão "Testar um robô agora" |
| 3 | Como o site se mexe | **Aplicado com freio** | Movimento só onde ajuda: entrada das mensagens no topo, elevação dos cartões, "digitando" nas amostras. Nada trava o celular; `prefers-reduced-motion` desliga tudo |
| 4 | O texto (copy de conversão) | **Adaptado** | Texto escrito para a dor real (tempo, cliente sem resposta). **Sem depoimentos nem números inventados**: o prompt pede "provas reais que eu tenho", e ainda não há. Prova usada: produtos no ar (DentalPos, REVAH, SpaceHour) e as próprias amostras |
| 5 | Plano de construção | **Aplicado** | Seção 4 abaixo |
| 6 | Auditoria de conversão | **Aplicado** | Seção 5 abaixo |
| 7 | Plano de lançamento 30 dias | **Aplicado** | Seção 6 abaixo |

## 3. Amostras grátis (o que o Robson mais quis)
Rodam 100% no navegador, sem cadastro, sem enviar nada. **São simulações com regras e modelos prontos, e o site diz isso** (selo "Simulação" e pergunta no FAQ). Não usam IA generativa real: isso exigiria um servidor com chave secreta, limite de uso e custo, e **não é seguro nem permitido colocar chave no código do site**.
1. **Responder no WhatsApp:** escolhe tipo de negócio (clínica, loja, academia, salão), nome, horário e endereço; conversa com chips e texto livre. Intenções: saudação, preço, horário, endereço, agendar, remarcar, troca, pedir humano, urgência (só odonto). Quando não sabe, **não inventa** e encaminha para uma pessoa; em urgência não dá diagnóstico. Cada resposta mostra a "ação do robô".
2. **Roteiro de reels:** negócio + assunto + tom + duração gera gancho, cenas com tempo, final, legenda e hashtags, com botão copiar e "outra versão". Para negócios de saúde mostra aviso de que a publicidade tem regras do conselho profissional.
3. **Agendamento automático:** escolhe dia e horário livre (alguns riscados); gera a mensagem de confirmação e a linha do tempo do robô (lembretes, remarcação, lista de espera, recepção).

**Evolução recomendada (versão com IA de verdade):** um endpoint no backend (com limite por visitante, filtro de abuso e custo controlado) chamando o modelo; a chave fica só no servidor. Isso mexe em segredo e custo, então **vira PR para o Robson decidir**.

## 4. Plano de construção (prompt 5)
- **Tecnologia:** um arquivo HTML com CSS e JS embutidos. Motivo: o site pode estar em GoDaddy, WordPress ou Wix, e um arquivo único cola em qualquer um.
- **Componentes:** cabeçalho fixo, hero com celular, cartão de área (×7), abas de amostra (×3), passos, cartão de produto (×3), bloco de confiança, FAQ (`details`), formulário de contato, rodapé.
- **Breakpoints:** 900 px (hero em coluna), 860 px (amostras em coluna), 820 px e 560 px (menu enxuto). Nenhuma rolagem lateral (testado em 1280 e 390 px).
- **Imagens e fontes:** sem imagens pesadas (tudo em CSS); duas famílias do Google Fonts com fallback de sistema.
- **Acessibilidade:** pular para o conteúdo, abas com teclado (setas), foco visível, rótulos nos campos, `aria-live` nas respostas, contraste alto.
- **Checklist antes de publicar:**
  - [ ] Conferir o e-mail em `CONFIG.email` (hoje `info@wmundi.com`, vindo do repositório; confirmar que existe).
  - [ ] Conferir preços do DentalPos e a frase "30 dias grátis para profissionais" (estão em `CLAUDE.md`; confirmar que podem ir ao público).
  - [ ] Conferir "Registrada no Brasil e na Europa" (informado pelo Robson; confirmar texto).
  - [ ] Testar no celular real e no navegador do GoDaddy/WordPress/Wix.
  - [ ] Adicionar política de privacidade e termos (texto legal só com aprovação do Robson e revisão da Dra. Roberta).
  - [ ] Ligar Google Analytics ou equivalente (ver plano de lançamento).

## 5. Auditoria de conversão (prompt 6) sobre o próprio rascunho
| Etapa | Atrito encontrado | O que foi feito |
|---|---|---|
| Entrada | Visitante não sabe o que é "Wmundi" | Promessa clara no título e celular com exemplo na primeira tela |
| Interesse | Medo de "robô errar" | Amostra mostra o robô **recusando inventar** e passando para pessoa; bloco "Robô trabalha, você decide" |
| Prova | Ainda não há depoimentos | Prova por demonstração e por produtos no ar; **sem prova falsa**. Coletar depoimentos reais é tarefa do mês 1 |
| Decisão | Preço desconhecido | Preços do DentalPos visíveis; para robôs "proposta sob medida" no FAQ |
| Ação | Formulário assusta | Só nome, e-mail, interesse e uma frase; resposta por e-mail |
| Pós-clique | Formulário não tem servidor | Hoje monta a mensagem e abre o e-mail do visitante ou copia o texto. **Ligar a um formulário real da plataforma (WordPress/Wix/GoDaddy) é prioridade 1 antes de anunciar** |

**Três mudanças de maior impacto esperado:** (1) amostra na primeira tela; (2) formulário que realmente entrega o contato; (3) depoimentos reais assim que existirem.
**Métrica que prova que funcionou:** taxa de visitantes que **usam uma amostra** e, dentre eles, os que **enviam o formulário**.

## 6. Plano de lançamento — primeiros 30 dias (prompt 7)
- **Semana 0 (antes de ir ao ar):** checklist da seção 4; formulário real; medição ligada (visitas por origem, uso de cada amostra, cliques nos botões, envios do formulário).
- **Semana 1:** divulgar para a base conhecida (clientes do DentalPos, contatos do Robson). Só tráfego que ele controla (e-mail, WhatsApp, redes). Coletar feedback barato: uma pergunta ao fim das amostras ("isso resolve algo do seu dia?") e conversas curtas.
- **Semana 2:** olhar páginas que pedem atenção (onde as pessoas saem), ajustar texto do hero e do formulário. Primeiro experimento.
- **Semana 3:** segundo experimento; conteúdo semanal feito por robôs com revisão humana (reels gerados com a própria amostra).
- **Semana 4:** revisão do mês, decidir se anuncia pago.
- **Revisão semanal fixa:** segunda-feira, 30 minutos, sempre com os mesmos 5 números.
- **Métricas principais mesmo com pouco tráfego:** uso de amostra por visitante; envios do formulário; cliques em "Falar com a Wmundi"; tempo até a primeira ação; origem do contato.
- **Três experimentos prioritários:** (1) título do hero (3 versões: "24 horas por dia", "menos tarefas repetidas, mais clientes", "robôs que trabalham por você"); (2) botão principal ("Testar um robô agora" × "Ver um robô trabalhando"); (3) amostra aberta por padrão (WhatsApp × reels).
- **Critério para parar de mexer:** quando duas revisões seguidas não melhorarem a métrica principal, ou com menos de 100 visitantes por variação não há conclusão: **espere dados antes de mudar de novo**.

## 7. Itens do Robson que continuam em pausa (não incluídos no site)
- Nome do Robson em destaque (aguarda como quer aparecer).
- "Desenvolvedores Apple e Google Play", selos e logos das lojas (aguarda contas de desenvolvedor e primeiro app). O site diz apenas "apps para iPhone e Android" na área de apps, como descrição do serviço.
- Depoimentos, números de clientes e selos de certificação: **não há prova real ainda e nada foi inventado**.
