# Checklist de release DentalPos One

1. Branch de release limpa e build frontend/backend sem erros.
2. Banco de homologação separado de produção.
3. Alterações Prisma revisadas e estratégia de migração definida.
4. `npm run preflight:release` sem pendência crítica no ambiente que será promovido.
5. `/health` e `/ready` respondendo corretamente.
6. Smoke test: login, paciente, prontuário, agenda, laboratório, orçamento, baixa financeira, backoffice, RH e REVAH simulado.
7. Teste de permissões com perfis diferentes.
8. Teste de isolamento entre pelo menos duas clínicas/tenants.
9. Webhooks externos validados com assinatura/token em sandbox.
10. Backup real fora do servidor principal.
11. Restauração testada em base separada e registrada.
12. Feature flag liberada primeiro somente para clínica interna/piloto.
13. Observar logs, auditoria, request IDs e erros antes de ampliar rollout.
14. Promover a mesma imagem/build homologada para produção.
15. Nunca copiar secrets de staging para produção nem versionar `.env`.
