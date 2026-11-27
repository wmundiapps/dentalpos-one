# Financeiro / Contábil / Fiscal — Guia de Integração

Estende o financeiro que já existe no DentalPos One (gateway Asaas/Stripe) em
vez de recriá-lo — este módulo cuida de contas a pagar/receber, lançamento
contábil e nota fiscal; o gateway de pagamento continua sendo o que já está
implementado.

## 1. Onde colocar os arquivos

```
backend/
  prisma/
    schema.prisma          <- cole schema-financeiro.prisma no final,
                               depois de já ter colado schema-academico.prisma
  src/
    modules/
      academico/            <- já existe (módulo anterior)
      financeiro/
        validators.ts
        accounting.helpers.ts
        costCenterChart.ts
        payable.ts
        receivable.ts
        invoice.ts
        reports.ts
        routes.ts
```

## 2. Ajustes obrigatórios

Iguais ao módulo acadêmico:
1. Caminho do `prisma` client em cada arquivo (`../../lib/prisma`).
2. Este módulo **reaproveita** `middleware.ts` do Núcleo Acadêmico (import
   `from '../academico/middleware'`) — não duplica auth/RBAC. Se você
   preferir um middleware financeiro totalmente separado, copie o arquivo
   `middleware.ts` do módulo acadêmico para dentro de `financeiro/` e ajuste
   os imports nos 5 arquivos deste módulo.

## 3. Migração e rotas

```powershell
npx prisma migrate dev --name financeiro_contabil_fiscal
npx prisma generate
```

Em `src/app.ts`:
```ts
import financeiroRouter from './modules/financeiro/routes';
app.use('/api/financeiro', financeiroRouter);
```

## 4. Conectar ao gateway Asaas/Stripe já existente

Você **não** precisa reimplementar a cobrança. O único ponto de contato é o
webhook: quando o Asaas/Stripe confirmar um pagamento, chame internamente

```
POST /api/financeiro/receivables/webhook-gateway-confirmacao
{ "gatewayId": "...", "formaPagamento": "PIX", "gatewayStatus": "CONFIRMED" }
```

a partir do handler de webhook que já existe no seu backend — é uma linha a
mais dentro dele, não uma reescrita.

## 5. Fluxo completo de exemplo

```bash
# Financeiro gera as 12 mensalidades do aluno a partir da matrícula
POST /api/financeiro/receivables/generate-mensalidades
{
  "studentId": "...",
  "enrollmentId": "...",
  "valorParcela": 890.00,
  "quantidadeParcelas": 12,
  "diaVencimento": 10,
  "primeiroVencimento": "2026-08-10",
  "descricaoBase": "Mensalidade Farmácia 2026/2"
}

# Aluno consulta as próprias mensalidades
GET /api/financeiro/receivables/my

# Financeiro dá baixa manual (ex: pagamento em dinheiro na secretaria)
POST /api/financeiro/receivables/{id}/receive
{ "formaPagamento": "DINHEIRO" }
# -> gera PaymentTransaction + lançamento contábil (débito Caixa / crédito Receita)
#    automaticamente, sem precisar cadastrar plano de contas antes

# Financeiro cadastra e paga uma conta a pagar (ex: aluguel do polo)
POST /api/financeiro/payables
{ "descricao": "Aluguel Polo Arapongas — Setembro", "fornecedor": "Imobiliária X", "valor": 4500, "dataVencimento": "2026-09-05" }

POST /api/financeiro/payables/{id}/pay
{ "formaPagamento": "TRANSFERENCIA" }

# Diretoria consulta o DRE do mês
GET /api/financeiro/reports/dre?de=2026-09-01&ate=2026-09-30

# Diretoria consulta fluxo de caixa (realizado x previsto)
GET /api/financeiro/reports/fluxo-de-caixa?de=2026-09-01&ate=2026-09-30

# Financeiro emite nota fiscal de uma mensalidade recebida
POST /api/financeiro/invoices
{ "accountReceivableId": "...", "tipo": "NFSE", "valor": 890.00 }
```

## 6. O que fica pronto para o contador plugar

`invoice.ts` já cria o registro e o status da nota fiscal — só falta ligar
ao emissor real (NFE.io, Focus NFe, PlugNotas — o que seu contador já usa).
O ponto exato de integração está comentado dentro do arquivo, é uma função
só.

## 7. Próximo módulo na fila

Conteúdo + Biblioteca (PDF/vídeo/resumo/flashcard) ou Provas com correção
por IA — me diga qual seguir.
