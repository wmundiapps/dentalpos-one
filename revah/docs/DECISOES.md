# Decisões tomadas na implementação e pontos que dependem do Robson

## Regras de negócio aplicadas (do brief)
- Teste grátis: 2 campanhas, até 20 contatos cada, sem cartão. Validação no servidor (`plans.ts`, `campaigns.ts`), com incremento atômico.
  Quem se cadastrar de novo com o mesmo e-mail, telefone ou documento entra com as 2 campanhas já consumidas.
- Planos: START R$ 197/mês, PRO R$ 497/mês, ENTERPRISE sob consulta (formulário para o comercial).
- Nenhum dado de cartão passa pelo REVAH: checkout e portal hospedados pelo Stripe.
- Consentimento: pedido de saída entra na suppression list do canal e bloqueia envios/ligações automáticas.
- Textos sem promessas absolutas.

## Padrões adotados enquanto a decisão não chega (fáceis de mudar)

| Tema em aberto | O que foi feito | Como mudar |
|---|---|---|
| Hospedagem do backend | Pronto para Vercel (projeto separado) + Supabase **em projeto separado** do DentalPos. Também roda em qualquer Node (`npm start` + `npm run worker`). | `docs/DEPLOY.md` |
| Scraping de LinkedIn/Instagram/Facebook | **Não implementado.** Só vias oficiais: CNPJ público, Google Places API e Meta Lead Ads (anúncios da própria empresa). | Nova fonte = novo provedor em `api/src/services/leads/providers.ts`, após decisão explícita. |
| Horários do REVAH Voice | Seg–sex 09h–21h, sáb 10h–16h, sem domingos e feriados nacionais fixos, no fuso da empresa. Cada empresa pode restringir. Voz vem **desligada** por padrão. | Tela Voz ou `voice/windows.ts` (padrão). |
| Gravação de ligações | Desligada por padrão. Quando ligada: aviso no início, gravação só começa depois da primeira resposta sem recusa ("não autorizo" ou tecla 8). | Tela Voz. |
| Preço do REVAH Leads | Cobrado como item adicional na assinatura (`STRIPE_PRICE_LEADS`); sem preço configurado, ativação manual pelo backoffice. | Criar o price no Stripe e preencher a variável. |
| Termo do REVAH Leads | Texto em `api/src/services/leads/terms.ts` (versão `LEADS_TERMS_VERSION`), aceite com nome, documento, IP e data. | Revisar com o jurídico e subir a versão. |
| Limites por plano | START 3 usuários/3 canais/10 mil msg; PRO 10 usuários/canais livres/50 mil msg + voz; ENTERPRISE sem limites técnicos. | `PLAN_LIMITS_JSON` sem novo deploy de código. |
| Modelo de IA | `claude-opus-5`, esforço baixo para resposta rápida, com fallback de servidor em recusas. Sem `ANTHROPIC_API_KEY` o bot usa regras simples e transfere para humano. | `REVAH_AI_MODEL`. |
| Zapiô | A API do Zapiô não tem contrato público estável; o adaptador aceita URL, caminho e nomes de campo configuráveis. | Ajustar campos no canal ao contratar. |

## Avisos que continuam valendo
- Z-API e Zapiô são não oficiais: o painel exige aceite explícito do risco de banimento antes de conectar.
- Ligações automáticas (Não Me Perturbe, LGPD): validar com o jurídico antes de ativar para cobrança e prospecção fria.
