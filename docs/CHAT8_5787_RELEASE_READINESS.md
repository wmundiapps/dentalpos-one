# DentalPos One — Piloto 5787 — Release final do Chat 8

Data de consolidação: 2026-09-08
Branch de integração: `chat8-5787-integracao`
Base preservada: `main`

## O que este release fecha

### Núcleo e integrações dos soldadinhos
- integrações clínicas dos Chats 1–7 montadas no roteador central;
- prontuário/anamnese versionado;
- odontograma/periodontograma;
- plano de tratamento/orçamento versionado;
- evolução/documentos clínicos;
- arquivos/exames;
- cirurgia, implantes e prótese;
- ortodontia/OFM/DTM;
- foto única do paciente;
- agenda/alertas e resolução auditável;
- menu compacto/deduplicado;
- relatórios 5787;
- RH e ponto visível;
- REVAH como núcleo de CRM, marketing e comunicação;
- DentalPos Sales e Estoque sem banco paralelo.

### Correções finais desta consolidação
- `SalesProduct` passa a ser a fonte persistente do estoque; removido o SQL contra tabela inexistente `StockItem`;
- estoque deixa de usar `localStorage` como fonte definitiva;
- alertas críticos de estoque passam a chegar ao Dashboard pelo backend;
- CRM do REVAH passa a usar os mesmos `SalesLead` persistidos consumidos pelo DentalPos Sales;
- novo lead deixa de ser botão fictício;
- configuração da loja usa `TenantFeatureFlag` existente;
- fornecedores afiliados usam `Supplier` existente, comissão inicial de 10% configurável;
- removidos quatro modelos experimentais do Chat 8 que ainda não tinham migration e duplicariam domínio existente;
- Stripe PaymentIntent recebe metadata de `clinicId`, `tenantId`, `product=DENTALPOS`, `paymentId` e `financialEntryId`;
- webhook Stripe passa a distinguir `PROCESSED`, `IGNORED` e `FAILED`, preservando retry em falhas transitórias;
- webhook Stripe usa IDs internos como fallback contra corrida de persistência e não rebaixa um pagamento já `PAID` por evento de falha atrasado;
- recuperação de senha deixa de ser botão fictício: token de uso único, 30 min, hash no banco, revogação de sessões e envio transacional via remetente EMAIL padrão do REVAH;
- tela de Homologação inspeciona o schema 5787 em modo somente leitura, sem precisar revelar `DATABASE_URL`.

## Banco de dados — regra obrigatória

A `main` histórica não possui uma cadeia de migrations que permita assumir com segurança o estado real do PostgreSQL.

**Não executar:**
- `prisma migrate dev`;
- `prisma db push` contra produção;
- `prisma migrate reset`;
- qualquer reset do banco;
- `migrate deploy` automático no build do Vercel.

A tela **Homologação e Segurança** agora verifica, somente por leitura:
- tabelas clínicas esperadas;
- colunas aditivas esperadas;
- presença de `_prisma_migrations`;
- conexão PostgreSQL;
- requisitos runtime;
- Stripe/Asaas quando habilitados;
- remetente EMAIL para redefinição de senha.

## Ordem clínica de referência

1. `20260902090000_add_versioned_clinical_record`
2. `20260902193000_add_specialized_clinical_core`
3. `20260903061000_chat2_odontogram_periodontogram`
4. `20260903100000_chat3_treatment_plan_versioning`
5. `20260903143000_operational_alert_resolution`
6. `20260903_chat4_clinical_documents`
7. `20260903_chat5_clinical_files`
8. `manual-migrations/20260902_chat6_surgery_implant_prosthesis.sql`

Essa ordem é **referência**, não autorização para executar às cegas. Primeiro usamos a inspeção somente leitura do ambiente.

## Stripe — decisão 5787

Nesta etapa, o DentalPos One usa PaymentIntent direto. O webhook trata:
- `payment_intent.succeeded`;
- `payment_intent.payment_failed`.

Checkout/Subscription ficam fora deste endpoint até existir domínio separado de assinatura SaaS. O model `Payment` clínico não deve virar assinatura do DentalPos/REVAH.

## Vercel / API

Frontend e backend permanecem em projetos separados. `VITE_API_URL` continua podendo definir explicitamente a API.

Como proteção contra o erro `Failed to fetch`, o `vite.config.ts` não envia `localhost` em build Vercel:
- a branch `chat8-5787-integracao` usa o alias estável do backend preview;
- `main` usa o backend de produção;
- desenvolvimento local continua em `http://localhost:3000/api`.

O backend mantém `CORS_ORIGIN` e aceita somente os aliases Vercel oficiais do frontend DentalPos necessários ao piloto.

Não colocar segredo no Git. `DATABASE_URL`, `JWT_SECRET`, `TENANT_SECRET_MASTER_KEY`, credenciais de pagamento e credenciais REVAH ficam somente no ambiente seguro.

## Gates antes de merge em main

1. build backend = OK;
2. build frontend = OK;
3. push somente na `chat8-5787-integracao`;
4. preview Vercel backend = READY;
5. preview Vercel frontend = READY;
6. `/health` e `/ready` do backend = OK;
7. login e `/auth/me` funcionais;
8. `VITE_API_URL` + CORS corretos;
9. Homologação mostra o estado real do schema;
10. migration do banco, se necessária, feita de forma controlada;
11. smoke test: paciente, agenda, prontuário, financeiro, REVAH, Sales/CRM, estoque e RH;
12. só então merge da PR #1 em `main`.

## Regra do Chat 8

Nenhuma etapa de código desta consolidação altera `main` diretamente e nenhuma etapa automática altera o banco.


## PostgreSQL / pooler

O cliente Prisma detecta conexão típica de pooler (`pooler` no host, porta `6543` ou `pgbouncer=true`) e aplica `pgbouncer=true` + `connection_limit=1` somente em runtime, sem alterar ou imprimir `DATABASE_URL`. Isso endereça o erro de prepared statement duplicado observado no preview.
