# Decisões tomadas na implementação e pontos que dependem do Robson

## Regras de negócio aplicadas (do brief)
- **Atualizado em 24/09/2026 para seguir o site revah.com.br** (decisão do Robson):
  - Teste grátis de **14 dias em qualquer plano**, que começa ao cadastrar a forma de pagamento; até **20 contatos por campanha** no período.
    Cancelando no teste, sem cobrança; depois, mensalidade automática; cancelando, o ciclo pago segue até o fim.
  - Quem já usou o teste (mesmo e-mail, telefone ou documento) não ganha novos 14 dias.
  - Planos: **START R$ 247/mês** (5 mil mensagens, IA básica, 1 integração CRM, 5 templates), **PRO R$ 597/mês**
    (25 mil mensagens, IA avançada, integrações e templates ilimitados, listas CSV), ENTERPRISE sob consulta.
  - Pagamentos: **Asaas** no Brasil (Pix, boleto, cartão) e **Stripe** para vendas internacionais. Nenhum dado de cartão passa pelo REVAH.
  - O REVAH é vendido sozinho; a integração com o DentalPos One é opcional.
- Consentimento: pedido de saída entra na suppression list do canal e bloqueia envios/ligações automáticas.
- Textos sem promessas absolutas.

## Padrões adotados enquanto a decisão não chega (fáceis de mudar)

| Tema em aberto | O que foi feito | Como mudar |
|---|---|---|
| Hospedagem do backend | Pronto para Vercel (projeto separado) + Supabase **em projeto separado** do DentalPos. Também roda em qualquer Node (`npm start` + `npm run worker`). | `docs/DEPLOY.md` |
| Scraping de LinkedIn/Instagram/Facebook | **Não implementado.** Só vias oficiais: CNPJ público, Google Places API e Meta Lead Ads (anúncios da própria empresa). | Nova fonte = novo provedor em `api/src/services/leads/providers.ts`, após decisão explícita. |
| Horários do REVAH Voice | Seg–sex 09h–21h, sáb 10h–16h, sem domingos e feriados nacionais fixos, no fuso da empresa. Cada empresa pode restringir. Voz vem **desligada** por padrão. | Tela Voz ou `voice/windows.ts` (padrão). |
| Gravação de ligações | Desligada por padrão. Quando ligada: aviso no início, gravação só começa depois da primeira resposta sem recusa ("não autorizo" ou tecla 8). | Tela Voz. |
| Preço do REVAH Leads | Assinatura adicional no Asaas (`PRICE_LEADS_BRL`) ou item no Stripe (`STRIPE_PRICE_LEADS`); sem preço, ativação manual pelo backoffice. | Definir o valor. |
| Termo do REVAH Leads | Texto em `api/src/services/leads/terms.ts` (versão `LEADS_TERMS_VERSION`), aceite com nome, documento, IP e data. | Revisar com o jurídico e subir a versão. |
| Limites não anunciados no site | START 3 usuários/3 canais; PRO 10 usuários, canais livres e voz; teste: até 1.000 mensagens. | `PLAN_LIMITS_JSON` / `TRIAL_MAX_MESSAGES`. |
| Asaas e o "cadastre a forma de pagamento hoje" | No Asaas a assinatura é criada no início do teste e a primeira fatura (Pix, boleto ou cartão) vence no 14º dia; o cartão não fica pré-cadastrado. No Stripe o cartão é exigido no início. | — |
| Modelo de IA | `claude-opus-5`, esforço baixo para resposta rápida, com fallback de servidor em recusas. Sem `ANTHROPIC_API_KEY` o bot usa regras simples e transfere para humano. | `REVAH_AI_MODEL`. |
| Zapiô | A API do Zapiô não tem contrato público estável; o adaptador aceita URL, caminho e nomes de campo configuráveis. | Ajustar campos no canal ao contratar. |

## Avisos que continuam valendo
- Z-API e Zapiô são não oficiais: o painel exige aceite explícito do risco de banimento antes de conectar.
- Ligações automáticas (Não Me Perturbe, LGPD): validar com o jurídico antes de ativar para cobrança e prospecção fria.
