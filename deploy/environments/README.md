# DentalPos One - estratégia de releases

- development: desenvolvimento interno, banco e storage próprios.
- staging: homologação; recebe migrations e build antes da produção.
- pilot: clínicas selecionadas por feature flags.
- production: versão estável para todos os tenants habilitados.

Nunca compartilhar DATABASE_URL, buckets de teste ou chaves entre staging e production.
Toda migration deve passar por backup + staging + smoke test antes de `prisma migrate deploy` em produção.
Rollout funcional deve ser desacoplado do deploy por `TenantFeatureFlag`.
