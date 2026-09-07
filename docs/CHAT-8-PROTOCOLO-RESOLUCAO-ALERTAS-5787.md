# Chat 8 — Protocolo de Resolução de Alertas 5787

Integração central dos blocos de alertas financeiros (Chat 3) e laboratoriais (Chat 6).

## Regra operacional

- Pendência real não é apagada manualmente.
- Financeiro: baixa/pagamento/cancelamento/renegociação real resolve a origem e registra protocolo.
- Laboratório: recebimento/entrega/conclusão/cancelamento/renegociação real resolve a origem e registra protocolo.
- Central de Alertas: `Resolver na origem` abre o módulo correspondente.
- `Dispensar` é reservado a alerta improcedente, duplicado, demonstrativo ou não aplicável e exige motivo.
- A resolução é preservada para toda a equipe no backend e gera `RES-5787-XXXXXX`.
- Nenhum registro de origem é deletado pela Central de Alertas.

## Persistência

- `FinancialAlertResolution`: estado específico do domínio financeiro.
- `LaboratoryWorkHistory`: estado específico do domínio laboratorial.
- `OperationalAlertResolution`: protocolo transversal da Central de Alertas e histórico de dispensa/resolução para a equipe.

O registro transversal não substitui o histórico do domínio. Ele fornece identificação única e sincronização da Central.

## Rotas adicionadas

- `GET /api/operational-alert-resolutions`
- `POST /api/operational-alert-resolutions/dismiss`
- `GET /api/financial-alert-resolutions`
- `POST /api/financial-alert-resolutions/in-progress`
- `POST /api/financial-alert-resolutions/resolve`

As rotas laboratoriais do Chat 6 permanecem em `specialtyClinicalRoutes`.

## Banco

Migration aditiva preparada em:
`backend/prisma/migrations/20260903143000_operational_alert_resolution/migration.sql`

Não foi executada durante o desenvolvimento.

## Validação nesta sessão

- 468 arquivos TS/TSX analisados sem erro de parsing/transpilação.
- 0 imports relativos quebrados.
- schema Prisma: 76 models, sem nome duplicado e chaves balanceadas.
- `npm ci --offline` não pôde completar porque `zod-3.25.76.tgz` não estava no cache local; por isso `prisma validate`, geração do client e builds completos precisam ser repetidos no ambiente de homologação com dependências instaláveis.
