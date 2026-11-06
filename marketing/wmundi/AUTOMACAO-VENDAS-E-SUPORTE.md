# Automação de vendas, checkout e suporte com 1 pessoa

> Interpretação: "check-in e check-out direto no site" = **check-in = cadastro e boas-vindas do cliente (onboarding)** e **check-out = pagamento**. Se você quis dizer outra coisa (por exemplo reserva de espaços do SpaceHour), me avise.

## 1. Dois caminhos de venda
**A. Compra direta (produto com preço fixo)**: vitrine → "Contratar agora" → pagamento → boas-vindas → liberação. Nenhuma pessoa participa.
**B. Proposta (sites, apps, agentes sob medida, redes sociais)**: formulário → resposta automática → conversa curta → proposta com link de pagamento → pagamento → onboarding. A pessoa só entra na conversa e na proposta.

## 2. Fluxo A em detalhe (o que já existe e o que falta)
| Etapa | Como funciona | Status |
|---|---|---|
| Vitrine | `/produtos/` lê `assets/precos.json`; com preço e link vira "Contratar agora" | **Pronto** (vazio até haver preços) |
| Pagamento | Link de pagamento do Asaas (Pix, boleto, cartão; assinatura para mensalidades), com retorno para `/obrigado/` | Falta: preços e criação dos links |
| Confirmação | Webhook do Asaas já existe no DentalPos (`/webhooks/platform-asaas`, que hoje libera créditos) | Estender para liberar o produto comprado |
| Boas-vindas | E-mail (Brevo) e WhatsApp (Zenvia/Twilio) com o passo a passo | Falta: modelos de mensagem |
| Liberação | Licença/acesso do produto (no REVAH já há liberação por licença; replicar por produto) | Falta, por produto |
| Cobrança recorrente | Assinatura no Asaas; atraso tratado pelo **agente de cobrança de atraso** | Agente em construção (Sprint 2) |
| Avaliação | **Agente de pós-atendimento** pede a avaliação no Google | Agente em construção (Sprint 2) |
**Como alimentar `precos.json`:** para cada produto, `"Nome do produto": {"preco": "R$ 197,00 / mês", "link": "https://...", "rotulo": "Contratar agora"}`. Se faltar o link, o cartão continua pedindo proposta. **Cobrança e links de pagamento são decisão do Robson; chaves e senhas nunca no chat** (o formulário seguro da sessão pede a chave do Asaas se for automatizar a criação dos links).

## 3. Fluxo B em detalhe
1. Formulário (`/proposta/`, ícone do agente, produtos) → aviso por e-mail com a origem do anúncio.
2. **Agente atendente** responde dúvidas e agenda a conversa (fase 1 de agentes).
3. Proposta: modelo por oferta (escopo, prazo, investimento) com link de pagamento do sinal.
4. Pagamento confirma → onboarding automático (formulário de briefing, calendário do projeto).
5. Entrega e relatório mensal automáticos (resumo diário do dono para a WMundi usar com os próprios clientes).
Contrato: texto só com aprovação do Robson e revisão da Dra. Roberta; assinatura eletrônica a definir.

## 4. Ferramentas (o que a WMundi já tem)
Netlify (site e formulários), Asaas (pagamentos), Brevo (e-mail), Zenvia e Twilio (mensagens e voz), REVAH (CRM e conversas), Supabase (banco), WordPress (loja e páginas legais), agentes de IA (`agentes/`). **Nenhuma ferramenta nova é necessária para começar.**

## 5. Suporte com 1 pessoa (plano de rotina)
**Princípio:** o agente resolve o repetitivo, a pessoa resolve o importante, e nada fica sem resposta.
| Nível | Quem | O que resolve |
|---|---|---|
| 1 | Agentes de IA e respostas automáticas | Horário, endereço, como contratar, segunda via, status do pedido |
| 2 | Pessoa de suporte | Dúvidas técnicas, propostas, negociação (com aprovação), reclamações |
| 3 | Robson | Decisões comerciais, preços, exceções, jurídico |
**Rotina diária (45 minutos fixos):** 8h resumo diário do dono (agente) → aprovar a fila (negociações, mensagens sensíveis) → responder o que o agente passou → 17h fechar a fila do dia.
**Acordo de resposta sugerido:** confirmação automática imediata; resposta humana em até 1 dia útil. Avisar o horário no site e na resposta automática.
**Respostas prontas (macros):** (1) recebemos o seu pedido; (2) como funciona a proposta; (3) segunda via; (4) status do projeto; (5) pedido de avaliação; (6) fora do horário; (7) cancelamento.
**Se a pessoa de suporte faltar:** resposta automática de ausência, agentes seguem em modo "sugerir" e a fila fica para o dia seguinte; Robson cobre urgências.
**Indicadores do suporte:** tempo até a primeira resposta, pedidos sem retorno (meta: zero), motivo dos contatos (para virar novo agente ou nova resposta pronta).

## 6. Riscos e proteções
- **Fila crescendo:** limite de mensagens por dia nos agentes e priorização por tipo.
- **Pagamento sem entrega:** nenhum link ativo sem processo de liberação testado.
- **Reembolso e cancelamento:** política publicada e revisada juridicamente antes de vender direto (a loja WordPress já tem página de reembolso; reaproveitar o texto aprovado).
- **Dependência de uma pessoa:** documentar tudo em macros e manter Robson como reserva.
