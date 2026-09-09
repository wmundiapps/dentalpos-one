# Stripe — decisão de arquitetura para o DentalPos One / REVAH

## Decisão imediata: opção B

Manter, nesta etapa, o fluxo real já implementado com PaymentIntent direto.

No endpoint Stripe atual, habilitar somente:
- payment_intent.succeeded
- payment_intent.payment_failed

Os eventos de Checkout/Subscription devem ficar fora do endpoint atual até existir uma entidade de assinatura e o respectivo fluxo de negócio.

## Correções técnicas incorporadas nos arquivos revisados

1. Eventos sem handler ficam IGNORED, não PROCESSED.
2. PaymentIntent só fica PROCESSED quando Payment ou FinancialEntry foi realmente encontrado/atualizado.
3. FinancialEntry também conta como processamento válido.
4. Retry do Stripe não é bloqueado permanentemente pelo P2002 quando tentativa anterior ficou RECEIVED/FAILED.
5. Em falha transitória de processamento, o endpoint responde 5xx para permitir retry do Stripe.
6. Metadata passa a incluir clinicId, tenantId, product=DENTALPOS, paymentId e financialEntryId quando disponíveis.
7. O webhook usa IDs internos como fallback para eliminar a corrida entre criação do PaymentIntent e gravação local do externalId.
8. Nenhuma migration ou model novo nesta etapa.

## Fase posterior

Quando a assinatura SaaS recorrente for implementada, não usar o model Payment clínico para isso. Criar um domínio separado e product-aware (por exemplo ProductSubscription/TenantSubscription), capaz de distinguir DENTALPOS e REVAH dentro da mesma conta Stripe.
