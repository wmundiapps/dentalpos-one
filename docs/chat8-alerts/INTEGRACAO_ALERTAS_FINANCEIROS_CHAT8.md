# INTEGRAÇÃO DE RESOLUÇÃO DE ALERTAS FINANCEIROS PARA O CHAT 8

## Princípio
A operação financeira real resolve o alerta. O endpoint de resolução não altera dívida, saldo, valor ou vencimento.

## Estados para a Central
- ACTIVE = ativo
- IN_PROGRESS = em tratamento
- RESOLVED = resolvido
- DISMISSED = dispensado

## Cobertura
- FinancialEntry INCOME: recebimento/parcela vencida.
- FinancialEntry EXPENSE: conta a pagar vencida.
- Payment: parcela ligada a orçamento.
- Budget: orçamento/financeiro do paciente, inclusive renegociação/versionamento.

## Fluxos obrigatórios
### Pagamento / baixa
1. Executar a baixa financeira real.
2. FinancialEntry deve ficar PAID com paidAt, ou Payment PAID com paidDate.
3. Só então chamar resolveFinancialAlertFromOperation com PAYMENT/SETTLEMENT.
4. O serviço valida a operação e grava RESOLVED.

### Renegociação
1. Criar a nova condição financeira sem sobrescrever a anterior.
2. Marcar a anterior com estado central de substituição (recomendado: RENEGOTIATED/SUPERSEDED conforme a entidade).
3. Chamar resolução com RENEGOTIATION e replacementEntityType/replacementEntityId.
4. O alerta antigo fica RESOLVED; a nova condição passa a ser monitorada normalmente.

### Cancelamento
- Deve exigir motivo.
- Primeiro executar cancelamento financeiro real (status CANCELLED).
- Depois resolver com CANCELLATION + reason.
- Nunca excluir o histórico.

### Ajuste / estorno
- Executar ajuste/estorno contábil real antes.
- ADJUSTMENT/REVERSAL exigem motivo.
- O resolvedor apenas valida e encerra o alerta.

### Improcedente / demonstrativo
- Usar DISMISSAL.
- Justificativa obrigatória.
- Não altera dívida, apenas registra que aquele alerta não é aplicável.

## Auditoria
Usa writeAudit existente e registra: responsável/actorId, data/hora, ação, motivo, entidade origem, valor, paciente/fornecedor, referência de substituição, before/after, IP/user-agent quando disponíveis.

## Integração no financialController.ts
O controlador atual já tem settle e cancelamento lógico. Chat 8 deve:
- após settle PAID, chamar resolveFinancialAlertFromOperation(... SETTLEMENT);
- no cancelamento, exigir req.body.reason antes de marcar CANCELLED;
- registrar motivo na auditoria;
- depois chamar CANCELLATION + reason.
O endpoint chamado remove pode manter nome por compatibilidade, mas sua semântica deve ser cancelar, nunca excluir.

## Integração no paymentController.ts
Ao confirmar Payment PAID, chamar PAYMENT. Em estorno/refund real, chamar REVERSAL + reason.

## Integração no budgetController.ts
Na renegociação, criar nova versão/orçamento e preservar anterior. Resolver o anterior com RENEGOTIATION + referência da nova entidade.

## Central de Alertas
Não criar botão genérico “Excluir alerta”. Para cada alerta financeiro:
1. identificar sourceEntityType + sourceEntityId;
2. consultar FinancialAlertResolution;
3. ausência de registro = ACTIVE;
4. mostrar ACTIVE/IN_PROGRESS/RESOLVED/DISMISSED;
5. ações devem levar à operação financeira real;
6. DISMISSAL apenas para improcedente/demonstrativo com justificativa.

## Multi-tenant e permissões
Todas as leituras/escritas usam clinicId + tenantId + usuário autenticado. Rotas preparadas usam requirePermission('finance','view'|'edit'); Chat 8 deve apenas alinhar nomes ao catálogo central, sem criar novo sistema.

## Arquivos centrais não alterados
Dashboard, Central de Alertas, schema.prisma, routes/index.ts, permissions, financialController.ts, paymentController.ts e budgetController.ts não foram alterados neste pacote para evitar conflito.

## Patch de schema
Adicionar FinancialAlertResolution conforme docs/SCHEMA_PATCH_CHAT8.prisma e consolidar as relações inversas. O SQL incluído é somente referência segura; não foi executado.

## Casos mínimos de homologação
1. recebimento vencido + baixa => RESOLVED;
2. conta vencida + baixa => RESOLVED;
3. marcar em tratamento => IN_PROGRESS;
4. renegociação => anterior RESOLVED + replacementEntityId;
5. cancelamento sem motivo => rejeitado;
6. cancelamento real com motivo => RESOLVED;
7. ajuste/estorno sem motivo => rejeitado;
8. resolver sem operação real => rejeitado;
9. demonstrativo com justificativa => DISMISSED;
10. isolamento por clinicId + tenantId.
