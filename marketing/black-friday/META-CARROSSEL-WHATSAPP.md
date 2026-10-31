# Meta: carrossel com destino WhatsApp (lead primeiro) e atendimento automático

Fluxo: **anúncio em carrossel → página `/falar` (pega nome e WhatsApp) → abre o WhatsApp → o assistente virtual responde na hora e leva para `/cadastro`** (30 dias grátis, cobrança só depois, sem fidelidade).

Por que não o botão direto "Enviar mensagem" da Meta: ele abre o WhatsApp sem passar por formulário, e aí o lead não fica salvo. Com a página `/falar`, o lead entra no sistema antes da conversa.

## Cards do carrossel (1080×1350)
Pasta `marketing/black-friday/carrossel/`: `01.png` a `06.png`. Para regerar: `cd marketing/black-friday && node gerar-carrossel.mjs`.

| Card | Título do card (máx. 40) | Descrição (máx. 20) |
|---|---|---|
| 01 | 30 dias grátis e 50% off | Black Friday |
| 02 | Centenas de processos automáticos | Sem funcionário |
| 03 | Use o WhatsApp do consultório | É só configurar |
| 04 | Documentos inclusos | Sem custo por documento |
| 05 | Migração automática | Simples e rápida |
| 06 | Cobrança só após 30 dias | Sem fidelidade |

## Link de destino (o mesmo em todos os cards)
```
https://app.dentalpos.com.br/falar?produto=dentalpos&utm_source=meta&utm_medium=cpc&utm_campaign=bf2026&utm_content=carrossel
```

## Texto principal do anúncio
```
BLACK FRIDAY DENTALPOS 🖤

Teste grátis por 30 dias e ganhe 50% de desconto nos 12 meses seguintes (cadastros até 31/12).

✔ Centenas de processos automáticos, sem depender de funcionário
✔ WhatsApp do seu próprio consultório
✔ Papelaria e documentos inclusos
✔ Migração automática do seu sistema atual

Cobrança só depois dos 30 dias. Sem fidelidade: cancele quando quiser.

Toque e fale com a gente no WhatsApp 👇
```
Botão: **Saiba mais**.

## Passo a passo na Meta
1. `business.facebook.com` → **Gerenciador de Anúncios** → **Criar**.
2. Objetivo: **Tráfego**. Local de conversão: **Site**. Otimizar por **Visualizações da página de destino**.
3. Público: Brasil, 25–60 anos, interesses Odontologia, Cirurgião-dentista, Clínica odontológica. Orçamento R$ 40/dia, de 16/11 a 31/12.
4. Anúncio: formato **Carrossel**, 6 cards (`01.png` a `06.png`), título e descrição da tabela, o link acima em todos, texto principal acima.
5. Publicar. Acompanhe os leads em `Configurações` do sistema > (lista de leads no banco, tabela `MarketingLead`).

## Atendimento automático por IA (sem atendente)
O assistente responde 24 h por dia, em português, com os fatos do DentalPos (planos, 30 dias, 50% até 31/12, sem fidelidade, automação, WhatsApp, documentos, migração) e sempre convida para `/cadastro`. Se não souber, diz que não sabe e indica `contato@dentalpos.com.br`. Não pede cartão nem senha no chat. Quem escrever SAIR para de receber.

### O que você configura (digita direto na tela, nada passa por aqui)
1. **Rodar o SQL** `backend/prisma/manual-migrations/20261111_atendimento_automatico_vendas.sql` no Supabase (projeto DentalPos One).
2. **Número do WhatsApp na WhatsApp Business Platform (API oficial)** em `developers.facebook.com`. O número do atendimento precisa estar cadastrado nela; ele não funciona ao mesmo tempo no aplicativo comum.
3. **Webhook** no app da Meta (WhatsApp > Configuração): URL `https://api.dentalpos.com.br/api/webhooks/whatsapp-sales`, token de verificação à sua escolha (o mesmo valor em `META_VERIFY_TOKEN`), campo assinado `messages`.
4. **Variáveis na Vercel**, projeto `dentalpos-one-w2pa` (Production): `ANTHROPIC_API_KEY`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `SALES_WHATSAPP_NUMBER` (só números, com 55). Opcional: `SALES_BOT_MODEL` (padrão `claude-opus-5-5`; `claude-haiku-5-5` custa menos).
5. **Redeploy** do projeto depois de salvar as variáveis.

Sem `ANTHROPIC_API_KEY` o atendimento responde só uma mensagem fixa com o link do teste.

### Regras da Meta que o robô já respeita
- Só responde dentro de 24 h depois que a pessoa escreve (mensagem iniciada por você exige modelo aprovado).
- Se apresenta como assistente virtual (IA) e é específico do DentalPos (assistente de vendas do próprio negócio, não um assistente geral).
- Respeita pedido de SAIR e limita 60 mensagens por pessoa por dia.

## Antes de ligar a campanha (checklist)
Não deixe o anúncio começar antes de tudo isto estar verde, senão o lead abre o WhatsApp e ninguém responde:
- [ ] Número +55 44 9946-6451 **Conectado** na Meta (hoje Offline).
- [ ] App DentalposWPP **publicado** (precisa da política de privacidade publicada em `/privacidade`).
- [ ] Webhook cadastrado e verificado na Meta.
- [ ] Variáveis de segredo na Vercel: `ANTHROPIC_API_KEY`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN` (`SALES_WHATSAPP_NUMBER` e `META_PHONE_NUMBER_ID` já estão criadas).
- [ ] Deploy refeito depois das variáveis.
- [ ] Teste: escrever para o número e receber a resposta do robô; conferir o lead em `MarketingLead`.
