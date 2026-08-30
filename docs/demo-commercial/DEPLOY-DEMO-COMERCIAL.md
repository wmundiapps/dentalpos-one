# Deploy único — DentalPos One Demo Comercial

## Repositório
Use o mesmo repositório `wmundiapps/dentalpos-one`. Não duplique a Agenda nem o banco de dados.

## Endereços públicos planejados
- Login: `https://www.wmundi.com/dentalposone/`
- Cadastro da demo: `https://www.wmundi.com/dentalposone/demo`
- Agendamento online: `https://www.wmundi.com/dentalposone/agendamento-online?clinicId=ID_DA_CLINICA`
- API pública: `https://www.wmundi.com/dentalposone/api`

## Regras de publicação
1. Banco PostgreSQL persistente e separado do código.
2. Backup automático habilitado e restauração testada antes de clientes reais.
3. `ALLOW_PUBLIC_REGISTRATION=false`.
4. `ENABLE_DEMO_REGISTRATION=true`.
5. CORS restrito ao domínio oficial.
6. TLS/HTTPS obrigatório.
7. O proxy deve servir SPA em `/dentalposone/` e encaminhar `/dentalposone/api/` para `/api/` do backend.
8. Nunca publicar `.env`, `DATABASE_URL`, `JWT_SECRET`, chaves de pagamentos ou credenciais de clientes no GitHub.

## Frontend
Na compilação:
`VITE_API_URL=https://www.wmundi.com/dentalposone/api`

Opcional:
`VITE_SALES_URL=mailto:contato@dentalpos.com.br?subject=Quero%20contratar%20o%20DentalPos%20One`

## Backend
Variáveis não secretas da demo:
- `ENABLE_DEMO_REGISTRATION=true`
- `DEMO_DEFAULT_DAYS=30`
- `DEMO_GRACE_DAYS=7`
- `DEMO_DEFAULT_MODULES=agenda,patients`
- `DEMO_TERMS_VERSION=2026-08-30`

As demais variáveis seguras já exigidas pelo DentalPos One continuam obrigatórias.

## Sem migração
Este bloco usa `Clinic.plan` e `TenantFeatureFlag`, que já existem. Não cria tabela, não recria banco e não exige migração de schema.

## Validação
O instalador executa:
- verificação do SHA seguro;
- checkpoint remoto;
- TypeScript do backend sem `prisma generate`;
- build completo do frontend;
- `git diff --check`;
- commit único;
- push único somente depois de todos os testes passarem.
