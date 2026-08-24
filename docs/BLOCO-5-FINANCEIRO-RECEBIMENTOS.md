# Bloco 5 — Orçamentos, Financeiro e Recebimentos

Checkpoint funcional do núcleo financeiro da Alpha.

## Fluxos integrados

- Odontograma/prontuário -> plano clínico -> Orçamento e Tratamentos.
- Orçamento aprovado -> geração automática das contas a receber.
- Entrada + parcelas são geradas separadamente, preservando origem do orçamento.
- Baixa financeira atualiza a situação usada pelos alertas operacionais e pela Agenda.
- Dashboard passa a reagir a alterações financeiras.
- Financeiro concentra contas a pagar, contas a receber, vencimentos, competência, origem, método e provedor.

## Provedores preparados

- Asaas: PIX, cartão e boleto.
- Stripe: cartão e pagamentos internacionais.
- Banco / Open Finance: PIX, transferências e conciliação conforme instituição/adaptador.
- Manual: fallback operacional.

As credenciais não são armazenadas no frontend. O backend possui configuração por clínica e ambiente TEST/PRODUCTION, além de estado de credencial e webhook. A conexão real depende das chaves e homologações do provedor.

## Backend

Foram adicionados:

- FinancialEntry
- PaymentProviderConfig
- extensão de Budget para desconto, entrada, correção, forma e provedor
- extensão de Payment para provedor, ID externo, taxas, valor líquido e status transacional
- aprovação de orçamento com criação transacional de Payment + FinancialEntry
- baixa de pagamento sincronizando a conta a receber correspondente
- endpoints de lançamentos financeiros
- endpoints de configuração de provedores
- endpoint de intenção de pagamento preparado para adapters externos
- auditoria e escopo clinicId/tenantId

## Frontend Alpha

Enquanto o backend não estiver implantado no piloto, o frontend mantém persistência local integrada para testar o fluxo completo sem movimentar dinheiro real. A aprovação de orçamento já cria os recebíveis locais e a Agenda/Dashboard passam a ler a mesma fonte financeira.

## Segurança

- Nenhuma chave Asaas, Stripe ou bancária é colocada no frontend.
- Produção exige HTTPS, webhooks validados, segredo por ambiente e idempotência no adapter real.
- Nesta Alpha, o simulador de cobrança não movimenta valores reais.
